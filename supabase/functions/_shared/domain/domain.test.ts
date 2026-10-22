import { describe, expect, it } from "vitest";
import {
  generateAvailability,
  occupiedInterval,
  overlaps,
  validateStartInstant,
  type AvailabilityInput,
  type BusinessHoursRule,
} from "./availability.ts";
import { formatPhoneForDisplay, normalizeIsraeliMobile } from "./phone.ts";
import { canCustomerCancel, reminderTimeFor } from "./policy.ts";
import { formatShekels, quote } from "./pricing.ts";
import { createBookingRequestSchema, customerDetailsSchema } from "./schemas.ts";
import {
  HOUR_MS,
  MINUTE_MS,
  addDaysToLocalDate,
  startOfLocalDayUtc,
  toZonedParts,
  zonedWallTimeToUtc,
} from "./time.ts";

const T = (iso: string) => new Date(iso);

// Sun–Thu 09:00–17:00, Fri 09:00–14:00, Sat closed (test fixture, not client data).
const hours: BusinessHoursRule[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  isOpen: weekday !== 6,
  openMinutes: 9 * 60,
  closeMinutes: weekday === 5 ? 14 * 60 : 17 * 60,
}));

function input(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    dates: ["2026-11-02"], // Monday
    durationMinutes: 75,
    hours,
    breaks: [],
    blocked: [],
    busy: [],
    settings: { slotIntervalMinutes: 15, bufferMinutes: 0, minNoticeMinutes: 0, bookingHorizonDays: 60 },
    now: T("2026-10-22T09:00:00Z"),
    ...overrides,
  };
}

const times = (inp: AvailabilityInput) => generateAvailability(inp)[0]!.slots.map((s) => s.time);

describe("timezone (Asia/Jerusalem)", () => {
  it("converts summer (IDT, UTC+3) and winter (IST, UTC+2) wall times", () => {
    expect(zonedWallTimeToUtc("2026-10-22", 10 * 60)?.toISOString()).toBe("2026-10-22T07:00:00.000Z");
    expect(zonedWallTimeToUtc("2026-11-01", 10 * 60)?.toISOString()).toBe("2026-11-01T08:00:00.000Z");
  });

  it("returns null for wall times skipped by the spring-forward transition", () => {
    // DST starts Friday 2026-03-27 at 02:00 → 03:00
    expect(zonedWallTimeToUtc("2026-03-27", 2 * 60 + 30)).toBeNull();
    expect(zonedWallTimeToUtc("2026-03-27", 3 * 60)?.toISOString()).toBe("2026-03-27T00:00:00.000Z");
  });

  it("picks the earlier instant for ambiguous fall-back wall times", () => {
    // DST ends Sunday 2026-10-25 at 02:00 → 01:00
    expect(zonedWallTimeToUtc("2026-10-25", 90)?.toISOString()).toBe("2026-10-24T22:30:00.000Z");
  });

  it("round-trips instants into local parts with Sunday = 0", () => {
    const p = toZonedParts(T("2026-10-24T21:30:00Z")); // Sunday 00:30 IDT
    expect(p).toMatchObject({ date: "2026-10-25", minutesOfDay: 30, weekday: 0 });
    expect(startOfLocalDayUtc("2026-10-25").toISOString()).toBe("2026-10-24T21:00:00.000Z");
    expect(addDaysToLocalDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("keeps 10:00 local the same wall time across the DST change", () => {
    const before = generateAvailability(input({ dates: ["2026-10-22"], durationMinutes: 25, now: T("2026-10-20T00:00:00Z") }));
    const after = generateAvailability(input({ dates: ["2026-10-26"], durationMinutes: 25, now: T("2026-10-20T00:00:00Z") }));
    expect(before[0]!.slots[4]).toMatchObject({ time: "10:00", startsAt: "2026-10-22T07:00:00.000Z" });
    expect(after[0]!.slots[4]).toMatchObject({ time: "10:00", startsAt: "2026-10-26T08:00:00.000Z" });
  });
});

describe("availability engine", () => {
  it("does not offer a slot that would end after closing (75 min at 16:00 with 17:00 close)", () => {
    const t = times(input());
    expect(t).toContain("15:45");
    expect(t).not.toContain("16:00");
    expect(t.at(-1)).toBe("15:45");
  });

  it("generates slots at the configured interval from opening time", () => {
    expect(times(input({ durationMinutes: 25 })).slice(0, 3)).toEqual(["09:00", "09:15", "09:30"]);
  });

  it("returns no slots on closed weekdays and honours Friday hours", () => {
    expect(times(input({ dates: ["2026-11-07"] }))).toEqual([]); // Saturday
    expect(times(input({ dates: ["2026-11-06"], durationMinutes: 60 })).at(-1)).toBe("13:00");
  });

  it("excludes slots overlapping existing appointments even with different start times", () => {
    const busy = [{ start: T("2026-11-02T09:00:00Z"), end: T("2026-11-02T10:15:00Z") }]; // 11:00–12:15 local
    const t = times(input({ durationMinutes: 25, busy }));
    expect(t).toContain("10:30"); // ends 10:55
    expect(t).not.toContain("10:45"); // ends 11:10 → overlaps
    expect(t).not.toContain("11:00");
    expect(t).not.toContain("12:00");
    expect(t).toContain("12:15");
  });

  it("applies the buffer after both new and existing appointments", () => {
    const busy = [occupiedInterval(T("2026-11-02T09:00:00Z"), 60, 15)]; // 11:00–12:00 + 15
    const t = times(input({ durationMinutes: 25, busy, settings: { ...input().settings, bufferMinutes: 15 } }));
    expect(t).toContain("10:15"); // 10:15–10:40 + 15 = 10:55
    expect(t).not.toContain("10:30"); // 10:30–10:55 + 15 = 11:10
    expect(t).not.toContain("12:00");
    expect(t).toContain("12:15");
  });

  it("excludes recurring breaks", () => {
    const breaks = [{ weekday: null, startMinutes: 13 * 60, endMinutes: 13 * 60 + 30 }];
    const t = times(input({ durationMinutes: 25, breaks }));
    expect(t).toContain("12:30"); // ends 12:55
    expect(t).not.toContain("12:45");
    expect(t).not.toContain("13:15");
    expect(t).toContain("13:30");
  });

  it("excludes blocked dates and partial closures", () => {
    const fullDay = [{ start: startOfLocalDayUtc("2026-11-02"), end: startOfLocalDayUtc("2026-11-03") }];
    expect(times(input({ blocked: fullDay }))).toEqual([]);
    const afternoon = [{ start: T("2026-11-02T12:00:00Z"), end: T("2026-11-02T15:00:00Z") }]; // 14:00–17:00
    const t = times(input({ durationMinutes: 25, blocked: afternoon }));
    expect(t.at(-1)).toBe("13:30");
  });

  it("allows same-day bookings for future slots only, and tomorrow without restriction", () => {
    const now = T("2026-11-02T10:10:00Z"); // 12:10 local
    const today = times(input({ durationMinutes: 25, now }));
    expect(today[0]).toBe("12:15");
    const tomorrow = times(input({ dates: ["2026-11-03"], durationMinutes: 25, now }));
    expect(tomorrow[0]).toBe("09:00");
  });

  it("respects minimum notice and booking horizon settings", () => {
    const now = T("2026-11-02T10:10:00Z");
    const settings = { ...input().settings, minNoticeMinutes: 60 };
    expect(times(input({ durationMinutes: 25, now, settings }))[0]).toBe("13:15");
    const horizon = { ...input().settings, bookingHorizonDays: 5 };
    expect(times(input({ dates: ["2026-10-27"], settings: horizon }))).not.toEqual([]);
    expect(times(input({ dates: ["2026-10-28"], settings: horizon }))).toEqual([]);
  });

  it("revalidates a specific instant with a reason", () => {
    const base = input();
    expect(validateStartInstant(T("2026-11-02T14:00:00Z"), base)).toBe("outside_hours"); // 16:00 + 75
    expect(validateStartInstant(T("2026-11-02T13:45:00Z"), base)).toMatchObject({ time: "15:45" });
    expect(validateStartInstant(T("2026-11-02T13:45:30Z"), base)).toBe("invalid_time");
    expect(validateStartInstant(T("2026-10-01T08:00:00Z"), base)).toBe("past");
  });

  it("treats touching intervals as non-overlapping", () => {
    const a = { start: T("2026-11-02T08:00:00Z"), end: T("2026-11-02T09:00:00Z") };
    const b = { start: T("2026-11-02T09:00:00Z"), end: T("2026-11-02T10:00:00Z") };
    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(a, { ...b, start: T("2026-11-02T08:59:00Z") })).toBe(true);
  });
});

describe("pricing", () => {
  it("eyebrow shaping is ₪70 / 25 min", () => {
    expect(quote({ priceAgorot: 7000, durationMinutes: 25 })).toEqual({ totalPriceAgorot: 7000, durationMinutes: 25 });
  });

  it("brow lamination with tint is ₪230 and still 75 minutes", () => {
    const tint = { priceAgorot: 1000, extraDurationMinutes: 0 };
    expect(quote({ priceAgorot: 22000, durationMinutes: 75 }, [tint])).toEqual({
      totalPriceAgorot: 23000,
      durationMinutes: 75,
    });
  });

  it("piercing location does not change price or duration unless configured", () => {
    const piercing = { priceAgorot: 15000, durationMinutes: 15 };
    expect(quote(piercing, [], { priceDeltaAgorot: 0, durationDeltaMinutes: 0 })).toEqual({
      totalPriceAgorot: 15000,
      durationMinutes: 15,
    });
    expect(quote(piercing, [], { priceDeltaAgorot: 2000, durationDeltaMinutes: 5 })).toEqual({
      totalPriceAgorot: 17000,
      durationMinutes: 20,
    });
  });

  it("formats shekels", () => {
    expect(formatShekels(23000)).toContain("₪230");
    expect(formatShekels(1050)).toContain("₪10.50");
  });
});

describe("cancellation cutoff (24h, absolute timestamps)", () => {
  const start = T("2026-11-02T08:00:00Z");
  const at = (msBefore: number) => new Date(start.getTime() - msBefore);
  it("allows 25 hours before", () => expect(canCustomerCancel(start, "confirmed", at(25 * HOUR_MS))).toBe(true));
  it("allows exactly 24 hours before", () => expect(canCustomerCancel(start, "confirmed", at(24 * HOUR_MS))).toBe(true));
  it("denies 23h59m before", () =>
    expect(canCustomerCancel(start, "confirmed", at(24 * HOUR_MS - MINUTE_MS))).toBe(false));
  it("denies one millisecond inside the window", () =>
    expect(canCustomerCancel(start, "confirmed", at(24 * HOUR_MS - 1))).toBe(false));
  it("denies already cancelled or completed appointments", () => {
    expect(canCustomerCancel(start, "cancelled", at(48 * HOUR_MS))).toBe(false);
    expect(canCustomerCancel(start, "completed", at(48 * HOUR_MS))).toBe(false);
  });
  it("uses real elapsed time across the DST change, not calendar days", () => {
    // 2026-10-26 10:00 IST (08:00Z); 24h earlier is 2026-10-25 08:00Z = 11:00 IST... crossing fall-back
    const s = T("2026-10-26T08:00:00Z");
    expect(canCustomerCancel(s, "confirmed", T("2026-10-25T08:00:00Z"))).toBe(true);
    expect(canCustomerCancel(s, "confirmed", T("2026-10-25T08:00:01Z"))).toBe(false);
  });
});

describe("24-hour reminder scheduling", () => {
  it("schedules reminder_at = start − 24h", () => {
    expect(reminderTimeFor(T("2026-11-02T08:00:00Z"), T("2026-10-22T09:00:00Z"))?.toISOString()).toBe(
      "2026-11-01T08:00:00.000Z",
    );
  });
  it("does not schedule when booked after the reminder deadline", () => {
    expect(reminderTimeFor(T("2026-10-23T08:00:00Z"), T("2026-10-22T09:00:00Z"))).toBeNull();
    expect(reminderTimeFor(T("2026-10-23T08:00:00Z"), T("2026-10-22T08:00:00Z"))).toBeNull();
  });
});

describe("Israeli phone numbers", () => {
  it.each([
    ["054-123-4567", "+972541234567"],
    ["0541234567", "+972541234567"],
    ["+972 54 123 4567", "+972541234567"],
    ["972541234567", "+972541234567"],
    ["00972541234567", "+972541234567"],
    ["(052) 765-4321", "+972527654321"],
    ["٠٥٤١٢٣٤٥٦٧", "+972541234567"],
    ["058 111 2222", "+972581112222"],
  ])("normalises %s", (raw, e164) => expect(normalizeIsraeliMobile(raw)).toBe(e164));

  it.each(["", "12345", "02-1234567", "054123456", "05412345678", "+1 555 123 4567", "0571234567", "abc"])(
    "rejects %s",
    (raw) => expect(normalizeIsraeliMobile(raw)).toBeNull(),
  );

  it("formats for display", () => expect(formatPhoneForDisplay("+972541234567")).toContain("054-123-4567"));
});

describe("request validation", () => {
  it("accepts Arabic and English names and rejects junk", () => {
    expect(customerDetailsSchema.safeParse({ customerName: "دنيا أحمد", customerPhone: "0541234567" }).success).toBe(true);
    expect(customerDetailsSchema.safeParse({ customerName: "Dana O'Neil", customerPhone: "0541234567" }).success).toBe(true);
    expect(customerDetailsSchema.safeParse({ customerName: "1", customerPhone: "0541234567" }).success).toBe(false);
    expect(customerDetailsSchema.safeParse({ customerName: "<script>", customerPhone: "0541234567" }).success).toBe(false);
  });

  it("rejects bookings with a filled honeypot", () => {
    const base = {
      idempotencyKey: crypto.randomUUID(),
      serviceId: crypto.randomUUID(),
      startsAt: "2026-11-02T08:00:00.000Z",
      customerName: "دنيا",
      customerPhone: "0541234567",
    };
    expect(createBookingRequestSchema.safeParse(base).success).toBe(true);
    expect(createBookingRequestSchema.safeParse({ ...base, website: "http://spam" }).success).toBe(false);
  });
});

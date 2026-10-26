import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addonId,
  asRole,
  book,
  createTestDb,
  expectDbError,
  localDateIn,
  localInstant,
  locationId,
  openAllWeek,
  serviceId,
  sha256Hex,
  type Db,
} from "./harness";

let db: Db;
let svc: Record<string, string>;
let tint: string;
let ear: string;
let nose: string;
const ADMIN_ID = randomUUID();
const OTHER_USER_ID = randomUUID();

const H = 3_600_000;

async function outbox(appointmentId: string) {
  return db.query<{ event: string; recipient: string; status: string; scheduled_at: Date; dedupe_key: string }>(
    `select event, recipient, status, scheduled_at, dedupe_key from public.notification_outbox
      where appointment_id = $1 order by created_at, event`,
    [appointmentId],
  );
}

beforeAll(async () => {
  db = await createTestDb();
  svc = {
    shaping: await serviceId(db, "eyebrow-shaping"),
    lamination: await serviceId(db, "brow-lamination"),
    laminationFacial: await serviceId(db, "brow-lamination-facial"),
    shapingFacial: await serviceId(db, "eyebrow-shaping-facial"),
    piercing: await serviceId(db, "body-piercing"),
  };
  tint = await addonId(db, "eyebrow-tint");
  ear = await locationId(db, "ear");
  nose = await locationId(db, "nose");
  await db.query(`insert into auth.users (id, email) values ($1, 'owner@example.test'), ($2, 'other@example.test')`, [
    ADMIN_ID,
    OTHER_USER_ID,
  ]);
  await db.query(`insert into public.admin_profiles (user_id, display_name) values ($1, 'Owner')`, [ADMIN_ID]);
}, 120_000);

afterAll(async () => db?.close());

beforeEach(async () => {
  await db.exec(`
    delete from public.notification_outbox;
    delete from public.appointment_audit_log;
    delete from public.appointment_addons;
    delete from public.appointments;
    delete from public.blocked_time_ranges;
    delete from public.business_breaks;
    update public.business_settings set buffer_minutes = 0, min_notice_minutes = 0, booking_horizon_days = 60, slot_interval_minutes = 15;
    update public.notification_settings set owner_phone = '+972500000000', sms_enabled = true, reminder_max_lateness_minutes = 60;
  `);
  await openAllWeek(db, "08:00", "17:00");
});

describe("catalog (client-approved values)", () => {
  it("contains exactly the five services with exact prices and durations", async () => {
    const rows = await db.query(
      `select slug, category, name_ar, name_en, price_agorot, duration_minutes, location_required from public.services order by category, sort_order`,
    );
    expect(rows).toEqual([
      { slug: "eyebrow-shaping", category: "brows", name_ar: "تنظيف وتنسيق الحواجب + شارب", name_en: "Eyebrow Shaping", price_agorot: 7000, duration_minutes: 25, location_required: false },
      { slug: "brow-lamination", category: "brows", name_ar: "رفع الحواجب", name_en: "Brow Lamination", price_agorot: 22000, duration_minutes: 75, location_required: false },
      { slug: "brow-lamination-facial", category: "brows", name_ar: "رفع الحواجب مع إزالة شعر الوجه", name_en: "Brow Lamination + Facial Hair Removal", price_agorot: 25000, duration_minutes: 90, location_required: false },
      { slug: "eyebrow-shaping-facial", category: "brows", name_ar: "تنظيف الحواجب مع إزالة شعر الوجه", name_en: "Eyebrow Shaping + Facial Hair Removal", price_agorot: 10000, duration_minutes: 60, location_required: false },
      { slug: "body-piercing", category: "piercing", name_ar: "بيرسينغ الأذن أو الأنف أو السّرّة", name_en: "Body Piercing", price_agorot: 15000, duration_minutes: 15, location_required: true },
    ]);
    const [addon] = await db.query(`select price_agorot, extra_duration_minutes from public.service_addons where slug = 'eyebrow-tint'`);
    expect(addon).toEqual({ price_agorot: 1000, extra_duration_minutes: 0 });
    const locations = await db.query(`select code, price_delta_agorot, duration_delta_minutes from public.service_locations order by sort_order`);
    expect(locations).toEqual([
      { code: "ear", price_delta_agorot: 0, duration_delta_minutes: 0 },
      { code: "nose", price_delta_agorot: 0, duration_delta_minutes: 0 },
      { code: "navel", price_delta_agorot: 0, duration_delta_minutes: 0 },
    ]);
  });
});

describe("book_appointment", () => {
  it("confirms automatically and snapshots price and duration", async () => {
    const startsAt = await localInstant(db, localDateIn(3), "10:00");
    const { appointment, replayed } = await book(db, { service: svc.shaping!, startsAt });
    expect(replayed).toBe(false);
    expect(appointment.status).toBe("confirmed");
    expect(appointment.total_price_agorot).toBe(7000);
    expect(appointment.duration_minutes).toBe(25);
    expect(new Date(appointment.ends_at as string).getTime() - new Date(startsAt).getTime()).toBe(25 * 60_000);
    expect(appointment.reference).toMatch(/^DN-[A-Z2-9]{6}$/);
  });

  it("prices brow lamination + tint at ₪230 without extra duration", async () => {
    const startsAt = await localInstant(db, localDateIn(3), "10:00");
    const { appointment } = await book(db, { service: svc.lamination!, startsAt, addonIds: [tint] });
    expect(appointment.total_price_agorot).toBe(23000);
    expect(appointment.duration_minutes).toBe(75);
    const addons = await db.query(`select name_en, price_agorot, extra_duration_minutes from public.appointment_addons where appointment_id = $1`, [appointment.id]);
    expect(addons).toEqual([{ name_en: "Eyebrow Tint", price_agorot: 1000, extra_duration_minutes: 0 }]);
  });

  it("requires a piercing location which does not change price or duration", async () => {
    const startsAt = await localInstant(db, localDateIn(3), "11:00");
    await expectDbError(book(db, { service: svc.piercing!, startsAt }), "location_required");
    const { appointment } = await book(db, { service: svc.piercing!, startsAt, locationId: nose });
    expect(appointment).toMatchObject({ total_price_agorot: 15000, duration_minutes: 15, location_name_ar: "الأنف" });
  });

  it("rejects add-ons or locations that belong to another service", async () => {
    const startsAt = await localInstant(db, localDateIn(3), "11:00");
    await expectDbError(book(db, { service: svc.shaping!, startsAt, addonIds: [tint] }), "addon_unavailable");
    await expectDbError(book(db, { service: svc.shaping!, startsAt, locationId: ear }), "location_unavailable");
  });

  it("refuses a 75-minute service at 16:00 when the day ends at 17:00", async () => {
    const date = localDateIn(3);
    await expectDbError(book(db, { service: svc.lamination!, startsAt: await localInstant(db, date, "16:00") }), "slot_unavailable");
    await book(db, { service: svc.lamination!, startsAt: await localInstant(db, date, "15:45") });
  });

  it("prevents overlapping appointments even with different start times", async () => {
    const date = localDateIn(4);
    await book(db, { service: svc.lamination!, startsAt: await localInstant(db, date, "10:00") }); // 10:00–11:15
    await expectDbError(book(db, { service: svc.shaping!, startsAt: await localInstant(db, date, "11:00") }), "slot_unavailable");
    await expectDbError(book(db, { service: svc.shapingFacial!, startsAt: await localInstant(db, date, "09:30") }), "slot_unavailable");
    // touching is fine
    await book(db, { service: svc.shaping!, startsAt: await localInstant(db, date, "11:15") });
  });

  it("does not let cancelled appointments block availability", async () => {
    const startsAt = await localInstant(db, localDateIn(4), "12:00");
    const first = await book(db, { service: svc.shaping!, startsAt });
    await db.query(`select public.cancel_appointment_by_token($1)`, [sha256Hex(first.token)]);
    const second = await book(db, { service: svc.shaping!, startsAt });
    expect(second.appointment.status).toBe("confirmed");
  });

  it("is idempotent for repeated confirmation clicks", async () => {
    const startsAt = await localInstant(db, localDateIn(5), "09:00");
    const key = randomUUID();
    const a = await book(db, { service: svc.shaping!, startsAt, key });
    const b = await book(db, { service: svc.shaping!, startsAt, key, token: a.token });
    expect(b.replayed).toBe(true);
    expect(b.appointment.id).toBe(a.appointment.id);
    const [{ count }] = (await db.query<{ count: number }>(`select count(*)::int as count from public.appointments`)) as [{ count: number }];
    expect(count).toBe(1);
    expect((await outbox(a.appointment.id)).filter((o) => o.event === "booking_confirmed")).toHaveLength(1);
    await expectDbError(
      book(db, { service: svc.shaping!, startsAt: await localInstant(db, localDateIn(5), "13:00"), key }),
      "idempotency_conflict",
    );
  });

  it("allows bookings for tomorrow and short-notice bookings (no 24h minimum)", async () => {
    await openAllWeek(db, "00:00", "24:00");
    const tomorrow = await book(db, { service: svc.shaping!, startsAt: await localInstant(db, localDateIn(1), "10:00") });
    expect(tomorrow.appointment.status).toBe("confirmed");
    const [{ t }] = (await db.query<{ t: Date }>(
      `select date_trunc('hour', now()) + interval '2 hours' as t`,
    )) as [{ t: Date }];
    const soon = await book(db, { service: svc.piercing!, locationId: ear, startsAt: new Date(t).toISOString() });
    expect(soon.appointment.status).toBe("confirmed");
  });

  it("rejects past times, closed days, breaks, blocked ranges and beyond-horizon dates", async () => {
    await expectDbError(book(db, { service: svc.shaping!, startsAt: await localInstant(db, localDateIn(-1), "10:00") }), "slot_unavailable");

    const date = localDateIn(6);
    await db.query(`insert into public.business_breaks (weekday, start_time, end_time) values (null, '13:00', '13:30')`);
    await expectDbError(book(db, { service: svc.shaping!, startsAt: await localInstant(db, date, "12:45") }), "slot_unavailable");
    await book(db, { service: svc.shaping!, startsAt: await localInstant(db, date, "13:30") });

    await db.query(
      `insert into public.blocked_time_ranges (kind, starts_at, ends_at) values ('closure', $1, $2)`,
      [await localInstant(db, date, "15:00"), await localInstant(db, date, "17:00")],
    );
    await expectDbError(book(db, { service: svc.shaping!, startsAt: await localInstant(db, date, "15:30") }), "slot_unavailable");

    await db.query(`update public.business_hours set is_open = false where weekday = extract(dow from $1::date)`, [localDateIn(7)]);
    await expectDbError(book(db, { service: svc.shaping!, startsAt: await localInstant(db, localDateIn(7), "10:00") }), "slot_unavailable");

    await expectDbError(book(db, { service: svc.shaping!, startsAt: await localInstant(db, localDateIn(61), "10:00") }), "slot_unavailable");
  });

  it("enforces the configurable buffer between appointments", async () => {
    await db.query(`update public.business_settings set buffer_minutes = 15`);
    const date = localDateIn(8);
    await book(db, { service: svc.shaping!, startsAt: await localInstant(db, date, "10:00") }); // ends 10:25, occupied to 10:40
    await expectDbError(book(db, { service: svc.shaping!, startsAt: await localInstant(db, date, "10:30") }), "slot_unavailable");
    await book(db, { service: svc.shaping!, startsAt: await localInstant(db, date, "10:45") });
  });

  it("keeps historical prices when the catalog is edited later", async () => {
    const { appointment } = await book(db, { service: svc.shaping!, startsAt: await localInstant(db, localDateIn(3), "10:00") });
    await db.query(`update public.services set price_agorot = 9900, duration_minutes = 40 where id = $1`, [svc.shaping]);
    const [row] = await db.query(`select total_price_agorot, duration_minutes from public.appointments where id = $1`, [appointment.id]);
    expect(row).toEqual({ total_price_agorot: 7000, duration_minutes: 25 });
    await db.query(`update public.services set price_agorot = 7000, duration_minutes = 25 where id = $1`, [svc.shaping]);
  });

  it("refuses inactive services for online bookings", async () => {
    await db.query(`update public.services set is_active = false where id = $1`, [svc.shapingFacial]);
    await expectDbError(book(db, { service: svc.shapingFacial!, startsAt: await localInstant(db, localDateIn(3), "10:00") }), "service_unavailable");
    await db.query(`update public.services set is_active = true where id = $1`, [svc.shapingFacial]);
  });
});

describe("notifications outbox", () => {
  it("queues customer confirmation, owner notification and a reminder at exactly start − 24h", async () => {
    const startsAt = await localInstant(db, localDateIn(3), "10:00");
    const { appointment } = await book(db, { service: svc.shaping!, startsAt });
    const rows = await outbox(appointment.id);
    expect(rows.map((r) => `${r.event}:${r.recipient}:${r.status}`).sort()).toEqual([
      "booking_confirmed:customer:pending",
      "owner_new_booking:owner:pending",
      "reminder_24h:customer:pending",
    ]);
    const reminder = rows.find((r) => r.event === "reminder_24h")!;
    expect(new Date(startsAt).getTime() - new Date(reminder.scheduled_at).getTime()).toBe(24 * H);
  });

  it("does not schedule a 24h reminder when booked after the reminder deadline", async () => {
    await openAllWeek(db, "00:00", "24:00");
    const [{ t }] = (await db.query<{ t: Date }>(`select date_trunc('hour', now()) + interval '5 hours' as t`)) as [{ t: Date }];
    const { appointment } = await book(db, { service: svc.shaping!, startsAt: new Date(t).toISOString() });
    const events = (await outbox(appointment.id)).map((r) => r.event).sort();
    expect(events).toEqual(["booking_confirmed", "owner_new_booking"]);
  });
});

describe("customer cancellation by token", () => {
  async function bookIn(hoursAhead: number) {
    await openAllWeek(db, "00:00", "24:00");
    const [{ t }] = (await db.query<{ t: Date }>(
      `select date_trunc('hour', now()) + make_interval(hours => $1) as t`,
      [hoursAhead],
    )) as [{ t: Date }];
    return book(db, { service: svc.shaping!, startsAt: new Date(t).toISOString() });
  }

  it("allows cancellation with exactly 24 hours remaining", async () => {
    const { appointment, token } = await bookIn(48);
    const now = new Date(new Date(appointment.starts_at).getTime() - 24 * H).toISOString();
    const [{ r }] = (await db.query<{ r: { status: string } }>(`select public.cancel_appointment_by_token($1, $2) as r`, [
      sha256Hex(token),
      now,
    ])) as [{ r: { status: string } }];
    expect(r.status).toBe("cancelled");
  });

  it("allows 25 hours and denies 23h59m remaining", async () => {
    const a = await bookIn(48);
    const at25 = new Date(new Date(a.appointment.starts_at).getTime() - 25 * H).toISOString();
    const [view] = await db.query<{ r: { canCancel: boolean } }>(`select public.get_appointment_by_token($1, $2) as r`, [sha256Hex(a.token), at25]);
    expect(view!.r.canCancel).toBe(true);

    const b = await bookIn(72);
    const at2359 = new Date(new Date(b.appointment.starts_at).getTime() - 24 * H + 60_000).toISOString();
    await expectDbError(db.query(`select public.cancel_appointment_by_token($1, $2)`, [sha256Hex(b.token), at2359]), "cancellation_window_closed");
    const [view2] = await db.query<{ r: { canCancel: boolean } }>(`select public.get_appointment_by_token($1, $2) as r`, [sha256Hex(b.token), at2359]);
    expect(view2!.r.canCancel).toBe(false);
  });

  it("denies cancellation with less than 24h using the real clock", async () => {
    const { token } = await bookIn(5);
    await expectDbError(db.query(`select public.cancel_appointment_by_token($1)`, [sha256Hex(token)]), "cancellation_window_closed");
  });

  it("releases the slot, cancels the pending reminder and notifies the owner", async () => {
    const { appointment, token } = await bookIn(72);
    await db.query(`select public.cancel_appointment_by_token($1)`, [sha256Hex(token)]);
    const rows = await outbox(appointment.id);
    expect(rows.find((r) => r.event === "reminder_24h")!.status).toBe("cancelled");
    expect(rows.find((r) => r.event === "owner_cancellation")!.status).toBe("pending");
    const again = await book(db, { service: svc.shaping!, startsAt: appointment.starts_at });
    expect(again.appointment.status).toBe("confirmed");
    const [log] = await db.query(`select actor from public.appointment_audit_log where appointment_id = $1 and action = 'status_cancelled'`, [appointment.id]);
    expect(log).toEqual({ actor: "customer" });
  });

  it("rejects unknown tokens and never exposes the phone number", async () => {
    await expectDbError(db.query(`select public.get_appointment_by_token($1)`, [sha256Hex("nope")]), "not_found");
    const { token } = await bookIn(72);
    const [view] = await db.query<{ r: Record<string, unknown> }>(`select public.get_appointment_by_token($1) as r`, [sha256Hex(token)]);
    expect(JSON.stringify(view!.r)).not.toContain("+97254");
    expect(view!.r.phoneLast3).toBe("567");
  });
});

describe("administrator operations", () => {
  it("requires an admin for admin RPCs", async () => {
    const { appointment } = await book(db, { service: svc.shaping!, startsAt: await localInstant(db, localDateIn(3), "10:00") });
    await expectDbError(asRole(db, "authenticated", `select public.admin_cancel_appointment($1)`, [appointment.id], OTHER_USER_ID), "forbidden");
    await expectDbError(asRole(db, "anon", `select public.admin_cancel_appointment($1)`, [appointment.id]), "permission denied");
  });

  it("cancels within 24 hours and notifies the customer", async () => {
    await openAllWeek(db, "00:00", "24:00");
    const [{ t }] = (await db.query<{ t: Date }>(`select date_trunc('hour', now()) + interval '3 hours' as t`)) as [{ t: Date }];
    const { appointment } = await book(db, { service: svc.shaping!, startsAt: new Date(t).toISOString() });
    const [row] = await asRole<{ status: string; cancelled_by: string }>(
      db, "authenticated", `select (public.admin_cancel_appointment($1, 'owner sick')).*`, [appointment.id], ADMIN_ID,
    );
    expect(row).toMatchObject({ status: "cancelled", cancelled_by: "admin" });
    expect((await outbox(appointment.id)).some((r) => r.event === "cancelled_by_owner" && r.status === "pending")).toBe(true);
  });

  it("reschedules, moves the reminder and notifies the customer", async () => {
    const startsAt = await localInstant(db, localDateIn(3), "10:00");
    const { appointment } = await book(db, { service: svc.shaping!, startsAt });
    const newStart = await localInstant(db, localDateIn(4), "12:00");
    await asRole(db, "authenticated",
      `select public.admin_update_appointment($1, $2, $3, '{}'::uuid[], null, 'دنيا اختبار', '+972541234567', null, false, true)`,
      [appointment.id, newStart, svc.shaping], ADMIN_ID);
    const rows = await outbox(appointment.id);
    const reminders = rows.filter((r) => r.event === "reminder_24h");
    expect(reminders.map((r) => r.status).sort()).toEqual(["cancelled", "pending"]);
    const pending = reminders.find((r) => r.status === "pending")!;
    expect(new Date(newStart).getTime() - new Date(pending.scheduled_at).getTime()).toBe(24 * H);
    expect(rows.some((r) => r.event === "appointment_changed")).toBe(true);
    const [log] = await db.query(`select actor, actor_user_id from public.appointment_audit_log where appointment_id = $1 and action = 'updated'`, [appointment.id]);
    expect(log).toEqual({ actor: "admin", actor_user_id: ADMIN_ID });
  });

  it("detects conflicts when rescheduling", async () => {
    const date = localDateIn(5);
    await book(db, { service: svc.lamination!, startsAt: await localInstant(db, date, "10:00") });
    const { appointment } = await book(db, { service: svc.shaping!, startsAt: await localInstant(db, date, "14:00") });
    await expectDbError(
      asRole(db, "authenticated",
        `select public.admin_update_appointment($1, $2, $3, '{}'::uuid[], null, 'x y', '+972541234567', null, true, true)`,
        [appointment.id, await localInstant(db, date, "10:30"), svc.shaping], ADMIN_ID),
      "slot_unavailable",
    );
  });

  it("marks completed and keeps cancelled history", async () => {
    const { appointment } = await book(db, { service: svc.shaping!, startsAt: await localInstant(db, localDateIn(3), "10:00") });
    const [row] = await asRole<{ status: string }>(db, "authenticated",
      `select (public.admin_set_appointment_status($1, 'completed')).*`, [appointment.id], ADMIN_ID);
    expect(row!.status).toBe("completed");
    expect((await outbox(appointment.id)).find((r) => r.event === "reminder_24h")!.status).toBe("cancelled");
  });

  it("lets the admin book outside hours only with an explicit override, never overlapping", async () => {
    const date = localDateIn(3);
    const late = await localInstant(db, date, "18:00");
    await expectDbError(book(db, { service: svc.shaping!, startsAt: late, source: "admin" }), "slot_unavailable");
    const { appointment } = await book(db, { service: svc.shaping!, startsAt: late, source: "admin", override: true, notify: false });
    const events = (await outbox(appointment.id)).map((r) => r.event);
    expect(events).not.toContain("booking_confirmed"); // notify=false
    expect(events).not.toContain("owner_new_booking"); // owner created it herself
    await expectDbError(book(db, { service: svc.shaping!, startsAt: late, source: "admin", override: true }), "slot_unavailable");
  });
});

describe("settings defaults", () => {
  it("defaults to a 10-minute break between appointments", async () => {
    const [row] = await db.query<{ d: string }>(
      `select column_default as d from information_schema.columns where table_name = 'business_settings' and column_name = 'buffer_minutes'`,
    );
    expect(row!.d).toBe("10");
  });
});

describe("monthly revenue (admin)", () => {
  type Row = { month: string; earned_agorot: string; expected_agorot: string; appointments: number };

  it("sums earned (past) and expected (upcoming) per Israel month, excluding cancellations", async () => {
    await openAllWeek(db, "00:00", "24:00");
    const [{ past, future }] = (await db.query<{ past: Date; future: Date }>(
      `select date_trunc('hour', now()) - interval '2 hours' as past, date_trunc('hour', now()) + interval '3 hours' as future`,
    )) as [{ past: Date; future: Date }];
    await book(db, { service: svc.lamination!, addonIds: [tint], startsAt: new Date(past).toISOString(), source: "admin", override: true, notify: false }); // ₪230 earned
    await book(db, { service: svc.shaping!, startsAt: new Date(future).toISOString() }); // ₪70 expected
    const cancelled = await book(db, { service: svc.shapingFacial!, startsAt: await localInstant(db, localDateIn(2), "10:00") });
    await db.query(`select public.cancel_appointment_by_token($1)`, [sha256Hex(cancelled.token)]);

    const rows = await asRole<Row>(db, "authenticated", `select * from public.admin_monthly_revenue(12)`, [], ADMIN_ID);
    expect(rows).toHaveLength(12);
    const total = (k: "earned_agorot" | "expected_agorot") => rows.reduce((s, r) => s + Number(r[k]), 0);
    expect(total("earned_agorot")).toBe(23000);
    expect(total("expected_agorot")).toBe(7000);
    expect(rows.reduce((s, r) => s + r.appointments, 0)).toBe(2);
    // chronological, ending with the current Israel month
    const [{ m }] = (await db.query<{ m: string }>(
      `select to_char(date_trunc('month', now() at time zone 'Asia/Jerusalem'), 'YYYY-MM') as m`,
    )) as [{ m: string }];
    expect(String(rows.at(-1)!.month).slice(0, 7) === m || new Date(rows.at(-1)!.month).toISOString().slice(0, 7) === m).toBe(true);
  });

  it("is admin-only", async () => {
    await expectDbError(asRole(db, "authenticated", `select * from public.admin_monthly_revenue()`, [], OTHER_USER_ID), "forbidden");
    await expectDbError(asRole(db, "anon", `select * from public.admin_monthly_revenue()`), "permission denied");
  });
});

describe("row level security", () => {
  it("hides appointments and personal data from the public", async () => {
    await book(db, { service: svc.shaping!, startsAt: await localInstant(db, localDateIn(3), "10:00") });
    await expectDbError(asRole(db, "anon", `select * from public.appointments`), "permission denied");
    await expectDbError(asRole(db, "anon", `select * from public.notification_outbox`), "permission denied");
    await expectDbError(asRole(db, "anon", `select * from public.notification_settings`), "permission denied");
    await expectDbError(asRole(db, "anon", `select * from public.blocked_time_ranges`), "permission denied");
    expect(await asRole(db, "authenticated", `select * from public.appointments`, [], OTHER_USER_ID)).toEqual([]);
    expect((await asRole(db, "authenticated", `select * from public.appointments`, [], ADMIN_ID)).length).toBe(1);
  });

  it("lets anyone read the active catalog but not modify it", async () => {
    expect((await asRole(db, "anon", `select id from public.services`)).length).toBe(5);
    await expectDbError(asRole(db, "anon", `update public.services set price_agorot = 1`), "permission denied");
    const updated = await asRole(db, "authenticated", `update public.services set price_agorot = 1 returning id`, [], OTHER_USER_ID);
    expect(updated).toEqual([]);
  });

  it("blocks direct booking and token functions for public roles", async () => {
    await expectDbError(
      asRole(db, "anon", `select public.book_appointment(gen_random_uuid(), repeat('a',64), gen_random_uuid(), '{}', null, now(), 'x', '+972541234567')`),
      "permission denied",
    );
    await expectDbError(asRole(db, "anon", `select public.cancel_appointment_by_token('x')`), "permission denied");
    await expectDbError(asRole(db, "authenticated", `select public.claim_due_notifications()`, [], ADMIN_ID), "permission denied");
  });

  it("allows admins to manage availability", async () => {
    await asRole(db, "authenticated", `insert into public.business_breaks (weekday, start_time, end_time) values (1, '12:00', '12:30')`, [], ADMIN_ID);
    await expectDbError(
      asRole(db, "authenticated", `insert into public.business_breaks (weekday, start_time, end_time) values (1, '12:00', '12:30')`, [], OTHER_USER_ID),
      "row-level security",
    );
  });
});

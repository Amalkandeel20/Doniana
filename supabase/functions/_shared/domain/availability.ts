import {
  MINUTE_MS,
  addDaysToLocalDate,
  localDateDiffDays,
  toZonedParts,
  weekdayOfLocalDate,
  zonedWallTimeToUtc,
  type LocalDate,
} from "./time.ts";

export interface BusinessHoursRule {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  isOpen: boolean;
  /** Minutes since local midnight. */
  openMinutes: number;
  closeMinutes: number;
}

export interface RecurringBreak {
  /** null = applies to every weekday */
  weekday: number | null;
  startMinutes: number;
  endMinutes: number;
}

export interface Interval {
  start: Date;
  end: Date;
}

export interface SchedulingSettings {
  slotIntervalMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  bookingHorizonDays: number;
}

export interface AvailabilityInput {
  dates: LocalDate[];
  durationMinutes: number;
  hours: BusinessHoursRule[];
  breaks: RecurringBreak[];
  /** Days off, holidays, partial closures and custom blocks (absolute instants). */
  blocked: Interval[];
  /** Existing non-cancelled appointments; `end` must already include their trailing buffer. */
  busy: Interval[];
  settings: SchedulingSettings;
  now: Date;
}

export interface Slot {
  startsAt: string;
  endsAt: string;
  /** Local wall time "HH:MM" in Asia/Jerusalem. */
  time: string;
}

export interface DayAvailability {
  date: LocalDate;
  slots: Slot[];
}

export const overlaps = (a: Interval, b: Interval): boolean =>
  a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();

const minutesOverlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

/** The occupied interval of an appointment: its service time plus the trailing buffer. */
export function occupiedInterval(start: Date, durationMinutes: number, bufferMinutes: number): Interval {
  return {
    start,
    end: new Date(start.getTime() + (durationMinutes + bufferMinutes) * MINUTE_MS),
  };
}

export function lastBookableDate(now: Date, horizonDays: number): LocalDate {
  return addDaysToLocalDate(toZonedParts(now).date, horizonDays);
}

export type SlotRejection =
  | "invalid_time"
  | "past"
  | "beyond_horizon"
  | "closed"
  | "outside_hours"
  | "break"
  | "blocked"
  | "conflict";

/**
 * Checks one candidate start time against every scheduling rule. This is the same rule set the
 * database function `book_appointment()` enforces; the exclusion constraint is the final guard.
 */
export function checkSlot(
  date: LocalDate,
  startMinutes: number,
  input: Omit<AvailabilityInput, "dates">,
): SlotRejection | Slot {
  const { durationMinutes, hours, breaks, blocked, busy, settings, now } = input;
  const start = zonedWallTimeToUtc(date, startMinutes);
  if (!start) return "invalid_time";
  const end = new Date(start.getTime() + durationMinutes * MINUTE_MS);

  if (start.getTime() < now.getTime() + settings.minNoticeMinutes * MINUTE_MS) return "past";
  if (localDateDiffDays(lastBookableDate(now, settings.bookingHorizonDays), date) > 0) return "beyond_horizon";

  const weekday = weekdayOfLocalDate(date);
  const rule = hours.find((h) => h.weekday === weekday);
  if (!rule || !rule.isOpen) return "closed";
  const endMinutes = startMinutes + durationMinutes;
  if (startMinutes < rule.openMinutes || endMinutes > rule.closeMinutes) return "outside_hours";

  for (const br of breaks) {
    if (br.weekday !== null && br.weekday !== weekday) continue;
    if (minutesOverlap(startMinutes, endMinutes, br.startMinutes, br.endMinutes)) return "break";
  }

  const service = { start, end };
  if (blocked.some((b) => overlaps(service, b))) return "blocked";

  const occupied = occupiedInterval(start, durationMinutes, settings.bufferMinutes);
  if (busy.some((b) => overlaps(occupied, b))) return "conflict";

  return {
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    time: `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`,
  };
}

export function generateAvailability(input: AvailabilityInput): DayAvailability[] {
  const { dates, durationMinutes, hours, settings } = input;
  if (durationMinutes <= 0) throw new Error("durationMinutes must be positive");
  const step = Math.max(5, settings.slotIntervalMinutes);

  return dates.map((date) => {
    const rule = hours.find((h) => h.weekday === weekdayOfLocalDate(date));
    const slots: Slot[] = [];
    if (rule?.isOpen) {
      for (let m = rule.openMinutes; m + durationMinutes <= rule.closeMinutes; m += step) {
        const result = checkSlot(date, m, input);
        if (typeof result !== "string") slots.push(result);
      }
    }
    return { date, slots };
  });
}

/** Finds the slot rejection reason for a specific instant (used to revalidate before booking). */
export function validateStartInstant(
  startsAt: Date,
  input: Omit<AvailabilityInput, "dates">,
): SlotRejection | Slot {
  const parts = toZonedParts(startsAt);
  if (startsAt.getUTCSeconds() !== 0 || startsAt.getUTCMilliseconds() !== 0) return "invalid_time";
  return checkSlot(parts.date, parts.minutesOfDay, input);
}

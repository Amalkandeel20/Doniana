// Timezone helpers built on Intl only, so the same code runs in Deno (Edge Functions),
// the browser and Node (Vitest). All business schedules are wall-clock times in
// Asia/Jerusalem; every stored instant is UTC.

export const BUSINESS_TIME_ZONE = "Asia/Jerusalem";
export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Local calendar date in YYYY-MM-DD form. */
export type LocalDate = string;

export interface ZonedParts {
  date: LocalDate;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** Minutes since local midnight. */
  minutesOfDay: number;
  /** 0 = Sunday … 6 = Saturday (Israeli week starts on Sunday). */
  weekday: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export function toZonedParts(instant: Date, timeZone = BUSINESS_TIME_ZONE): ZonedParts {
  const values: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  const year = values.year!;
  const month = values.month!;
  const day = values.day!;
  const hour = values.hour! % 24;
  const minute = values.minute!;
  return {
    date: `${pad(year, 4)}-${pad(month)}-${pad(day)}`,
    year,
    month,
    day,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/** Offset of `timeZone` from UTC at the given instant, in milliseconds. */
export function timeZoneOffsetMs(instant: Date, timeZone = BUSINESS_TIME_ZONE): number {
  const values: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(
    values.year!,
    values.month! - 1,
    values.day!,
    values.hour! % 24,
    values.minute!,
    values.second!,
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function parseLocalDate(date: LocalDate): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid local date: ${date}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new Error(`Invalid local date: ${date}`);
  }
  return { year, month, day };
}

export function isValidLocalDate(date: string): boolean {
  try {
    parseLocalDate(date);
    return true;
  } catch {
    return false;
  }
}

/**
 * Converts a wall-clock time on a local date to a UTC instant.
 * Returns null when the wall time does not exist (skipped by a DST spring-forward).
 * For ambiguous wall times (DST fall-back) the earlier instant is returned.
 */
export function zonedWallTimeToUtc(
  date: LocalDate,
  minutesOfDay: number,
  timeZone = BUSINESS_TIME_ZONE,
): Date | null {
  const { year, month, day } = parseLocalDate(date);
  const wallAsUtc = Date.UTC(year, month - 1, day, 0, minutesOfDay);
  const candidates = new Set<number>();
  for (const probeShift of [-DAY_MS / 2, 0, DAY_MS / 2]) {
    const offset = timeZoneOffsetMs(new Date(wallAsUtc + probeShift), timeZone);
    candidates.add(wallAsUtc - offset);
  }
  const matches = [...candidates]
    .filter((t) => {
      const p = toZonedParts(new Date(t), timeZone);
      return p.date === date && p.minutesOfDay === minutesOfDay;
    })
    .sort((a, b) => a - b);
  return matches.length ? new Date(matches[0]!) : null;
}

/** Start of the local day as a UTC instant (handles days whose midnight is skipped). */
export function startOfLocalDayUtc(date: LocalDate, timeZone = BUSINESS_TIME_ZONE): Date {
  for (let m = 0; m < 24 * 60; m += 15) {
    const t = zonedWallTimeToUtc(date, m, timeZone);
    if (t) return t;
  }
  throw new Error(`Could not resolve start of day for ${date}`);
}

export function addDaysToLocalDate(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(date);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function weekdayOfLocalDate(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function localDateDiffDays(from: LocalDate, to: LocalDate): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS,
  );
}

/** Parses "HH:MM" or "HH:MM:SS" into minutes since midnight. "24:00" is allowed as end of day. */
export function timeStringToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw new Error(`Invalid time: ${value}`);
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes > 24 * 60 || Number(match[2]) > 59) throw new Error(`Invalid time: ${value}`);
  return minutes;
}

export function minutesToTimeString(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

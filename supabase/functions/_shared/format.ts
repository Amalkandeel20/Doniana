// Deterministic Arabic date/time formatting for Israeli customers (Asia/Jerusalem, 24h clock,
// Western digits, dd/MM/yyyy). Used in SMS and in the UI so both always agree.
import { toZonedParts } from "./domain/time.ts";

export const ARABIC_WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;

const pad = (n: number) => String(n).padStart(2, "0");

export function formatDateAr(instant: Date): string {
  const p = toZonedParts(instant);
  return `${ARABIC_WEEKDAYS[p.weekday]} ${pad(p.day)}/${pad(p.month)}/${p.year}`;
}

export function formatTime(instant: Date): string {
  const p = toZonedParts(instant);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function formatDurationAr(minutes: number): string {
  if (minutes < 60) return `${minutes} دقيقة`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h === 1 ? "ساعة" : h === 2 ? "ساعتان" : `${h} ساعات`;
  return m ? `${hours} و${m} دقيقة` : hours;
}

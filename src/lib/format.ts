// UI formatting: shares the exact SMS formatting so the website and messages always agree.
export { formatDateAr, formatTime, formatDurationAr, ARABIC_WEEKDAYS } from "@shared/format.ts";
export { formatShekels } from "@shared/domain/pricing.ts";
export { formatPhoneForDisplay, normalizeIsraeliMobile } from "@shared/domain/phone.ts";

import { parseLocalDate, weekdayOfLocalDate } from "@shared/domain/time.ts";
import { ARABIC_WEEKDAYS } from "@shared/format.ts";

export function formatLocalDateShort(date: string): { weekday: string; day: number; month: number } {
  const { day, month } = parseLocalDate(date);
  return { weekday: ARABIC_WEEKDAYS[weekdayOfLocalDate(date)]!, day, month };
}

/** "https://www.instagram.com/name?igsh=…" → "@name": links copied from the app carry tracking junk. */
export function instagramHandle(url: string): string {
  try {
    const name = new URL(url).pathname.split("/").find(Boolean);
    return name ? `@${name}` : url;
  } catch {
    return url;
  }
}

export function whatsappLink(e164: string, text?: string): string {
  const digits = e164.replace(/\D/g, "");
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

import { HOUR_MS } from "./time.ts";

/** Client rule: customers may cancel only while at least 24 hours remain. */
export const CUSTOMER_CANCELLATION_CUTOFF_MS = 24 * HOUR_MS;
/** Reminders go out exactly 24 hours before the appointment start. */
export const REMINDER_LEAD_MS = 24 * HOUR_MS;

export type AppointmentStatus = "confirmed" | "cancelled" | "completed";

/** Uses absolute timestamps, never calendar-day differences. Exactly 24h remaining is allowed. */
export function canCustomerCancel(startsAt: Date, status: AppointmentStatus, now: Date): boolean {
  if (status !== "confirmed") return false;
  return startsAt.getTime() - now.getTime() >= CUSTOMER_CANCELLATION_CUTOFF_MS;
}

/**
 * reminder_at = appointment_start_utc − 24h. Returns null when that moment has already passed
 * at booking time, so no mislabelled "24-hour" reminder is ever scheduled.
 */
export function reminderTimeFor(startsAt: Date, now: Date): Date | null {
  const at = new Date(startsAt.getTime() - REMINDER_LEAD_MS);
  return at.getTime() > now.getTime() ? at : null;
}

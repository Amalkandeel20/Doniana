// Data helpers for the admin calendar and appointment pages. Reads go straight to the Data API
// (RLS lets admins read everything); writes go through the admin RPCs / Edge Function.
import { t } from "@/i18n";
import { callFunction } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Appointment, AppointmentStatus, BusinessHours, Service } from "@/types/models";
import { toLatinDigits } from "@shared/domain/phone.ts";
import { timeStringToMinutes, toZonedParts, zonedWallTimeToUtc } from "@shared/domain/time.ts";
import { adminRpc } from "./adminApi";

export const APPOINTMENT_SELECT = "*, appointment_addons(addon_id, name_ar, price_agorot)";
export const PAGE_SIZE = 50;

export type AppointmentsTab = "upcoming" | "past" | "cancelled";
export type Actor = "customer" | "admin" | "system";

export interface AuditEntry {
  id: number;
  action: string;
  actor: Actor;
  changes: Record<string, { old?: unknown; new?: unknown } | unknown> | null;
  created_at: string;
}

export async function fetchAppointmentsInRange(fromIso: string, toIso: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .gte("starts_at", fromIso)
    .lt("starts_at", toIso)
    .order("starts_at", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as Appointment[];
}

export async function fetchAppointment(id: string): Promise<Appointment> {
  const { data, error } = await supabase.from("appointments").select(APPOINTMENT_SELECT).eq("id", id).single();
  if (error) throw error;
  return data as Appointment;
}

/** Characters that would break a PostgREST `or=(…)` filter or act as wildcards. */
const sanitizeTerm = (value: string) => value.replace(/[,()*%\\"':.]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Turns a phone fragment into digits comparable with the stored E.164 number (+9725XXXXXXXX):
 * "054-123" → "54123", "+972 54…" → "54…". Returns null when there are too few digits.
 */
export function phoneSearchDigits(input: string): string | null {
  let digits = toLatinDigits(input).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("972")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.length >= 3 ? digits : null;
}

export async function fetchAppointmentsPage(options: {
  tab: AppointmentsTab;
  search: string;
  offset: number;
}): Promise<{ rows: Appointment[]; hasMore: boolean }> {
  const nowIso = new Date().toISOString();
  let query = supabase.from("appointments").select(APPOINTMENT_SELECT);

  if (options.tab === "upcoming") {
    query = query.eq("status", "confirmed").gte("starts_at", nowIso).order("starts_at", { ascending: true });
  } else if (options.tab === "past") {
    query = query.neq("status", "cancelled").lt("starts_at", nowIso).order("starts_at", { ascending: false });
  } else {
    query = query.eq("status", "cancelled").order("starts_at", { ascending: false });
  }

  const term = sanitizeTerm(options.search);
  if (term) {
    const filters: string[] = [];
    if (/\p{L}/u.test(term)) filters.push(`customer_name.ilike.*${term}*`);
    const digits = phoneSearchDigits(term);
    if (digits) filters.push(`customer_phone.ilike.*${digits}*`);
    // Too short to search meaningfully: fall back to a name match so the list still narrows.
    if (!filters.length) filters.push(`customer_name.ilike.*${term}*`);
    query = query.or(filters.join(","));
  }

  const { data, error } = await query.range(options.offset, options.offset + PAGE_SIZE);
  if (error) throw error;
  const rows = (data ?? []) as Appointment[];
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

export async function fetchAuditLog(appointmentId: string): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from("appointment_audit_log")
    .select("id, action, actor, changes, created_at")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as AuditEntry[];
}

export async function fetchCatalog(): Promise<Service[]> {
  const { data, error } = await supabase
    .from("services")
    .select("*, service_addons(*), service_locations(*)")
    .order("category")
    .order("sort_order")
    .order("sort_order", { referencedTable: "service_addons" })
    .order("sort_order", { referencedTable: "service_locations" });
  if (error) throw error;
  return (data ?? []) as Service[];
}

export async function fetchBusinessHours(): Promise<BusinessHours[]> {
  const { data, error } = await supabase.from("business_hours").select("weekday, is_open, open_time, close_time").order("weekday");
  if (error) throw error;
  return (data ?? []) as BusinessHours[];
}

// ---------------------------------------------------------------- writes

export interface AppointmentInput {
  serviceId: string;
  addonIds: string[];
  locationId: string | null;
  startsAt: string;
  customerName: string;
  customerPhone: string;
  notes: string;
  allowOutsideHours: boolean;
  notifyCustomer: boolean;
}

export async function createAppointment(input: AppointmentInput): Promise<Appointment> {
  const res = await callFunction<{ appointment: Appointment }>("admin-create-appointment", input, { auth: true });
  return res.appointment;
}

export function updateAppointment(id: string, input: AppointmentInput): Promise<Appointment> {
  return adminRpc<Appointment>("admin_update_appointment", {
    p_appointment_id: id,
    p_starts_at: input.startsAt,
    p_service_id: input.serviceId,
    p_addon_ids: input.addonIds,
    p_location_id: input.locationId,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_notes: input.notes,
    p_admin_override: input.allowOutsideHours,
    p_notify_customer: input.notifyCustomer,
  });
}

export function cancelAppointment(id: string, reason: string, notifyCustomer: boolean): Promise<Appointment> {
  return adminRpc<Appointment>("admin_cancel_appointment", {
    p_appointment_id: id,
    p_reason: reason.trim() || null,
    p_notify_customer: notifyCustomer,
  });
}

export function setAppointmentStatus(
  id: string,
  status: Exclude<AppointmentStatus, "cancelled">,
  notifyCustomer: boolean,
): Promise<Appointment> {
  return adminRpc<Appointment>("admin_set_appointment_status", {
    p_appointment_id: id,
    p_status: status,
    p_notify_customer: notifyCustomer,
  });
}

// ---------------------------------------------------------------- time helpers

/** UTC ISO instant → Asia/Jerusalem wall date ("YYYY-MM-DD") and time ("HH:MM"). */
export function toLocalDateTime(iso: string): { date: string; time: string } {
  const p = toZonedParts(new Date(iso));
  return { date: p.date, time: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}` };
}

/** Asia/Jerusalem wall date + time → UTC ISO, or null when the time does not exist (DST gap). */
export function localDateTimeToIso(date: string, time: string): string | null {
  try {
    return zonedWallTimeToUtc(date, timeStringToMinutes(time))?.toISOString() ?? null;
  } catch {
    return null;
  }
}

export function todayLocalDate(): string {
  return toZonedParts(new Date()).date;
}

// ---------------------------------------------------------------- labels

export function statusLabel(status: AppointmentStatus): string {
  return t(`admin.appointments.status.${status}`);
}

export function actorLabel(actor: Actor | null | undefined): string {
  return actor ? t(`admin.appointments.actor.${actor}`) : "";
}

// Test-only data helpers. They use the LOCAL service-role key printed by `supabase status` and
// refuse to run against anything that is not a local Supabase stack.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function serviceDb(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
    throw new Error(`E2E helpers only run against a local Supabase stack (got "${url}")`);
  }
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for e2e tests (see `supabase status`)");
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

const TZ = "Asia/Jerusalem";

/** YYYY-MM-DD in Israel, `days` from today. */
export function localDate(days: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + days * 86_400_000),
  );
}

export async function serviceIdBySlug(slug: string): Promise<string> {
  const { data, error } = await serviceDb().from("services").select("id").eq("slug", slug).single();
  if (error) throw error;
  return data.id as string;
}

export async function resetSchedule() {
  const db = serviceDb();
  // Deterministic test week: open every day 08:00–20:00, no breaks/blocks, no buffer/notice.
  await db.from("business_hours").update({ is_open: true, open_time: "08:00", close_time: "20:00" }).gte("weekday", 0);
  await db.from("business_breaks").delete().not("id", "is", null);
  await db.from("blocked_time_ranges").delete().not("id", "is", null);
  await db
    .from("business_settings")
    .update({ buffer_minutes: 0, min_notice_minutes: 0, booking_horizon_days: 60, slot_interval_minutes: 15 })
    .eq("id", true);
}

export async function cancelAllFutureAppointments() {
  await serviceDb()
    .from("appointments")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: "system" })
    .eq("status", "confirmed")
    .gte("starts_at", new Date().toISOString());
}

export interface SeededAppointment {
  id: string;
  token: string;
  startsAt: string;
}

/** Inserts an appointment directly (admin override) with a known management token. */
export async function seedAppointment(startsAt: Date, slug = "eyebrow-shaping", locationId: string | null = null): Promise<SeededAppointment> {
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await serviceDb().rpc("book_appointment", {
    p_idempotency_key: randomUUID(),
    p_manage_token_hash: createHash("sha256").update(token).digest("hex"),
    p_service_id: await serviceIdBySlug(slug),
    p_addon_ids: [],
    p_location_id: locationId,
    p_starts_at: startsAt.toISOString(),
    p_customer_name: "زبونة اختبار",
    p_customer_phone: "+972541112233",
    p_source: "admin",
    p_admin_override: true,
    p_notify_customer: false,
  });
  if (error) throw error;
  const appt = (data as { appointment: { id: string; starts_at: string } }).appointment;
  return { id: appt.id, token, startsAt: appt.starts_at };
}

/** Blocks the given local date except [fromHour, toHour). */
export async function blockDayExcept(date: string, fromHour: number, toHour: number) {
  const at = (h: number) => new Date(`${date}T${String(h).padStart(2, "0")}:00:00${offsetFor(date)}`).toISOString();
  const { error } = await serviceDb()
    .from("blocked_time_ranges")
    .insert([
      { kind: "custom", starts_at: at(0), ends_at: at(fromHour), reason: "e2e" },
      { kind: "custom", starts_at: at(toHour), ends_at: new Date(new Date(at(23)).getTime() + 3_600_000).toISOString(), reason: "e2e" },
    ]);
  if (error) throw error;
}

/** Israel's UTC offset on a local date, e.g. "+03:00" in summer. */
export function offsetFor(date: string): string {
  const probe = new Date(`${date}T12:00:00Z`);
  const local = new Date(probe.toLocaleString("en-US", { timeZone: TZ }));
  const utc = new Date(probe.toLocaleString("en-US", { timeZone: "UTC" }));
  const minutes = Math.round((local.getTime() - utc.getTime()) / 60_000);
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

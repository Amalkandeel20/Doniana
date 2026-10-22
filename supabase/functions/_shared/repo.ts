// Data access used by the Edge Functions (service-role Supabase client).
// Only the columns needed for scheduling are read; availability never touches customer data.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BusinessHoursRule, Interval, RecurringBreak, SchedulingSettings } from "./domain/availability.ts";
import type { PricedAddon, PricedLocation, PricedService } from "./domain/pricing.ts";
import { timeStringToMinutes } from "./domain/time.ts";
import { HttpError } from "./http.ts";

export interface SchedulingData {
  settings: SchedulingSettings;
  hours: BusinessHoursRule[];
  breaks: RecurringBreak[];
  blocked: Interval[];
  busy: Interval[];
}

export interface QuoteInputs {
  service: PricedService & { id: string; category: string; locationRequired: boolean };
  addons: PricedAddon[];
  location: PricedLocation | null;
}

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error || result.data === null) {
    console.error("db_read_failed", what, result.error?.message);
    throw new HttpError(500, "internal_error");
  }
  return result.data;
}

export async function loadScheduling(db: SupabaseClient, from: Date, to: Date): Promise<SchedulingData> {
  const [settings, hours, breaks, blocked, busy] = await Promise.all([
    db.from("business_settings").select("slot_interval_minutes, buffer_minutes, min_notice_minutes, booking_horizon_days").single(),
    db.from("business_hours").select("weekday, is_open, open_time, close_time"),
    db.from("business_breaks").select("weekday, start_time, end_time"),
    db
      .from("blocked_time_ranges")
      .select("starts_at, ends_at")
      .lt("starts_at", to.toISOString())
      .gt("ends_at", from.toISOString()),
    db
      .from("appointments")
      .select("starts_at, occupied_until")
      .neq("status", "cancelled")
      .lt("starts_at", to.toISOString())
      .gt("occupied_until", from.toISOString()),
  ]);
  const s = check(settings, "business_settings") as {
    slot_interval_minutes: number;
    buffer_minutes: number;
    min_notice_minutes: number;
    booking_horizon_days: number;
  };
  return {
    settings: {
      slotIntervalMinutes: s.slot_interval_minutes,
      bufferMinutes: s.buffer_minutes,
      minNoticeMinutes: s.min_notice_minutes,
      bookingHorizonDays: s.booking_horizon_days,
    },
    hours: (check(hours, "business_hours") as { weekday: number; is_open: boolean; open_time: string; close_time: string }[]).map(
      (h) => ({
        weekday: h.weekday,
        isOpen: h.is_open,
        openMinutes: timeStringToMinutes(h.open_time),
        closeMinutes: timeStringToMinutes(h.close_time),
      }),
    ),
    breaks: (check(breaks, "business_breaks") as { weekday: number | null; start_time: string; end_time: string }[]).map((b) => ({
      weekday: b.weekday,
      startMinutes: timeStringToMinutes(b.start_time),
      endMinutes: timeStringToMinutes(b.end_time),
    })),
    blocked: (check(blocked, "blocked_time_ranges") as { starts_at: string; ends_at: string }[]).map((b) => ({
      start: new Date(b.starts_at),
      end: new Date(b.ends_at),
    })),
    busy: (check(busy, "appointments") as { starts_at: string; occupied_until: string }[]).map((b) => ({
      start: new Date(b.starts_at),
      end: new Date(b.occupied_until),
    })),
  };
}

export async function loadQuoteInputs(
  db: SupabaseClient,
  serviceId: string,
  addonIds: string[],
  locationId: string | null,
): Promise<QuoteInputs> {
  const service = await db
    .from("services")
    .select("id, category, price_agorot, duration_minutes, location_required")
    .eq("id", serviceId)
    .eq("is_active", true)
    .maybeSingle();
  if (service.error) throw new HttpError(500, "internal_error");
  if (!service.data) throw new HttpError(422, "service_unavailable");

  const uniqueAddons = [...new Set(addonIds)];
  let addons: PricedAddon[] = [];
  if (uniqueAddons.length) {
    const rows = check(
      await db
        .from("service_addons")
        .select("price_agorot, extra_duration_minutes")
        .in("id", uniqueAddons)
        .eq("service_id", serviceId)
        .eq("is_active", true),
      "service_addons",
    ) as { price_agorot: number; extra_duration_minutes: number }[];
    if (rows.length !== uniqueAddons.length) throw new HttpError(422, "addon_unavailable");
    addons = rows.map((r) => ({ priceAgorot: r.price_agorot, extraDurationMinutes: r.extra_duration_minutes }));
  }

  let location: PricedLocation | null = null;
  if (locationId) {
    const row = await db
      .from("service_locations")
      .select("price_delta_agorot, duration_delta_minutes")
      .eq("id", locationId)
      .eq("service_id", serviceId)
      .eq("is_active", true)
      .maybeSingle();
    if (row.error) throw new HttpError(500, "internal_error");
    if (!row.data) throw new HttpError(422, "location_unavailable");
    location = { priceDeltaAgorot: row.data.price_delta_agorot, durationDeltaMinutes: row.data.duration_delta_minutes };
  } else if (service.data.location_required) {
    throw new HttpError(422, "location_required");
  }

  return {
    service: {
      id: service.data.id,
      category: service.data.category,
      locationRequired: service.data.location_required,
      priceAgorot: service.data.price_agorot,
      durationMinutes: service.data.duration_minutes,
    },
    addons,
    location,
  };
}

export async function rateLimit(db: SupabaseClient, key: string, limit: number, windowSeconds: number) {
  const { data, error } = await db.rpc("rate_limit_hit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) {
    // Fail closed: if the limiter is unavailable, so is the database the request needs anyway.
    console.error("rate_limit_failed", error.message);
    throw new HttpError(503, "temporarily_unavailable");
  }
  if (data !== true) throw new HttpError(429, "rate_limited");
}

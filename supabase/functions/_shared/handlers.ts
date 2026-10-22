// Request handlers for the public and admin Edge Functions. Each Deno entry point
// (supabase/functions/<name>/index.ts) only wires these to Deno.serve.
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAvailability } from "./domain/availability.ts";
import { normalizeIsraeliMobile } from "./domain/phone.ts";
import { quote } from "./domain/pricing.ts";
import {
  adminCreateAppointmentSchema,
  availabilityRequestSchema,
  createBookingRequestSchema,
  manageRequestSchema,
} from "./domain/schemas.ts";
import { addDaysToLocalDate, localDateDiffDays, startOfLocalDayUtc, toZonedParts } from "./domain/time.ts";
import { deriveManageToken, manageTokenHash } from "./crypto.ts";
import { HttpError, clientKey, fromDbError, type Env } from "./http.ts";
import { loadQuoteInputs, loadScheduling, rateLimit } from "./repo.ts";
import type { ZodError } from "zod";

export interface Deps {
  db: SupabaseClient;
  env: Env;
  now: () => Date;
  fetch: typeof fetch;
}

function requireSecret(env: Env, name: string): string {
  const value = env.get(name);
  if (!value) {
    console.error("missing_secret", name);
    throw new HttpError(500, "server_misconfigured");
  }
  return value;
}

function validationError(error: ZodError): HttpError {
  const fields = [...new Set(error.issues.map((i) => i.path.join(".")))].join(",");
  return new HttpError(400, "validation_failed", fields);
}

// ---------------------------------------------------------------- availability

export async function handleAvailability(body: unknown, req: Request, deps: Deps) {
  const parsed = availabilityRequestSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  const input = parsed.data;
  await rateLimit(deps.db, `avail:${await clientKey(req, requireSecret(deps.env, "RATE_LIMIT_SALT"))}`, 120, 60);

  const now = deps.now();
  const today = toZonedParts(now).date;
  const fromDate = localDateDiffDays(today, input.fromDate) < 0 ? today : input.fromDate;
  const dates = Array.from({ length: input.days }, (_, i) => addDaysToLocalDate(fromDate, i));

  const { service, addons, location } = await loadQuoteInputs(deps.db, input.serviceId, input.addonIds, input.locationId);
  const { durationMinutes, totalPriceAgorot } = quote(service, addons, location);

  const rangeStart = startOfLocalDayUtc(dates[0]!);
  const rangeEnd = startOfLocalDayUtc(addDaysToLocalDate(dates.at(-1)!, 1));
  const scheduling = await loadScheduling(deps.db, rangeStart, rangeEnd);
  const days = generateAvailability({ ...scheduling, dates, durationMinutes, now });

  return {
    body: {
      durationMinutes,
      totalPriceAgorot,
      days: days.map((d) => ({ date: d.date, slots: d.slots.map((s) => ({ startsAt: s.startsAt, time: s.time })) })),
    },
  };
}

// ---------------------------------------------------------------- create booking

async function verifyTurnstile(deps: Deps, token: string | undefined, req: Request) {
  const secret = deps.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return; // anti-bot challenge not enabled for this environment
  if (!token) throw new HttpError(400, "challenge_required");
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  const ip = req.headers.get("cf-connecting-ip");
  if (ip) form.append("remoteip", ip);
  try {
    const res = await deps.fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const outcome = (await res.json()) as { success?: boolean };
    if (!outcome.success) throw new HttpError(403, "challenge_failed");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(503, "challenge_unavailable");
  }
}

interface BookedRow {
  id: string;
  reference: string;
  status: string;
  starts_at: string;
  ends_at: string;
  total_price_agorot: number;
  duration_minutes: number;
  service_name_ar: string;
  service_name_en: string;
  location_name_ar: string | null;
}

export async function handleCreateBooking(body: unknown, req: Request, deps: Deps) {
  const parsed = createBookingRequestSchema.safeParse(body);
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "website")) throw new HttpError(400, "rejected");
    throw validationError(parsed.error);
  }
  const input = parsed.data;
  const salt = requireSecret(deps.env, "RATE_LIMIT_SALT");
  const phone = normalizeIsraeliMobile(input.customerPhone)!;

  await rateLimit(deps.db, `book:ip:${await clientKey(req, salt)}`, 10, 600);
  await rateLimit(deps.db, `book:phone:${(await manageTokenHash(`${salt}:${phone}`)).slice(0, 32)}`, 6, 86_400);
  await verifyTurnstile(deps, input.turnstileToken, req);

  const token = await deriveManageToken(requireSecret(deps.env, "MANAGE_TOKEN_SECRET"), input.idempotencyKey);
  const { data, error } = await deps.db.rpc("book_appointment", {
    p_idempotency_key: input.idempotencyKey,
    p_manage_token_hash: await manageTokenHash(token),
    p_service_id: input.serviceId,
    p_addon_ids: input.addonIds,
    p_location_id: input.locationId,
    p_starts_at: new Date(input.startsAt).toISOString(),
    p_customer_name: input.customerName,
    p_customer_phone: phone,
    p_source: "online",
  });
  if (error) throw fromDbError(error);
  const result = data as { replayed: boolean; appointment: BookedRow };
  const a = result.appointment;
  return {
    status: result.replayed ? 200 : 201,
    body: {
      manageToken: token,
      appointment: {
        reference: a.reference,
        status: a.status,
        startsAt: a.starts_at,
        endsAt: a.ends_at,
        totalPriceAgorot: a.total_price_agorot,
        durationMinutes: a.duration_minutes,
        serviceNameAr: a.service_name_ar,
        serviceNameEn: a.service_name_en,
        locationNameAr: a.location_name_ar,
      },
    },
  };
}

// ---------------------------------------------------------------- management link

export async function handleManage(body: unknown, req: Request, deps: Deps) {
  const parsed = manageRequestSchema.safeParse(body);
  if (!parsed.success) throw new HttpError(404, "not_found");
  await rateLimit(deps.db, `manage:${await clientKey(req, requireSecret(deps.env, "RATE_LIMIT_SALT"))}`, 30, 600);
  const hash = await manageTokenHash(parsed.data.token);
  const fn = parsed.data.action === "cancel" ? "cancel_appointment_by_token" : "get_appointment_by_token";
  const { data, error } = await deps.db.rpc(fn, { p_token_hash: hash });
  if (error) throw fromDbError(error);
  return { body: { appointment: data } };
}

// ---------------------------------------------------------------- admin: create appointment

export async function requireAdminUser(req: Request, deps: Deps, createUserClient: (jwt: string) => SupabaseClient) {
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) throw new HttpError(401, "unauthorized");
  const { data, error } = await createUserClient(jwt).auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "unauthorized");
  const { data: profile } = await deps.db.from("admin_profiles").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (!profile) throw new HttpError(403, "forbidden");
  return data.user.id;
}

export async function handleAdminCreate(body: unknown, adminUserId: string, deps: Deps) {
  const parsed = adminCreateAppointmentSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  const input = parsed.data;
  const idempotencyKey = crypto.randomUUID();
  const token = await deriveManageToken(requireSecret(deps.env, "MANAGE_TOKEN_SECRET"), idempotencyKey);
  const { data, error } = await deps.db.rpc("book_appointment", {
    p_idempotency_key: idempotencyKey,
    p_manage_token_hash: await manageTokenHash(token),
    p_service_id: input.serviceId,
    p_addon_ids: input.addonIds,
    p_location_id: input.locationId,
    p_starts_at: new Date(input.startsAt).toISOString(),
    p_customer_name: input.customerName,
    p_customer_phone: normalizeIsraeliMobile(input.customerPhone)!,
    p_source: "admin",
    p_admin_override: input.allowOutsideHours,
    p_notes: input.notes || null,
    p_actor_user_id: adminUserId,
    p_notify_customer: input.notifyCustomer,
  });
  if (error) throw fromDbError(error);
  return { status: 201, body: { appointment: (data as { appointment: BookedRow }).appointment } };
}

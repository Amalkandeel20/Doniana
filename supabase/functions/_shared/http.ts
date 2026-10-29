// HTTP plumbing shared by the Edge Functions: CORS, JSON responses, safe error mapping.
import { sha256Hex } from "./crypto.ts";

export interface Env {
  get(name: string): string | undefined;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    public detail?: string,
  ) {
    super(code);
  }
}

/** The public site is always allowed; ALLOWED_ORIGINS adds others (local dev, staging hosts). */
export const SITE_ORIGINS = ["https://donianabeauty.com", "https://www.donianabeauty.com"];

export function allowedOrigin(req: Request, env: Env): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const allowed = [
    ...SITE_ORIGINS,
    ...(env.get("ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ];
  return allowed.includes(origin) ? origin : null;
}

export function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = allowedOrigin(req, env);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "600",
  };
}

export function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

/** Maps database exception messages raised by our SQL functions to HTTP responses. */
const DB_ERRORS: Record<string, [number, string]> = {
  slot_unavailable: [409, "slot_unavailable"],
  idempotency_conflict: [409, "idempotency_conflict"],
  service_unavailable: [422, "service_unavailable"],
  addon_unavailable: [422, "addon_unavailable"],
  location_unavailable: [422, "location_unavailable"],
  location_required: [422, "location_required"],
  not_found: [404, "not_found"],
  not_cancellable: [409, "not_cancellable"],
  cancellation_window_closed: [409, "cancellation_window_closed"],
  forbidden: [403, "forbidden"],
};

export function fromDbError(error: { message?: string; details?: string | null } | null): HttpError {
  const message = error?.message ?? "";
  const mapped = DB_ERRORS[message];
  if (mapped) return new HttpError(mapped[0], mapped[1], error?.details ?? undefined);
  return new HttpError(500, "internal_error");
}

/**
 * Wraps a handler: CORS preflight, method/origin checks, JSON parsing and error hygiene.
 * Internal errors are logged without request bodies (which may contain names, phones or tokens).
 */
export function endpoint(
  env: Env,
  handler: (body: unknown, req: Request) => Promise<{ status?: number; body: unknown }>,
  options: { requireOrigin?: boolean } = { requireOrigin: true },
) {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
    if (options.requireOrigin && req.headers.get("origin") && !allowedOrigin(req, env)) {
      return json({ error: "origin_not_allowed" }, 403, cors);
    }
    let body: unknown;
    try {
      const text = await req.text();
      if (text.length > 16_384) throw new HttpError(413, "payload_too_large");
      body = text ? JSON.parse(text) : {};
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code }, e.status, cors);
      return json({ error: "invalid_json" }, 400, cors);
    }
    try {
      const result = await handler(body, req);
      return json(result.body, result.status ?? 200, cors);
    } catch (e) {
      if (e instanceof HttpError) {
        return json({ error: e.code, ...(e.detail ? { detail: e.detail } : {}) }, e.status, cors);
      }
      console.error("unhandled_error", e instanceof Error ? e.message : String(e));
      return json({ error: "internal_error" }, 500, cors);
    }
  };
}

/** Rate-limit key derived from the client IP. The raw IP is never stored. */
export async function clientKey(req: Request, salt: string): Promise<string> {
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  return (await sha256Hex(`${salt}:${ip}`)).slice(0, 32);
}

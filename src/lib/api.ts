// Calls to the Supabase Edge Functions. Bodies may contain names, phones or tokens, so nothing
// here logs request or response payloads.
import { config } from "./config";
import { supabase } from "./supabase";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public detail?: string,
  ) {
    super(code);
  }
}

export async function callFunction<T>(name: string, body: unknown, options: { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: config.supabaseAnonKey ?? "",
  };
  if (options.auth) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  let res: Response;
  try {
    res = await fetch(`${config.supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new ApiError("network", 0);
  }
  const payload = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
  if (!res.ok) throw new ApiError(payload.error ?? "generic", res.status, payload.detail);
  return payload as T;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

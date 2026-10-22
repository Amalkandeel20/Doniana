// Deno-only glue: environment access and Supabase clients. Not imported by browser code.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Deps } from "../handlers.ts";
import type { Env } from "../http.ts";

export const env: Env = { get: (name) => Deno.env.get(name) };

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** Service-role client: bypasses RLS, so it only ever runs server-side. */
export function serviceClient(): SupabaseClient {
  return createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function userClient(jwt: string): SupabaseClient {
  return createClient(required("SUPABASE_URL"), required("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

export function deps(): Deps {
  return { db: serviceClient(), env, now: () => new Date(), fetch };
}

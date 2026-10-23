// Deno-only glue: environment access and Supabase clients. Not imported by browser code.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Deps } from "../handlers.ts";
import type { Env } from "../http.ts";

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

// Settings missing from the environment fall back to Vault (see the function_config migration).
// Loaded once per function instance.
async function loadVaultConfig(): Promise<Record<string, string>> {
  try {
    const { data, error } = await serviceClient().rpc("get_function_config");
    if (error) {
      console.error("vault_config_unavailable", error.message);
      return {};
    }
    return (data ?? {}) as Record<string, string>;
  } catch (e) {
    console.error("vault_config_unavailable", (e as Error).message);
    return {};
  }
}

const vaultConfig = await loadVaultConfig();

export const env: Env = { get: (name) => Deno.env.get(name) || vaultConfig[name] };

export function userClient(jwt: string): SupabaseClient {
  return createClient(required("SUPABASE_URL"), required("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

export function deps(): Deps {
  return { db: serviceClient(), env, now: () => new Date(), fetch };
}

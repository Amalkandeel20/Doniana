import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

// Browser client with the publishable (anon) key. RLS limits it to public data, or to admin
// data once an administrator signs in. The service-role key never reaches the browser.
export const supabase = createClient(
  config.supabaseUrl ?? "http://localhost:54321",
  config.supabaseAnonKey ?? "missing-anon-key",
  { auth: { persistSession: true, autoRefreshToken: true, storageKey: "doniana-admin-auth" } },
);

export function publicImageUrl(bucket: "service-images" | "portfolio", path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path) || path.startsWith("/")) return path;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

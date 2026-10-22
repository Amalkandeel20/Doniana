// Helpers shared by admin pages: RPC calls with friendly Arabic error messages.
import { toast } from "sonner";
import { t } from "@/i18n";
import { ApiError } from "@/lib/api";
import { supabase } from "@/lib/supabase";

/** Maps a Supabase/PostgREST or Edge Function error to a user-facing Arabic message. */
export function adminErrorMessage(error: unknown): string {
  const code =
    error instanceof ApiError
      ? error.code
      : typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : "";
  const key = `admin.errors.${code}`;
  const translated = t(key);
  if (translated !== key) return translated;
  if (/permission denied|row-level security/i.test(code)) return t("admin.errors.forbidden");
  return t("admin.errors.generic");
}

export async function adminRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export function toastError(error: unknown) {
  toast.error(adminErrorMessage(error));
}

export function toastSaved() {
  toast.success(t("admin.saved"));
}

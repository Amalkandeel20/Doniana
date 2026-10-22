// Row types, validation helpers and Storage helpers for the admin settings-type pages.
import { toast } from "sonner";
import { z } from "zod";
import { t } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { toLatinDigits } from "@shared/domain/phone.ts";
import { shekelsToAgorot } from "@shared/domain/pricing.ts";
import { adminErrorMessage } from "../adminApi";

export type BlockKind = "day_off" | "holiday" | "closure" | "custom";
export const BLOCK_KINDS: BlockKind[] = ["day_off", "holiday", "closure", "custom"];

export interface BusinessBreak {
  id: string;
  weekday: number | null;
  start_time: string;
  end_time: string;
  label: string | null;
}

export interface BlockedRange {
  id: string;
  kind: BlockKind;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

export interface NotificationSettingsRow {
  owner_phone: string | null;
  sms_enabled: boolean;
  reminder_max_lateness_minutes: number;
}

export const NOTIFICATION_EVENTS = [
  "booking_confirmed",
  "owner_new_booking",
  "owner_cancellation",
  "reminder_24h",
  "cancelled_by_owner",
  "appointment_changed",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const TEMPLATE_PLACEHOLDERS = ["business", "name", "phone", "service", "date", "time", "price", "reference", "link"] as const;

export type OutboxStatus = "pending" | "processing" | "sent" | "delivered" | "failed" | "cancelled" | "skipped" | "unknown" | "dev_logged";

export interface OutboxRow {
  id: string;
  appointment_id: string;
  event: NotificationEvent;
  recipient: "customer" | "owner";
  status: OutboxStatus;
  scheduled_at: string;
  first_processed_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  appointments: { reference: string; customer_name: string | null; starts_at: string } | null;
}

export interface DeliveryAttempt {
  id: string;
  attempt_no: number;
  provider: string;
  outcome: "started" | "accepted" | "failed" | "unknown" | "dev_logged";
  provider_status: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

/** Unwraps a Supabase `{ data, error }` result, throwing the error. */
export function must<T>(result: { data: unknown; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

/** aria props for a control rendered inside <Field>. */
export function fieldAria(id: string, error?: string, help?: boolean) {
  const describedBy = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return { id, "aria-invalid": !!error, "aria-describedby": describedBy || undefined };
}

export function dbErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "23503") return t("admin.settings.errors.inUse");
  if (code === "23505") return t("admin.settings.errors.duplicate");
  if (code === "23514") return t("admin.settings.errors.check");
  return adminErrorMessage(error);
}

export function toastDbError(error: unknown) {
  toast.error(dbErrorMessage(error));
}

// ---------------------------------------------------------------- validation

export const vText = (max: number) => z.string().trim().max(max, t("admin.settings.v.maxLength", { max }));
export const vRequiredText = (max: number) => vText(max).min(1, t("admin.settings.v.required"));

export const vInt = (min: number, max: number) => {
  const message = t("admin.settings.v.range", { min, max });
  return z.number({ invalid_type_error: message, required_error: message }).int(message).min(min, message).max(max, message);
};

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const vTime = z.string().regex(TIME_RE, t("admin.settings.v.time"));

/** "₪" amount typed by the owner → integer agorot, or null when invalid. Accepts Arabic digits and comma decimals. */
export function parseShekels(input: string, allowNegative = false): number | null {
  const s = toLatinDigits(input).trim().replace(",", ".").replace("₪", "").trim();
  const re = allowNegative ? /^-?\d{1,6}(\.\d{1,2})?$/ : /^\d{1,6}(\.\d{1,2})?$/;
  if (!re.test(s)) return null;
  return shekelsToAgorot(Number(s));
}

export const agorotToInput = (agorot: number) => String(agorot / 100);

export function slugify(input: string, max = 60): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

export const toTimeInput = (value: string) => value.slice(0, 5);

/** 90 → "ساعة و30 دقيقة", 2880 → "2 يوم". */
export function humanizeMinutes(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) return t("admin.settings.availability.scheduling.days", { n: minutes / 1440 });
  if (minutes < 60) return `${minutes} ${t("admin.settings.common.minutes")}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h === 1 ? "ساعة" : h === 2 ? "ساعتان" : `${h} ساعات`;
  return m ? `${hours} و${m} دقيقة` : hours;
}

// ---------------------------------------------------------------- images

export type ImageBucket = "service-images" | "portfolio";
const IMAGE_EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
export const IMAGE_ACCEPT = Object.keys(IMAGE_EXTENSIONS).join(",");
export const MAX_IMAGE_MB: Record<ImageBucket, number> = { "service-images": 5, portfolio: 8 };

/** Returns an Arabic problem description, or null when the file can be uploaded. */
export function imageProblem(file: File, bucket: ImageBucket): string | null {
  if (!IMAGE_EXTENSIONS[file.type]) return t("admin.settings.errors.fileType");
  const max = MAX_IMAGE_MB[bucket];
  if (file.size > max * 1024 * 1024) return t("admin.settings.errors.fileSize", { max });
  return null;
}

/** Uploads under a random name and returns the storage path. */
export async function uploadImage(bucket: ImageBucket, file: File): Promise<string> {
  const path = `${crypto.randomUUID()}.${IMAGE_EXTENSIONS[file.type] ?? "jpg"}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type, cacheControl: "31536000" });
  if (error) throw Object.assign(new Error(t("admin.settings.errors.upload")), { upload: true });
  return path;
}

/** Best-effort removal; bundled placeholders and external URLs are never touched. */
export async function removeImage(bucket: ImageBucket, path: string | null | undefined): Promise<boolean> {
  if (!path || path.startsWith("/") || /^https?:\/\//.test(path)) return true;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  return !error;
}

export function uploadOrDbError(error: unknown) {
  if (error instanceof Error && "upload" in error) toast.error(error.message);
  else toastDbError(error);
}

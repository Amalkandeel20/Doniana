// Outbox worker: claims due notifications, renders the Arabic SMS and sends it through the
// configured provider. All state transitions happen in SQL functions (see the functions
// migration), which makes the worker safe to run concurrently and idempotent per attempt.
import { deriveManageToken } from "../crypto.ts";
import { formatPhoneForDisplay } from "../domain/phone.ts";
import { formatShekels } from "../domain/pricing.ts";
import { formatDateAr, formatTime } from "../format.ts";
import type { SendResult, SmsProvider } from "./providers.ts";

export interface DeliveryJob {
  action: "send";
  attemptId: string;
  outboxId: string;
  event: string;
  recipient: "customer" | "owner";
  destination: string;
  template: string | null;
  businessName: string;
  appointment: {
    reference: string;
    serviceNameAr: string;
    locationNameAr: string | null;
    startsAt: string;
    totalPriceAgorot: number;
    customerName: string | null;
    customerPhone: string | null;
    idempotencyKey: string;
  };
}

export type BeginResult = DeliveryJob | { action: "skip" | "none"; reason: string };

export interface OutboxStore {
  claim(limit: number, leaseSeconds: number): Promise<{ id: string }[]>;
  begin(outboxId: string, provider: string): Promise<BeginResult>;
  finish(attemptId: string, result: SendResult): Promise<void>;
}

export interface WorkerConfig {
  siteUrl: string;
  manageTokenSecret: string;
  statusCallbackUrl?: string;
}

export const FALLBACK_TEMPLATES: Record<string, string> = {
  booking_confirmed: "تم تأكيد موعدك في {{business}}: {{service}} {{date}} الساعة {{time}}. {{link}}",
  owner_new_booking: "حجز جديد {{reference}}: {{name}} {{phone}} — {{service}} {{date}} {{time}}",
  owner_cancellation: "إلغاء {{reference}}: {{name}} {{phone}} — {{service}} {{date}} {{time}}",
  reminder_24h: "تذكير من {{business}}: موعدك ({{service}}) يوم {{date}} الساعة {{time}}. {{link}}",
  cancelled_by_owner: "تم إلغاء موعدك في {{business}} يوم {{date}} الساعة {{time}}. للاستفسار يرجى التواصل معنا.",
  appointment_changed: "تم تعديل موعدك في {{business}}: {{service}} {{date}} الساعة {{time}}. {{link}}",
};

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "").trim();
}

export async function renderJob(job: DeliveryJob, config: WorkerConfig): Promise<string> {
  const a = job.appointment;
  const start = new Date(a.startsAt);
  const needsLink = /\{\{\s*link\s*\}\}/.test(job.template ?? FALLBACK_TEMPLATES[job.event] ?? "");
  const link =
    needsLink && job.recipient === "customer"
      ? `${config.siteUrl.replace(/\/$/, "")}/a#${await deriveManageToken(config.manageTokenSecret, a.idempotencyKey)}`
      : "";
  const service = a.locationNameAr ? `${a.serviceNameAr} (${a.locationNameAr})` : a.serviceNameAr;
  return renderTemplate(job.template ?? FALLBACK_TEMPLATES[job.event] ?? "", {
    business: job.businessName,
    name: a.customerName ?? "",
    phone: a.customerPhone ? formatPhoneForDisplay(a.customerPhone) : "",
    service,
    date: formatDateAr(start),
    time: formatTime(start),
    price: formatShekels(a.totalPriceAgorot),
    reference: a.reference,
    link,
  });
}

export interface WorkerReport {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  unknown: number;
}

export async function processOutbox(
  store: OutboxStore,
  provider: SmsProvider,
  config: WorkerConfig,
  options: { batchSize?: number; leaseSeconds?: number } = {},
): Promise<WorkerReport> {
  const report: WorkerReport = { claimed: 0, sent: 0, skipped: 0, failed: 0, unknown: 0 };
  const claimed = await store.claim(options.batchSize ?? 20, options.leaseSeconds ?? 90);
  report.claimed = claimed.length;

  for (const { id } of claimed) {
    const job = await store.begin(id, provider.name);
    if (job.action !== "send") {
      report.skipped++;
      continue;
    }
    let result: SendResult;
    try {
      const body = await renderJob(job, config);
      result = await provider.send({ to: job.destination, body, statusCallbackUrl: config.statusCallbackUrl });
    } catch (e) {
      // Rendering failed or the adapter threw unexpectedly: we cannot tell whether it sent.
      result = { outcome: "unknown", error: `worker_exception: ${(e as Error).message}` };
    }
    await store.finish(job.attemptId, result);
    if (result.outcome === "accepted" || result.outcome === "dev_logged") report.sent++;
    else if (result.outcome === "unknown") report.unknown++;
    else report.failed++;
  }
  return report;
}

/** finish_notification_delivery() arguments for a SendResult. */
export function finishArgs(attemptId: string, result: SendResult) {
  return {
    p_attempt_id: attemptId,
    p_outcome: result.outcome,
    p_provider_message_id: result.outcome === "accepted" ? result.providerMessageId : null,
    p_provider_status: result.outcome === "accepted" ? (result.providerStatus ?? null) : null,
    p_http_status: "httpStatus" in result ? (result.httpStatus ?? null) : null,
    p_error: "error" in result ? result.error : null,
    p_retryable: result.outcome === "failed" ? result.retryable : false,
  };
}

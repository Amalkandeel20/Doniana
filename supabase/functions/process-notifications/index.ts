// Invoked every 30 s by pg_cron (see the platform migration). Protected by CRON_SECRET.
import { timingSafeEqual } from "../_shared/crypto.ts";
import { json } from "../_shared/http.ts";
import { createSmsProvider } from "../_shared/notifications/providers.ts";
import { finishArgs, processOutbox, type BeginResult, type OutboxStore } from "../_shared/notifications/worker.ts";
import { env, serviceClient } from "../_shared/deno/runtime.ts";

const db = serviceClient();

const store: OutboxStore = {
  async claim(limit, leaseSeconds) {
    const { data, error } = await db.rpc("claim_due_notifications", { p_limit: limit, p_lease_seconds: leaseSeconds });
    if (error) throw new Error(`claim failed: ${error.message}`);
    return (data ?? []) as { id: string }[];
  },
  async begin(outboxId, provider) {
    const { data, error } = await db.rpc("begin_notification_delivery", { p_outbox_id: outboxId, p_provider: provider });
    if (error) throw new Error(`begin failed: ${error.message}`);
    return data as BeginResult;
  },
  async finish(attemptId, result) {
    const { error } = await db.rpc("finish_notification_delivery", finishArgs(attemptId, result));
    if (error) console.error("finish_failed", attemptId, error.message);
  },
};

Deno.serve(async (req) => {
  const secret = env.get("CRON_SECRET") ?? "";
  const given = req.headers.get("x-cron-secret") ?? "";
  if (req.method !== "POST" || secret.length < 32 || !timingSafeEqual(given, secret)) {
    return json({ error: "unauthorized" }, 401);
  }
  const callbackBase = env.get("SMS_STATUS_CALLBACK_URL");
  const report = await processOutbox(store, createSmsProvider(env), {
    siteUrl: env.get("SITE_URL") ?? "",
    manageTokenSecret: env.get("MANAGE_TOKEN_SECRET") ?? "",
    statusCallbackUrl: callbackBase || undefined,
  });
  return json(report, 200);
});

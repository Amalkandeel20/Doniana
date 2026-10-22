// Twilio delivery-status webhook. Verifies X-Twilio-Signature before touching the database.
import { json } from "../_shared/http.ts";
import { verifyTwilioSignature } from "../_shared/notifications/providers.ts";
import { env, serviceClient } from "../_shared/deno/runtime.ts";

const db = serviceClient();

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const authToken = env.get("TWILIO_AUTH_TOKEN");
  const publicUrl = env.get("SMS_STATUS_CALLBACK_URL");
  if (!authToken || !publicUrl) return json({ error: "not_configured" }, 503);

  const params = new URLSearchParams(await req.text());
  const signature = req.headers.get("x-twilio-signature") ?? "";
  if (!(await verifyTwilioSignature(authToken, publicUrl, params, signature))) {
    return json({ error: "invalid_signature" }, 403);
  }
  const sid = params.get("MessageSid");
  const status = params.get("MessageStatus");
  if (!sid || !status) return json({ error: "bad_request" }, 400);
  const errorCode = params.get("ErrorCode");
  const { error } = await db.rpc("record_delivery_status", {
    p_provider_message_id: sid,
    p_provider_status: status,
    p_error: errorCode ? `twilio_error_${errorCode}` : null,
  });
  if (error) return json({ error: "internal_error" }, 500);
  return new Response(null, { status: 204 });
});

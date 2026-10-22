// Provider-independent SMS interface with concrete adapters.
// Adding a provider = implementing SmsProvider and registering it in createSmsProvider().

export interface SmsMessage {
  to: string; // E.164
  body: string;
  statusCallbackUrl?: string;
}

export type SendResult =
  | { outcome: "accepted"; providerMessageId: string; providerStatus?: string; httpStatus?: number }
  | { outcome: "dev_logged" }
  /** Definitely not sent; `retryable` decides whether the outbox tries again. */
  | { outcome: "failed"; retryable: boolean; error: string; httpStatus?: number }
  /** Might have been sent (e.g. timeout after the request left). Never retried automatically. */
  | { outcome: "unknown"; error: string };

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<SendResult>;
}

/** Development adapter: records the message (in the outbox/attempt rows) and sends nothing. */
export class DevSmsProvider implements SmsProvider {
  readonly name = "dev";
  async send(message: SmsMessage): Promise<SendResult> {
    console.log(`[dev-sms] to=${message.to.slice(0, 6)}… chars=${message.body.length} (not sent)`);
    return { outcome: "dev_logged" };
  }
}

/** Reports a configuration problem without ever pretending a message was delivered. */
export class UnconfiguredSmsProvider implements SmsProvider {
  constructor(
    readonly name: string,
    private reason: string,
  ) {}
  async send(): Promise<SendResult> {
    return { outcome: "failed", retryable: true, error: `sms_provider_not_configured: ${this.reason}` };
  }
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** Either a sender (E.164 number or registered alphanumeric ID) … */
  from?: string;
  /** … or a Messaging Service SID. */
  messagingServiceSid?: string;
  timeoutMs?: number;
}

export class TwilioSmsProvider implements SmsProvider {
  readonly name = "twilio";
  constructor(
    private config: TwilioConfig,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: SmsMessage): Promise<SendResult> {
    const { accountSid, authToken, from, messagingServiceSid, timeoutMs = 15_000 } = this.config;
    const form = new URLSearchParams({ To: message.to, Body: message.body });
    if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid);
    else if (from) form.set("From", from);
    if (message.statusCallbackUrl) form.set("StatusCallback", message.statusCallbackUrl);

    let res: Response;
    try {
      res = await this.fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const name = (e as Error).name;
      // A timeout may fire after Twilio created the message: outcome unknown, do not resend.
      if (name === "TimeoutError" || name === "AbortError") return { outcome: "unknown", error: "provider_timeout" };
      return { outcome: "failed", retryable: true, error: `network_error: ${(e as Error).message}` };
    }

    const payload = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; code?: number; message?: string };
    if (res.ok && payload.sid) {
      return { outcome: "accepted", providerMessageId: payload.sid, providerStatus: payload.status, httpStatus: res.status };
    }
    const retryable = res.status === 429 || res.status >= 500;
    return {
      outcome: "failed",
      retryable,
      httpStatus: res.status,
      error: `twilio_${payload.code ?? res.status}: ${payload.message ?? "request failed"}`,
    };
  }
}

export function createSmsProvider(env: { get(name: string): string | undefined }, fetchImpl: typeof fetch = fetch): SmsProvider {
  const provider = (env.get("SMS_PROVIDER") ?? "dev").toLowerCase();
  const production = env.get("APP_ENV") === "production";
  if (provider === "dev") {
    return production ? new UnconfiguredSmsProvider("dev", "dev adapter is not allowed in production") : new DevSmsProvider();
  }
  if (provider === "twilio") {
    const accountSid = env.get("TWILIO_ACCOUNT_SID");
    const authToken = env.get("TWILIO_AUTH_TOKEN");
    const from = env.get("TWILIO_FROM");
    const messagingServiceSid = env.get("TWILIO_MESSAGING_SERVICE_SID");
    if (!accountSid || !authToken || (!from && !messagingServiceSid)) {
      return new UnconfiguredSmsProvider("twilio", "missing TWILIO_* secrets");
    }
    return new TwilioSmsProvider({ accountSid, authToken, from, messagingServiceSid }, fetchImpl);
  }
  return new UnconfiguredSmsProvider(provider, "unknown SMS_PROVIDER");
}

/** Validates Twilio's X-Twilio-Signature header for status callbacks. */
export async function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: URLSearchParams,
  signature: string,
): Promise<boolean> {
  const data = [...params.keys()]
    .sort()
    .reduce((acc, key) => acc + key + (params.get(key) ?? ""), url);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, [
    "sign",
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  let binary = "";
  for (const b of mac) binary += String.fromCharCode(b);
  const expected = btoa(binary);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

// Unit tests for Edge Function handlers and the SMS adapters (no network, no database).
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveManageToken, manageTokenHash } from "./crypto.ts";
import { handleAdminAccount, handleCreateBooking, handleManage, type Deps } from "./handlers.ts";
import { HttpError, endpoint } from "./http.ts";
import { TwilioSmsProvider, createSmsProvider, verifyTwilioSignature } from "./notifications/providers.ts";
import { renderJob, renderTemplate, type DeliveryJob } from "./notifications/worker.ts";

const SECRET = "x".repeat(48);
const env = (vars: Record<string, string>) => ({ get: (k: string) => vars[k] });

function fakeDb(rpcResult: (fn: string, args: Record<string, unknown>) => { data: unknown; error: unknown }) {
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) =>
    fn === "rate_limit_hit" ? { data: true, error: null } : rpcResult(fn, args),
  );
  return { db: { rpc } as unknown as SupabaseClient, rpc };
}

function deps(db: SupabaseClient): Deps {
  return { db, env: env({ MANAGE_TOKEN_SECRET: SECRET, RATE_LIMIT_SALT: "salt" }), now: () => new Date(), fetch: vi.fn() };
}

const req = () => new Request("https://fn.example/create-booking", { method: "POST", headers: { "cf-connecting-ip": "1.2.3.4" } });

const validBooking = {
  idempotencyKey: "6f1c2c3e-7a43-4b5e-9c1d-1f2e3d4c5b6a",
  serviceId: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  addonIds: [],
  locationId: null,
  startsAt: "2026-11-02T08:00:00.000Z",
  customerName: "دنيا أحمد",
  customerPhone: "054-123-4567",
};

describe("create-booking handler", () => {
  it("normalises the phone, stores only the token hash and returns the derived token", async () => {
    const appointment = { id: "a", reference: "DN-ABCDEF", status: "confirmed", starts_at: validBooking.startsAt, ends_at: "x", total_price_agorot: 7000, duration_minutes: 25, service_name_ar: "س", service_name_en: "S", location_name_ar: null };
    const { db, rpc } = fakeDb(() => ({ data: { replayed: false, appointment }, error: null }));
    const res = await handleCreateBooking(validBooking, req(), deps(db));
    const call = rpc.mock.calls.find(([fn]) => fn === "book_appointment")!;
    const args = call[1] as Record<string, string>;
    expect(args.p_customer_phone).toBe("+972541234567");
    const token = await deriveManageToken(SECRET, validBooking.idempotencyKey);
    expect(args.p_manage_token_hash).toBe(await manageTokenHash(token));
    expect(JSON.stringify(args)).not.toContain(token);
    expect(res).toMatchObject({ status: 201, body: { manageToken: token, appointment: { reference: "DN-ABCDEF" } } });
  });

  it("returns 200 for an idempotent replay", async () => {
    const { db } = fakeDb(() => ({ data: { replayed: true, appointment: { reference: "DN-X" } }, error: null }));
    expect((await handleCreateBooking(validBooking, req(), deps(db))).status).toBe(200);
  });

  it("maps a lost race to 409 slot_unavailable", async () => {
    const { db } = fakeDb(() => ({ data: null, error: { message: "slot_unavailable", details: "conflict" } }));
    await expect(handleCreateBooking(validBooking, req(), deps(db))).rejects.toMatchObject({ status: 409, code: "slot_unavailable" });
  });

  it("rejects invalid phones, the honeypot, and rate-limited clients before touching bookings", async () => {
    const { db, rpc } = fakeDb(() => ({ data: null, error: null }));
    await expect(handleCreateBooking({ ...validBooking, customerPhone: "123" }, req(), deps(db))).rejects.toMatchObject({ code: "validation_failed" });
    await expect(handleCreateBooking({ ...validBooking, website: "spam" }, req(), deps(db))).rejects.toMatchObject({ code: "rejected" });
    expect(rpc).not.toHaveBeenCalled();

    const limited = { rpc: vi.fn(async () => ({ data: false, error: null })) } as unknown as SupabaseClient;
    await expect(handleCreateBooking(validBooking, req(), deps(limited))).rejects.toMatchObject({ status: 429 });
  });

  it("requires Turnstile when a secret is configured", async () => {
    const { db } = fakeDb(() => ({ data: null, error: null }));
    const d = { ...deps(db), env: env({ MANAGE_TOKEN_SECRET: SECRET, RATE_LIMIT_SALT: "s", TURNSTILE_SECRET_KEY: "t" }) };
    await expect(handleCreateBooking(validBooking, req(), d)).rejects.toMatchObject({ code: "challenge_required" });
  });
});

describe("manage-appointment handler", () => {
  it("treats malformed tokens as not found and hashes valid ones", async () => {
    const { db, rpc } = fakeDb(() => ({ data: { status: "confirmed" }, error: null }));
    await expect(handleManage({ token: "short", action: "view" }, req(), deps(db))).rejects.toMatchObject({ status: 404 });
    const token = await deriveManageToken(SECRET, validBooking.idempotencyKey);
    await handleManage({ token, action: "cancel" }, req(), deps(db));
    expect(rpc).toHaveBeenCalledWith("cancel_appointment_by_token", { p_token_hash: await manageTokenHash(token) });
  });

  it("surfaces the 24-hour rule as a 409", async () => {
    const { db } = fakeDb(() => ({ data: null, error: { message: "cancellation_window_closed" } }));
    const token = await deriveManageToken(SECRET, validBooking.idempotencyKey);
    await expect(handleManage({ token, action: "cancel" }, req(), deps(db))).rejects.toMatchObject({ status: 409, code: "cancellation_window_closed" });
  });
});

describe("endpoint wrapper", () => {
  const e = env({ ALLOWED_ORIGINS: "https://doniana.example" });
  it("answers CORS preflight only for allowed origins and hides internal errors", async () => {
    const handler = endpoint(e, async () => {
      throw new Error("db password leaked in message");
    });
    const pre = await handler(new Request("https://f", { method: "OPTIONS", headers: { origin: "https://doniana.example" } }));
    expect(pre.headers.get("access-control-allow-origin")).toBe("https://doniana.example");
    const bad = await handler(new Request("https://f", { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" }));
    expect(bad.status).toBe(403);
    const res = await handler(new Request("https://f", { method: "POST", headers: { origin: "https://doniana.example" }, body: "{}" }));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("password");
  });

  it("always allows the public site", async () => {
    const handler = endpoint(env({}), async () => ({ body: {} }));
    const pre = await handler(new Request("https://f", { method: "OPTIONS", headers: { origin: "https://donianabeauty.com" } }));
    expect(pre.headers.get("access-control-allow-origin")).toBe("https://donianabeauty.com");
  });

  it("passes HttpErrors through as JSON", async () => {
    const handler = endpoint(e, async () => {
      throw new HttpError(409, "slot_unavailable");
    });
    const res = await handler(new Request("https://f", { method: "POST", body: "{}" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "slot_unavailable" });
  });
});

describe("SMS providers", () => {
  it("never uses the dev adapter in production and reports missing credentials as failures", async () => {
    expect(createSmsProvider(env({ SMS_PROVIDER: "dev" })).name).toBe("dev");
    const prodDev = createSmsProvider(env({ SMS_PROVIDER: "dev", APP_ENV: "production" }));
    expect(await prodDev.send({ to: "+972541234567", body: "x" })).toMatchObject({ outcome: "failed" });
    const twilio = createSmsProvider(env({ SMS_PROVIDER: "twilio" }));
    expect(await twilio.send({ to: "+972541234567", body: "x" })).toMatchObject({ outcome: "failed", retryable: true });
  });

  it("sends via Twilio and classifies responses", async () => {
    const fetchOk = vi.fn(async () => new Response(JSON.stringify({ sid: "SM123", status: "queued" }), { status: 201 }));
    const p = new TwilioSmsProvider({ accountSid: "AC1", authToken: "tok", from: "DONIANA" }, fetchOk as unknown as typeof fetch);
    expect(await p.send({ to: "+972541234567", body: "مرحبا" })).toMatchObject({ outcome: "accepted", providerMessageId: "SM123" });
    const [url, init] = fetchOk.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/Accounts/AC1/Messages.json");
    expect(String(init.body)).toContain("To=%2B972541234567");

    const bad = new TwilioSmsProvider({ accountSid: "AC1", authToken: "t", from: "X" }, (async () =>
      new Response(JSON.stringify({ code: 21211, message: "Invalid To" }), { status: 400 })) as unknown as typeof fetch);
    expect(await bad.send({ to: "+972541234567", body: "x" })).toMatchObject({ outcome: "failed", retryable: false });

    const timeout = new TwilioSmsProvider({ accountSid: "AC1", authToken: "t", from: "X" }, (async () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    }) as unknown as typeof fetch);
    expect(await timeout.send({ to: "+972541234567", body: "x" })).toMatchObject({ outcome: "unknown" });
  });

  it("verifies Twilio webhook signatures", async () => {
    // Example from Twilio's security documentation.
    const params = new URLSearchParams({ CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" });
    const ok = await verifyTwilioSignature("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", params, "0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
    expect(ok).toBe(true);
    expect(await verifyTwilioSignature("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", params, "nope")).toBe(false);
  });
});

describe("SMS rendering", () => {
  const job: DeliveryJob = {
    action: "send",
    attemptId: "a",
    outboxId: "o",
    event: "reminder_24h",
    recipient: "customer",
    destination: "+972541234567",
    template: "تذكير من {{business}}: موعدك ({{service}}) يوم {{date}} الساعة {{time}}. {{link}}",
    businessName: "DONIANA",
    appointment: {
      reference: "DN-ABCDEF",
      serviceNameAr: "بيرسينغ",
      locationNameAr: "الأنف",
      startsAt: "2026-11-02T08:00:00.000Z",
      totalPriceAgorot: 15000,
      customerName: "دنيا",
      customerPhone: "+972541234567",
      idempotencyKey: validBooking.idempotencyKey,
    },
  };

  it("renders Israel-local date/time and the management link", async () => {
    const body = await renderJob(job, { siteUrl: "https://doniana.example/", manageTokenSecret: SECRET });
    expect(body).toContain("الإثنين 02/11/2026");
    expect(body).toContain("10:00");
    expect(body).toContain("بيرسينغ (الأنف)");
    expect(body).toContain(`https://doniana.example/a#${await deriveManageToken(SECRET, validBooking.idempotencyKey)}`);
  });

  it("never puts customer links in owner messages", async () => {
    const body = await renderJob({ ...job, recipient: "owner" }, { siteUrl: "https://d.example", manageTokenSecret: SECRET });
    expect(body).not.toContain("/a#");
  });

  it("leaves unknown placeholders empty", () => {
    expect(renderTemplate("مرحبا {{name}} {{unknown}}", { name: "دنيا" })).toBe("مرحبا دنيا");
  });
});

describe("admin-account handler", () => {
  function accountDb(updateError: { message: string } | null = null) {
    const updateUserById = vi.fn(async (_id: string, changes: { email?: string }) => ({
      data: { user: { email: changes.email ?? "owner@doniana.test" } },
      error: updateError,
    }));
    const db = {
      rpc: vi.fn(async () => ({ data: true, error: null })),
      auth: { admin: { getUserById: vi.fn(async () => ({ data: { user: { email: "owner@doniana.test" } }, error: null })), updateUserById } },
    } as unknown as SupabaseClient;
    return { db, updateUserById };
  }

  it("refuses changes when the current password is wrong", async () => {
    const { db, updateUserById } = accountDb();
    await expect(
      handleAdminAccount({ currentPassword: "nope", newEmail: "me@gmail.com" }, "u1", deps(db), async () => false),
    ).rejects.toMatchObject({ status: 403, code: "wrong_password" });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("sets a confirmed new email and password for the signed-in admin only", async () => {
    const { db, updateUserById } = accountDb();
    const check = vi.fn(async () => true);
    const res = await handleAdminAccount({ currentPassword: "old", newEmail: " Me@Gmail.com ", newPassword: "a-long-password" }, "u1", deps(db), check);
    expect(check).toHaveBeenCalledWith("owner@doniana.test", "old");
    expect(updateUserById).toHaveBeenCalledWith("u1", { email: "me@gmail.com", email_confirm: true, password: "a-long-password" });
    expect(res.body).toEqual({ email: "me@gmail.com" });
  });

  it("rejects short passwords and reports a taken email", async () => {
    const { db } = accountDb({ message: "A user with this email address has already been registered" });
    await expect(handleAdminAccount({ currentPassword: "old", newPassword: "short" }, "u1", deps(db), async () => true)).rejects.toMatchObject({ status: 400 });
    await expect(handleAdminAccount({ currentPassword: "old", newEmail: "x@y.com" }, "u1", deps(db), async () => true)).rejects.toMatchObject({ status: 409, code: "email_taken" });
  });
});

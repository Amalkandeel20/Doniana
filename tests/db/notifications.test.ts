// Outbox processing against the real schema: the TypeScript worker drives the SQL state machine.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DevSmsProvider, type SendResult, type SmsMessage, type SmsProvider } from "../../supabase/functions/_shared/notifications/providers";
import { finishArgs, processOutbox, type BeginResult, type OutboxStore } from "../../supabase/functions/_shared/notifications/worker";
import { deriveManageToken, manageTokenHash } from "../../supabase/functions/_shared/crypto";
import { book, createTestDb, localDateIn, localInstant, openAllWeek, serviceId, sha256Hex, type Db } from "./harness";
import { randomUUID } from "node:crypto";

let db: Db;
let shaping: string;
const SECRET = "test-secret-test-secret-test-secret-0123456789";
const config = { siteUrl: "https://doniana.example", manageTokenSecret: SECRET };

function sqlStore(database: Db): OutboxStore {
  return {
    claim: (limit, lease) => database.query<{ id: string }>(`select id from public.claim_due_notifications($1, $2)`, [limit, lease]),
    begin: async (id, provider) =>
      (await database.query<{ r: BeginResult }>(`select public.begin_notification_delivery($1, $2) as r`, [id, provider]))[0]!.r,
    finish: async (attemptId, result) => {
      const a = finishArgs(attemptId, result);
      await database.query(`select public.finish_notification_delivery($1, $2, $3, $4, $5, $6, $7)`, [
        a.p_attempt_id, a.p_outcome, a.p_provider_message_id, a.p_provider_status, a.p_http_status, a.p_error, a.p_retryable,
      ]);
    },
  };
}

class RecordingProvider implements SmsProvider {
  readonly name = "fake";
  sent: SmsMessage[] = [];
  constructor(private respond: (m: SmsMessage) => SendResult = () => ({ outcome: "accepted", providerMessageId: `SM${randomUUID()}` })) {}
  async send(m: SmsMessage) {
    this.sent.push(m);
    return this.respond(m);
  }
}

async function statuses(appointmentId: string) {
  const rows = await db.query<{ event: string; status: string }>(
    `select event, status from public.notification_outbox where appointment_id = $1 order by event`,
    [appointmentId],
  );
  return Object.fromEntries(rows.map((r) => [r.event, r.status]));
}

/** Books with a token derived exactly like the create-booking Edge Function does. */
async function bookReal(startsAt: string) {
  const key = randomUUID();
  const token = await deriveManageToken(SECRET, key);
  const result = await book(db, { service: shaping, startsAt, key, token });
  expect(sha256Hex(token)).toBe(await manageTokenHash(token));
  return { ...result, token };
}

beforeAll(async () => {
  db = await createTestDb();
  shaping = await serviceId(db, "eyebrow-shaping");
}, 120_000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec(`delete from public.notification_outbox; delete from public.appointments;
    update public.notification_settings set owner_phone = '+972500000000', sms_enabled = true, reminder_max_lateness_minutes = 60;`);
  await openAllWeek(db, "00:00", "24:00");
});

describe("notification worker", () => {
  it("sends the confirmation and owner notification once, with a working management link", async () => {
    const { appointment, token } = await bookReal(await localInstant(db, localDateIn(3), "10:00"));
    const provider = new RecordingProvider();
    const report = await processOutbox(sqlStore(db), provider, config);
    expect(report).toMatchObject({ claimed: 2, sent: 2 });
    expect(await statuses(appointment.id)).toMatchObject({ booking_confirmed: "sent", owner_new_booking: "sent", reminder_24h: "pending" });

    const customer = provider.sent.find((m) => m.to === "+972541234567")!;
    expect(customer.body).toContain(`https://doniana.example/a#${token}`);
    expect(customer.body).toContain("تم تأكيد موعدك");
    expect(customer.body).toContain("10:00");
    const owner = provider.sent.find((m) => m.to === "+972500000000")!;
    expect(owner.body).toContain(appointment.reference as string);
    expect(owner.body).not.toContain("/a#");

    // Running again sends nothing new: no duplicate SMS.
    const again = await processOutbox(sqlStore(db), provider, config);
    expect(again.claimed).toBe(0);
    expect(provider.sent).toHaveLength(2);
  });

  it("does not let two concurrent workers send the same message", async () => {
    await bookReal(await localInstant(db, localDateIn(3), "11:00"));
    const provider = new RecordingProvider();
    const [a, b] = await Promise.all([processOutbox(sqlStore(db), provider, config), processOutbox(sqlStore(db), provider, config)]);
    expect(a.claimed + b.claimed).toBe(2);
    expect(provider.sent).toHaveLength(2);
  });

  it("sends the 24h reminder only when due, and only once", async () => {
    const { appointment } = await bookReal(await localInstant(db, localDateIn(3), "12:00"));
    const provider = new RecordingProvider();
    await processOutbox(sqlStore(db), provider, config);
    expect(provider.sent).toHaveLength(2);
    // Simulate time passing: make the reminder due now (scheduled_at itself stays start − 24h).
    await db.query(`update public.notification_outbox set next_attempt_at = now(),
      scheduled_at = (select starts_at - interval '24 hours' from public.appointments where id = $1)
      where appointment_id = $1 and event = 'reminder_24h'`, [appointment.id]);
    await db.query(`update public.notification_settings set reminder_max_lateness_minutes = 720`);
    // scheduled_at is in the future relative to now() here, so lateness never triggers.
    await processOutbox(sqlStore(db), provider, config);
    expect(provider.sent).toHaveLength(3);
    expect(provider.sent[2]!.body).toContain("تذكير");
    expect((await statuses(appointment.id)).reminder_24h).toBe("sent");
    await processOutbox(sqlStore(db), provider, config);
    expect(provider.sent).toHaveLength(3);
  });

  it("skips a reminder whose appointment was cancelled, and a reminder that is far too late", async () => {
    const one = await bookReal(await localInstant(db, localDateIn(3), "13:00"));
    const two = await bookReal(await localInstant(db, localDateIn(3), "15:00"));
    // Force the cancelled appointment's reminder back to pending to prove the worker re-checks.
    await db.query(`update public.appointments set status = 'cancelled', cancelled_at = now(), cancelled_by = 'admin' where id = $1`, [one.appointment.id]);
    await db.query(`update public.notification_outbox set status = 'pending', next_attempt_at = now() where appointment_id = $1 and event = 'reminder_24h'`, [one.appointment.id]);
    await db.query(`update public.notification_outbox set next_attempt_at = now(), scheduled_at = now() - interval '3 hours'
      where appointment_id = $1 and event = 'reminder_24h'`, [two.appointment.id]);
    const provider = new RecordingProvider();
    await processOutbox(sqlStore(db), provider, config);
    expect((await statuses(one.appointment.id)).reminder_24h).toBe("cancelled");
    expect(["skipped", "cancelled"]).toContain((await statuses(two.appointment.id)).reminder_24h);
    expect(provider.sent.some((m) => m.body.includes("تذكير"))).toBe(false);
  });

  it("retries definite failures with backoff and gives up after max attempts", async () => {
    const { appointment } = await bookReal(await localInstant(db, localDateIn(4), "10:00"));
    await db.query(`update public.notification_outbox set max_attempts = 2 where appointment_id = $1`, [appointment.id]);
    const failing = new RecordingProvider(() => ({ outcome: "failed", retryable: true, error: "twilio_500", httpStatus: 500 }));
    await processOutbox(sqlStore(db), failing, config);
    const [row] = await db.query<{ status: string; attempts: number; wait: number }>(
      `select status, attempts, extract(epoch from next_attempt_at - now())::int as wait from public.notification_outbox
        where appointment_id = $1 and event = 'booking_confirmed'`, [appointment.id]);
    expect(row).toMatchObject({ status: "pending", attempts: 1 });
    expect(row!.wait).toBeGreaterThan(20);
    await db.query(`update public.notification_outbox set next_attempt_at = now() where appointment_id = $1`, [appointment.id]);
    await processOutbox(sqlStore(db), failing, config);
    expect((await statuses(appointment.id)).booking_confirmed).toBe("failed");
    const attempts = await db.query(`select count(*)::int as n from public.notification_delivery_attempts a
      join public.notification_outbox o on o.id = a.outbox_id where o.appointment_id = $1 and o.event = 'booking_confirmed'`, [appointment.id]);
    expect(attempts[0]).toEqual({ n: 2 });
  });

  it("marks a send interrupted mid-call as unknown and never resends it automatically", async () => {
    const { appointment } = await bookReal(await localInstant(db, localDateIn(4), "12:00"));
    const store = sqlStore(db);
    const claimed = await store.claim(10, 60);
    const job = await store.begin(claimed[0]!.id, "fake"); // attempt opened, then the worker "dies"
    expect(job.action).toBe("send");
    await db.query(`update public.notification_outbox set locked_until = now() - interval '1 second' where status = 'processing'`);
    const provider = new RecordingProvider();
    await processOutbox(store, provider, config);
    const rows = await db.query<{ status: string }>(`select status from public.notification_outbox where id = $1`, [claimed[0]!.id]);
    expect(rows[0]!.status).toBe("unknown");
    expect(provider.sent.every((m) => m.body !== "")).toBe(true);
    expect(provider.sent).toHaveLength(claimed.length - 1);
    void appointment;
  });

  it("records the dev adapter as dev_logged, never as sent", async () => {
    const { appointment } = await bookReal(await localInstant(db, localDateIn(4), "14:00"));
    await processOutbox(sqlStore(db), new DevSmsProvider(), config);
    expect(await statuses(appointment.id)).toMatchObject({ booking_confirmed: "dev_logged", owner_new_booking: "dev_logged" });
  });

  it("skips owner notifications when no owner phone is configured", async () => {
    await db.query(`update public.notification_settings set owner_phone = null`);
    const { appointment } = await bookReal(await localInstant(db, localDateIn(4), "16:00"));
    await processOutbox(sqlStore(db), new RecordingProvider(), config);
    expect((await statuses(appointment.id)).owner_new_booking).toBe("skipped");
  });

  it("tracks provider delivery receipts", async () => {
    const { appointment } = await bookReal(await localInstant(db, localDateIn(5), "10:00"));
    const provider = new RecordingProvider(() => ({ outcome: "accepted", providerMessageId: `SM-${randomUUID()}`, providerStatus: "queued" }));
    await processOutbox(sqlStore(db), provider, config);
    const [row] = await db.query<{ provider_message_id: string }>(
      `select provider_message_id from public.notification_outbox where appointment_id = $1 and event = 'booking_confirmed'`, [appointment.id]);
    await db.query(`select public.record_delivery_status($1, 'delivered')`, [row!.provider_message_id]);
    expect((await statuses(appointment.id)).booking_confirmed).toBe("delivered");
  });
});

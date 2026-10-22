// Competing bookings. With TEST_DATABASE_URL (CI: postgres service) each booking runs on its own
// connection, so the transactions genuinely race; on PGlite the same calls are interleaved on one
// connection and still must yield exactly one winner.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { book, createTestDb, localDateIn, localInstant, openAllWeek, serviceId, type Db } from "./harness";

let db: Db;
let shaping: string;
let lamination: string;

beforeAll(async () => {
  db = await createTestDb();
  shaping = await serviceId(db, "eyebrow-shaping");
  lamination = await serviceId(db, "brow-lamination");
  await openAllWeek(db, "08:00", "20:00");
}, 120_000);
afterAll(async () => db?.close());

async function race(attempts: { service: string; startsAt: string }[]) {
  const runners: Db[] = db.connections ? await db.connections(attempts.length) : attempts.map(() => db);
  try {
    return await Promise.allSettled(attempts.map((a, i) => book(runners[i]!, { ...a, phone: `+9725412345${String(i).padStart(2, "0")}` })));
  } finally {
    if (db.connections) await Promise.all(runners.map((r) => r.close()));
  }
}

describe(`simultaneous competing bookings (${process.env.TEST_DATABASE_URL ? "real multi-connection" : "PGlite"})`, () => {
  it("confirms exactly one of ten customers booking the identical slot", async () => {
    const startsAt = await localInstant(db, localDateIn(10), "10:00");
    const results = await race(Array.from({ length: 10 }, () => ({ service: shaping, startsAt })));
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    for (const r of results.filter((x) => x.status === "rejected")) {
      expect(String((r as PromiseRejectedResult).reason.message)).toContain("slot_unavailable");
    }
  });

  it("confirms at most one of overlapping ranges with different start times", async () => {
    const date = localDateIn(11);
    const attempts = await Promise.all(
      ["10:00", "10:15", "10:30", "10:45", "11:00", "11:10"].map(async (t) => ({ service: lamination, startsAt: await localInstant(db, date, t) })),
    );
    const started = Date.now();
    const results = await race(attempts); // every pair overlaps (75-minute service)
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((x) => x.status === "rejected")) {
      // Losers get a clear "slot taken" answer — never a deadlock or internal error.
      expect(String((r as PromiseRejectedResult).reason.message)).toContain("slot_unavailable");
    }
    expect(Date.now() - started).toBeLessThan(2_000);
    const [{ n }] = (await db.query<{ n: number }>(
      `select count(*)::int as n from public.appointments where status = 'confirmed' and (starts_at at time zone 'Asia/Jerusalem')::date = $1::date`,
      [date],
    )) as [{ n: number }];
    expect(n).toBe(1);
  });

  it("creates a single appointment when the same request is submitted many times at once", async () => {
    const startsAt = await localInstant(db, localDateIn(12), "09:00");
    const key = randomUUID();
    const token = `tok_${randomUUID()}`;
    const runners: Db[] = db.connections ? await db.connections(5) : Array.from({ length: 5 }, () => db);
    try {
      const results = await Promise.all(runners.map((r) => book(r, { service: shaping, startsAt, key, token })));
      expect(new Set(results.map((r) => r.appointment.id)).size).toBe(1);
      expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    } finally {
      if (db.connections) await Promise.all(runners.map((r) => r.close()));
    }
  });
});

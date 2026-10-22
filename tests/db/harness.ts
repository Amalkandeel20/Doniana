// Database test harness: applies the real migrations to a real PostgreSQL engine.
// * Default: PGlite (PostgreSQL compiled to WASM, in-process) — no Docker needed.
// * TEST_DATABASE_URL set (CI uses a postgres:15 service): a real server, which also enables the
//   multi-connection concurrency tests.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  /** Separate connections for concurrency tests (real server only). */
  connections?: (n: number) => Promise<Db[]>;
  close(): Promise<void>;
  kind: "pglite" | "postgres";
}

const root = join(import.meta.dirname, "..", "..");

export function migrationSql(): string[] {
  const dir = join(root, "supabase", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"));
}

async function applySchema(db: Db) {
  await db.exec(readFileSync(join(import.meta.dirname, "supabase-stub.sql"), "utf8"));
  for (const sql of migrationSql()) await db.exec(sql);
}

export async function createTestDb(): Promise<Db> {
  const url = process.env.TEST_DATABASE_URL;
  if (url) {
    const pg = await import("pg");
    const admin = new pg.default.Client({ connectionString: url });
    await admin.connect();
    const dbName = `doniana_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    await admin.query(`create database ${dbName}`);
    const testUrl = new URL(url);
    testUrl.pathname = `/${dbName}`;
    const pool = new pg.default.Pool({ connectionString: testUrl.toString(), max: 20 });
    const wrap = (runner: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Db => ({
      kind: "postgres",
      query: async <T,>(sql: string, params?: unknown[]) => (await runner.query(sql, params)).rows as T[],
      exec: async (sql: string) => void (await runner.query(sql)),
      close: async () => {},
    });
    const db: Db = {
      ...wrap(pool),
      connections: async (n) => {
        const clients = await Promise.all(Array.from({ length: n }, () => pool.connect()));
        return clients.map((c) => ({ ...wrap(c), close: async () => c.release() }));
      },
      close: async () => {
        await pool.end();
        await admin.query(`drop database if exists ${dbName} with (force)`);
        await admin.end();
      },
    };
    await applySchema(db);
    return db;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const pglite = await PGlite.create();
  const db: Db = {
    kind: "pglite",
    query: async <T,>(sql: string, params?: unknown[]) => (await pglite.query<T>(sql, params)).rows,
    exec: async (sql: string) => void (await pglite.exec(sql)),
    close: () => pglite.close(),
  };
  await applySchema(db);
  return db;
}

/** Runs `sql` as an API role inside a transaction, like PostgREST does. */
export async function asRole<T = Record<string, unknown>>(
  db: Db,
  role: "anon" | "authenticated" | "service_role",
  sql: string,
  params: unknown[] = [],
  userId?: string,
): Promise<T[]> {
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)`, [
      userId ?? "",
      role,
    ]);
    await db.exec(`set local role ${role}`);
    const rows = await db.query<T>(sql, params);
    await db.exec("commit");
    return rows;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}

export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

// ---------------------------------------------------------------- fixtures

export const TZ = "Asia/Jerusalem";

/** A local date (YYYY-MM-DD) `days` ahead of today in Asia/Jerusalem. */
export function localDateIn(days: number): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(new Date(Date.now() + days * 86_400_000));
}

/** UTC instant for a local wall time, computed by PostgreSQL itself. */
export async function localInstant(db: Db, date: string, time: string): Promise<string> {
  const [row] = await db.query<{ t: Date }>(`select ($1::date + $2::time) at time zone '${TZ}' as t`, [date, time]);
  return new Date(row!.t).toISOString();
}

export async function openAllWeek(db: Db, open = "08:00", close = "20:00") {
  await db.query(`update public.business_hours set is_open = true, open_time = $1, close_time = $2`, [open, close]);
}

export async function serviceId(db: Db, slug: string): Promise<string> {
  const [row] = await db.query<{ id: string }>(`select id from public.services where slug = $1`, [slug]);
  return row!.id;
}

export async function addonId(db: Db, slug: string): Promise<string> {
  const [row] = await db.query<{ id: string }>(`select id from public.service_addons where slug = $1`, [slug]);
  return row!.id;
}

export async function locationId(db: Db, code: string): Promise<string> {
  const [row] = await db.query<{ id: string }>(`select id from public.service_locations where code = $1`, [code]);
  return row!.id;
}

export interface BookArgs {
  service: string;
  startsAt: string;
  addonIds?: string[];
  locationId?: string | null;
  name?: string;
  phone?: string;
  key?: string;
  token?: string;
  source?: "online" | "admin";
  override?: boolean;
  notify?: boolean;
}

export interface Booked {
  replayed: boolean;
  appointment: Record<string, unknown> & { id: string; starts_at: string; status: string };
  token: string;
}

export async function book(db: Db, args: BookArgs): Promise<Booked> {
  const key = args.key ?? randomUUID();
  const token = args.token ?? `tok_${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`;
  const [row] = await db.query<{ r: { replayed: boolean; appointment: Booked["appointment"] } }>(
    `select public.book_appointment($1, $2, $3, $4::uuid[], $5, $6, $7, $8, $9::public.appointment_source, $10, null, null, $11) as r`,
    [
      key,
      sha256Hex(token),
      args.service,
      args.addonIds ?? [],
      args.locationId ?? null,
      args.startsAt,
      args.name ?? "دنيا اختبار",
      args.phone ?? "+972541234567",
      args.source ?? "online",
      args.override ?? false,
      args.notify ?? true,
    ],
  );
  return { ...row!.r, token };
}

export async function expectDbError(promise: Promise<unknown>, message: string) {
  try {
    await promise;
  } catch (e) {
    const msg = (e as Error).message;
    if (!msg.includes(message)) throw new Error(`Expected error "${message}" but got "${msg}"`);
    return;
  }
  throw new Error(`Expected error "${message}" but the call succeeded`);
}

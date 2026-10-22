# Local development

## Prerequisites

- Node.js ≥ 20.11 with npm, and Git
- Docker Desktop, only if you want the full local Supabase stack (`supabase start`). Everything
  except the browser end-to-end tests also works without Docker.

## 1. Install

```bash
git clone <repo> doniana && cd doniana
npm ci
```

## 2. Start Supabase locally (Docker)

```bash
npx supabase start
npx supabase status          # prints API URL, anon key, service_role key
```

`supabase start` applies `supabase/migrations/*` and then `supabase/seed.sql`. The seed is for
development only: it opens placeholder working hours so you can click through a booking. Reset at
any time with `npx supabase db reset`.

## 3. Configure

Frontend: `.env.local`, which holds public values only.

```bash
cp .env.example .env.local
# VITE_SUPABASE_URL=http://127.0.0.1:54321
# VITE_SUPABASE_ANON_KEY=<anon key from supabase status>
```

Edge Functions: `supabase/functions/.env`. It is git-ignored and must never be committed.

```bash
cp supabase/functions/.env.example supabase/functions/.env
openssl rand -base64 48   # → MANAGE_TOKEN_SECRET
openssl rand -base64 24   # → RATE_LIMIT_SALT
openssl rand -base64 48   # → CRON_SECRET
# keep SMS_PROVIDER=dev locally: messages are recorded in the outbox and nothing is sent
```

## 4. Run

```bash
npx supabase functions serve --env-file supabase/functions/.env
npm run dev     # http://localhost:5173
```

## 5. Create your local admin

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<service_role key> \
ADMIN_PASSWORD='choose-a-local-password' node scripts/create-admin.mjs admin@doniana.local "Owner"
```

Then sign in at http://localhost:5173/admin.

## 6. Notifications locally

Locally `pg_cron` is not set up to call your functions, so trigger the worker by hand to process
the outbox:

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/process-notifications -H "x-cron-secret: <CRON_SECRET>"
```

Rows become `dev_logged`, meaning they were recorded and not sent. Inspect them in `/admin/notifications`.

## Useful commands

| | |
|---|---|
| `npx supabase migration new <name>` | Create a new migration (never edit applied ones) |
| `npx supabase db reset` | Rebuild the local DB from migrations + seed |
| `npm run test:db` | DB tests without Docker (PGlite) |
| `TEST_DATABASE_URL=postgres://… npm run test:db` | Same tests on a real server, with true multi-connection concurrency |

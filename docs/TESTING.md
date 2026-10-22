# Testing

| Suite | Command | Runs against | Covers |
|---|---|---|---|
| Unit | `npm run test:unit` | Node + jsdom | Availability engine (hours, breaks, blocks, buffers, notice, horizon, DST), overlap detection, pricing (tint ₪230 / 75 min), phone normalisation, 24h cancellation cutoff, 24h reminder time, request validation, Edge Function handlers (idempotency, token hashing, rate limits, honeypot, Turnstile, error hygiene), Twilio adapter & webhook signature, SMS rendering |
| Component | (same run) | React Testing Library | Service selection + tint add-on, Arabic validation errors, step indicator, booking draft state (back-navigation keeps data; changing service/date/add-ons invalidates the time) |
| Database integration | `npm run test:db` | PGlite locally; PostgreSQL 15 in CI | Real migrations: exact catalog, automatic confirmation, overlap constraint, buffers, hours/breaks/blocks/horizon, idempotency, tomorrow & short-notice bookings, historical price snapshots, 24h boundary (exactly 24h allowed, 23h59m denied), slot release, reminder scheduling/rescheduling/cancellation, admin RPCs, audit log, RLS for anon/authenticated/admin |
| Notification outbox | (same run) | PGlite / PostgreSQL | Confirmation + owner SMS once only, concurrent workers, reminder only when due, cancelled/late reminders skipped, retry with backoff, `unknown` never resent, dev adapter never "sent", delivery receipts |
| Concurrency | (same run) | real multi-connection PostgreSQL when `TEST_DATABASE_URL` is set | 10 customers same slot → exactly 1; 6 overlapping ranges → exactly 1, others get `slot_unavailable` quickly (no deadlocks); 5 identical submissions → 1 appointment |
| End-to-end | `npm run e2e` | Real local Supabase + Edge Functions + Vite | Home → Brows → service → date/time → details → review → confirm → management link → cancel → time available again; overlapping times hidden; piercing with location; tomorrow; fully booked day; invalid phone; 24h+ allowed / 23h59m refused (UI and API); admin login, wrong password, non-admin refused, unauthenticated blocked, admin-created appointment; RTL; mobile layouts (Pixel 7, iPhone 13) |
| Lighthouse | CI e2e job | `vite preview` | Accessibility ≥ 0.95 (blocking), performance ≥ 0.85 and best practices ≥ 0.9 (warnings) |

## Running end-to-end tests locally

```bash
npx supabase start
npx supabase functions serve --env-file supabase/functions/.env &
eval "$(npx supabase status -o env | sed 's/^/export /')"
export VITE_SUPABASE_URL=$API_URL VITE_SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_URL=$API_URL SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
npx playwright install chromium   # add webkit and PW_WEBKIT=1 for real Safari
npm run e2e
```

The e2e helpers refuse to run unless `SUPABASE_URL` points at `localhost`/`127.0.0.1`, so they
cannot touch a hosted database. The global setup opens every day 08:00–20:00 and creates two test
accounts in the local database only.

## Why the exact 24-hour boundary is tested in the database

A browser test cannot hit "exactly 24h00m00s" reliably because time passes between steps. The SQL
functions accept an injected `now` (service role only), so `tests/db/booking.test.ts` proves the
exact boundary. The e2e suite proves the rule end to end with 24h+3m (allowed) and 23h59m (refused
in the UI and by a direct API call).

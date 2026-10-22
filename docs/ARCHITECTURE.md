# DONIANA — Architecture

Arabic-first (RTL) booking site for DONIANA · Piercing & Eyebrows Lamination.

## 1. System overview

```
 Customer phone / Owner phone
          │  HTTPS
          ▼
 Cloudflare Worker (static assets, SPA fallback, security headers)
          │  React SPA (Vite build)            ┌──────────────────────────────┐
          ├── public reads (RLS: services, ───►│ Supabase PostgreSQL           │
          │   hours, settings, portfolio)      │  • exclusion constraint       │
          ├── Edge Functions (Deno) ──────────►│  • SECURITY DEFINER RPCs      │
          │    availability                    │  • triggers → outbox, audit   │
          │    create-booking                  │  • RLS on every table         │
          │    manage-appointment              │  • pg_cron → process-notif.   │
          │    admin-create-appointment        └──────────────┬───────────────┘
          │    process-notifications (cron) ───► SMS provider (Twilio adapter / dev adapter)
          │    sms-status (provider webhook)  ◄──── delivery receipts
          └── Admin (Supabase Auth JWT) → RLS reads + admin_* RPCs
```

Principles

* **The database is the source of truth for booking integrity.** An exclusion constraint
  (`tstzrange(starts_at, occupied_until) &&`, partial on non-cancelled rows) makes
  overlapping appointments impossible regardless of which code path inserts them.
* **Prices/durations are computed server-side** inside `book_appointment()` from the
  catalog and snapshotted on the appointment, so later catalog edits never change history.
* **The browser never holds privileged credentials.** Only the publishable (anon) key is
  bundled. Customer-facing writes go through Edge Functions using the service role.
* **Pure domain logic is shared** (`supabase/functions/_shared/domain/*`) between Edge
  Functions (Deno) and the React app (Vite alias `@shared`) and unit-tested with Vitest.

## 2. Booking integrity

1. Client loads availability: `availability` function reads hours, breaks, blocks and busy
   intervals (start/end only — no PII) and runs the shared slot engine.
2. Client confirms with a client-generated `idempotencyKey` (UUID v4, kept in session state
   so double-taps and retries reuse it).
3. `create-booking` validates input (Zod), rate limits per IP hash, checks honeypot and
   optional Cloudflare Turnstile, normalises the phone, derives the management token, and calls
   `book_appointment()`.
4. `book_appointment()` (one transaction): idempotency lookup → load service/add-ons/location
   → compute total price & duration → validate not-in-past, horizon, working hours, breaks,
   blocked ranges → `INSERT … status='confirmed'`. The exclusion constraint rejects any race
   loser with `slot_unavailable`.
5. Triggers enqueue SMS (customer confirmation, owner notification, 24h reminder when
   `starts_at − 24h` is still in the future) and write the audit log — in the same transaction.
6. Only after the RPC returns does the client show success.

## 3. Management links

* `token = base64url(HMAC-SHA256(MANAGE_TOKEN_SECRET, idempotency_key))`; the DB stores only
  `sha256(token)`. A database leak alone cannot produce working links, while the notification
  worker can rebuild the link for SMS without the plaintext ever being stored.
* URL form: `https://<domain>/a#<token>` — the token is in the **fragment**, which browsers never
  send in HTTP requests, so it does not reach Cloudflare logs or Referer headers. The page also
  sets `Referrer-Policy: no-referrer` and loads no third-party resources.

## 4. Cancellation policy

`cancel_appointment_by_token()` allows customer cancellation only when
`starts_at − now() >= interval '24 hours'` (timestamp arithmetic, not calendar days). Admin
cancellation (`admin_cancel_appointment`) is always allowed. Cancelling sets `status='cancelled'`
(rows are never deleted); the partial exclusion constraint immediately frees the slot.

## 5. Notifications (SMS)

* `notification_outbox` (unique `dedupe_key`) ← triggers on `appointments`.
* `process-notifications` runs every 30 s via `pg_cron` + `pg_net`; it claims due rows with
  `FOR UPDATE SKIP LOCKED`, renders Arabic templates, sends through the configured adapter, and
  records each `notification_delivery_attempts` row.
* Retries with exponential backoff only for *definite* failures. If a worker dies after calling
  the provider but before recording the result, the row is marked `unknown` (never auto-resent)
  — no duplicate SMS.
* Reminder: `scheduled_at = starts_at − 24h`; skipped if booking happens later than that;
  cancelled on cancellation; replaced on reschedule; skipped if the worker is too late
  (`reminder_max_lateness_minutes`) or the appointment is no longer confirmed.
* Adapters: `twilio` (production) and `dev` (records locally, status `dev_logged`, never claims
  delivery). Production refuses to run with `dev` or with missing credentials.

## 6. Data model

| Table | Purpose | Public access |
|---|---|---|
| services | catalog (ar/en names, price in agorot, duration, image, category) | read active |
| service_addons | e.g. tint +₪10 / +0 min | read active |
| service_locations | piercing location (ear/nose/navel) with optional deltas (default 0) | read active |
| business_hours | open/close per weekday (Asia/Jerusalem local time) | read |
| business_breaks | recurring breaks per weekday | none |
| blocked_time_ranges | days off, holidays, partial closures, custom blocks (timestamptz) | none |
| business_settings | public info + scheduling knobs (slot step, buffer, horizon, notice) | read |
| notification_settings | owner phone, sms toggle, reminder lateness | none |
| notification_templates | Arabic SMS templates per event | none |
| portfolio_images | gallery (Supabase Storage paths) | read published |
| appointments | snapshots, status, token hash, idempotency key | none |
| appointment_addons | add-on snapshots | none |
| notification_outbox / notification_delivery_attempts | queue + attempts | none |
| appointment_audit_log | every insert/update with actor + diff | none |
| admin_profiles | which auth users are admins | own row |
| rate_limit_counters | fixed-window counters per hashed key | none |

All money is integer agorot. All instants are `timestamptz` (UTC); schedules (`time`) are
interpreted in `Asia/Jerusalem`, so DST transitions are handled by PostgreSQL / `Intl`.

## 7. Pages

| Route | Page |
|---|---|
| `/` | Home: hero, CTA "احجزي موعدك", services intro, portfolio, contact, Instagram, WhatsApp |
| `/book` | Category cards (خدمات الحواجب / خدمات البيرسينغ) |
| `/book/:category` | 4-step flow: service → date & time → details → review & confirm → success |
| `/a#token` | Private appointment management (view / cancel) |
| `/admin/login` | Admin sign-in |
| `/admin` | Calendar (day/week/month) |
| `/admin/appointments` | Search & lists (upcoming / past / cancelled), create/edit/cancel/complete |
| `/admin/availability` | Weekly hours, breaks, days off/holidays/blocks, buffer |
| `/admin/services` | Services, add-ons, locations, images |
| `/admin/portfolio` | Gallery uploads |
| `/admin/notifications` | SMS log, retry |
| `/admin/settings` | Business info & scheduling settings |

## 8. Implementation phases

1. Architecture (this document) · 2. Design system & RTL · 3. Customer site · 4. Booking engine &
DB conflict prevention · 5. Management links & cancellation · 6. Admin · 7. Notifications ·
8. QA (unit, component, DB integration incl. real-Postgres concurrency, Playwright) ·
9. Deployment (see `DEPLOYMENT.md`).

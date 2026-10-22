# Security, privacy, retention and backups

## Threat model and controls

| Risk | Control |
|---|---|
| Double booking (races, retries, double taps) | `EXCLUDE USING gist (tstzrange(starts_at, occupied_until) WITH &&) WHERE status <> 'cancelled'`; bookings serialised with a transaction advisory lock (no deadlocks); idempotency key unique per appointment; revalidation inside `book_appointment()` |
| Tampered prices or durations | Computed in SQL from the catalog. The client never sends prices. Snapshots stored per appointment |
| Unauthorised cancellation | 256-bit HMAC-derived token, only `sha256(token)` stored; token sent in the URL **fragment** (never reaches servers, logs or Referer); 24h rule enforced in SQL; rate limit per IP |
| Reading other customers' data | RLS on every table; anon can read only the catalog, opening hours, public business info and published portfolio. Appointments, outbox, audit and settings are readable by admins only. Availability responses contain start times only |
| Privileged keys in the browser | Only the publishable anon key is bundled. CI fails if server secret names appear in `dist/`. Service role is used only inside Edge Functions |
| Admin takeover | Supabase Auth with sign-ups disabled; admin = row in `admin_profiles` (provisioned via script); every admin RPC re-checks `is_admin()`; admin pages `noindex`, `no-store` |
| Bots / abuse | Honeypot field, optional Cloudflare Turnstile, DB-backed rate limits (availability 120/min/IP, booking 10/10min/IP and 6/day/phone, manage 30/10min/IP). IPs are salted and hashed, never stored raw |
| SMS duplicates / false "sent" | Outbox with unique dedupe keys, `FOR UPDATE SKIP LOCKED`, an attempt row opened before each provider call; interrupted sends become `unknown` and are never auto-resent; dev adapter records `dev_logged` and is refused in production |
| XSS / clickjacking / injection | React escaping, no `dangerouslySetInnerHTML`; strict CSP; `frame-ancestors 'none'`; all SQL parameterised in functions with `search_path=''` |
| Information leaks in errors | Edge Functions return error codes only; internal errors are logged without request bodies |
| Accountability | `appointment_audit_log` records every create/update/status change with actor (customer/admin/system) and admin user ID |

## Privacy (Israel)

The site stores a customer's **full name and mobile number**, plus appointment details, solely to
manage the booking and send related SMS. Relevant framework: the Protection of Privacy Law
5741-1981 (as amended, including Amendment 13 in force since August 2025) and the Privacy
Protection (Data Security) Regulations 5777-2017. **This is not legal advice. The owner should
confirm obligations with an Israeli privacy lawyer before launch.** Measures already built in:

- Data minimisation: no email, no account, no date of birth, no free-text health data.
- Purpose limitation: data is used only for the appointment. The SMS templates are transactional.
- Access control: only the owner's admin account can read customer data. Staff accounts are
  individual (never shared) and can be removed by deleting the `admin_profiles` row.
- Security: encryption in transit (HTTPS/TLS everywhere) and at rest (Supabase), audit log, least privilege.
- Data location: choose an EU Supabase region. Israel recognises the EU as providing adequate
  protection for transfers. Twilio (US) processes phone numbers to deliver SMS, so list it as a
  processor in the privacy notice.
- **To do before launch (client):** publish a short Arabic/Hebrew privacy notice (who controls the
  data, purpose, retention, how to ask for access/correction/deletion, processors: Supabase,
  Cloudflare, Twilio) and link it from the footer.

## Retention and deletion

Proposed default, pending the client's decision: keep identifiable appointment data for **24 months** after the
appointment for accounting and customer history, then anonymise.

- Anonymise in bulk (admin or service role). Run monthly, or schedule it with `pg_cron` once the period is approved:
  ```sql
  select public.anonymize_appointments_before(now() - interval '24 months');
  ```
  It clears name, phone and notes, keeps prices/times for statistics, and scrubs the personal fields from the audit log.
- Delete on request (right to erasure): in the SQL editor, as the project owner,
  ```sql
  -- verify first
  select id, reference, starts_at from appointments where customer_phone = '+9725XXXXXXXX';
  select public.anonymize_appointments_before(now()); -- or target specific rows:
  update appointments set customer_name = null, customer_phone = null, notes = null, anonymized_at = now()
   where customer_phone = '+9725XXXXXXXX' and status <> 'confirmed';
  ```
  Cancel any future appointment first. Record the request date in your own log.
- Rows are never hard-deleted during normal operation (cancellations keep history).
- Rate-limit counters are purged daily. SMS bodies are not stored, only status metadata.

## Backups and recovery

- **Supabase Pro**: daily automatic backups (7 days). Add **Point-in-Time Recovery** for
  minute-level restores if the budget allows. The free tier has no managed backups, so do not run
  production on it.
- **Independent weekly logical backup** (recommended, stored encrypted outside Supabase):
  ```bash
  supabase db dump --linked -f backup-schema.sql
  supabase db dump --linked --data-only -f backup-data.sql
  gpg --encrypt --recipient <owner-key> backup-data.sql   # contains personal data: encrypt it
  ```
- **Restore drill**, at least once before launch and then every quarter:
  1. Create a scratch Supabase project, or run `supabase start` locally.
  2. Apply `backup-schema.sql`, then `backup-data.sql` (or restore a dashboard backup into a new project).
  3. Run `npm run test:db` against it (`TEST_DATABASE_URL=…`) and spot-check that future appointments match the admin calendar.
  4. Record the date and duration (RTO) and the backup age (RPO) in the ops log.
- Storage images: download the `service-images` and `portfolio` buckets periodically. They are not covered by database backups.

## Secrets

| Secret | Where | Rotation |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase (auto), GitHub never | rotate in dashboard if exposed |
| `MANAGE_TOKEN_SECRET` | Edge secrets | rotating invalidates all existing customer links. Do it only if leaked, and resend links |
| `RATE_LIMIT_SALT`, `CRON_SECRET` | Edge secrets (+ Vault for cron) | anytime (update Vault together with `CRON_SECRET`) |
| `TWILIO_AUTH_TOKEN` | Edge secrets | per Twilio policy |
| `CLOUDFLARE_API_TOKEN`, `SUPABASE_ACCESS_TOKEN`, DB password | GitHub secrets | yearly |

Report a vulnerability privately to the repository owner. Do not open a public issue.

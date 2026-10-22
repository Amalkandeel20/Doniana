# Deployment

Two fully separate environments, each with its own Supabase project and Cloudflare Worker:

| | Staging | Production |
|---|---|---|
| Supabase project | `doniana-staging` | `doniana-prod` (Pro plan recommended: daily backups, no pausing) |
| Cloudflare Worker | `doniana-staging` (`*.workers.dev`) | `doniana` + custom domain |
| SMS | `dev` adapter, or Twilio test credentials | Twilio (live) |
| Deployed by | automatically after CI passes on `main` | manual run / `v*` tag, gated by the GitHub `production` environment (required reviewer) |

Local development never touches either one. `seed.sql` is applied only by `supabase start` /
`db reset` locally, never by `supabase db push`.

## 1. Supabase (once per environment)

1. Create the project in region **eu-central-1 (Frankfurt)** or the closest EU region (see SECURITY.md → data location).
2. Authentication → Providers: keep **Email** enabled and turn **sign-ups off**, since admins are provisioned manually. Set the Site URL to the environment's URL.
3. Apply the schema: `supabase link --project-ref <ref>` and then `supabase db push`. CI does this on every deploy.
4. Vault secrets used by the 30-second notification job (SQL editor):
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<same value as CRON_SECRET>', 'cron_secret');
   ```
   Check that the job is running: `select * from cron.job;` and `select * from cron.job_run_details order by start_time desc limit 5;`.
5. Edge Function secrets:
   ```bash
   supabase secrets set --project-ref <ref> \
     APP_ENV=production \
     SITE_URL=https://<domain> \
     ALLOWED_ORIGINS=https://<domain>,https://www.<domain> \
     MANAGE_TOKEN_SECRET="$(openssl rand -base64 48)" \
     RATE_LIMIT_SALT="$(openssl rand -base64 24)" \
     CRON_SECRET="<value stored in vault as cron_secret>" \
     SMS_PROVIDER=twilio \
     TWILIO_ACCOUNT_SID=AC… TWILIO_AUTH_TOKEN=… \
     TWILIO_FROM=<approved sender ID or number>   # or TWILIO_MESSAGING_SERVICE_SID=MG…
     SMS_STATUS_CALLBACK_URL=https://<ref>.supabase.co/functions/v1/sms-status \
     TURNSTILE_SECRET_KEY=…                        # optional anti-bot
   ```
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
   **Never rotate `MANAGE_TOKEN_SECRET` casually.** Doing so invalidates every existing management link.
6. Deploy functions with `supabase functions deploy --project-ref <ref>`. `verify_jwt` is configured per function in `supabase/config.toml`.
7. Create the owner's account:
   `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/create-admin.mjs owner@… "اسم المالكة"`.
8. In `/admin`, set working hours, owner phone, contact links and photos. Nothing can be booked until working hours are set: production starts with every day closed on purpose.

## 2. SMS provider (Twilio adapter)

- Israel supports alphanumeric sender IDs. Register/approve "DONIANA" (or use an Israeli
  long number / Messaging Service) according to Twilio's current Israel requirements before launch.
- Messages are transactional only (confirmation, reminder, changes). Do not add marketing text:
  that would fall under Israel's anti-spam rules (Communications Law §30A) and require prior consent.
- Arabic SMS use UCS-2 encoding at 70 characters per segment. The default templates are 2–3 segments. Costs per segment
  are the client's decision (see OPEN-QUESTIONS.md).
- If credentials are missing, notifications **fail visibly** (`failed`, reason
  `sms_provider_not_configured`) and are never marked as sent. The `dev` adapter is refused when
  `APP_ENV=production`.
- A different provider means adding a class implementing `SmsProvider` in
  `supabase/functions/_shared/notifications/providers.ts` and registering it in `createSmsProvider()`.

## 3. Cloudflare

1. Create an API token with the "Edit Cloudflare Workers" template and note the account ID.
2. Add the domain to Cloudflare and uncomment the `routes` in `wrangler.jsonc` (production) with
   `custom_domain: true`. Cloudflare provisions HTTPS automatically. Turn on "Always Use HTTPS".
3. `npm run build` writes `dist/_headers`: CSP limited to the environment's Supabase origin (plus
   Turnstile if enabled), HSTS, `no-referrer` + `no-store` for `/a`, and `noindex` for `/a` and `/admin`.
4. Optional anti-bot: create a Turnstile widget for the domain. Set `VITE_TURNSTILE_SITE_KEY`
   (public) and `TURNSTILE_SECRET_KEY` (Edge secret).

## 4. GitHub configuration

Create GitHub **Environments** `staging` and `production` (add required reviewers to production).

| Kind | Name | Notes |
|---|---|---|
| secret | `SUPABASE_ACCESS_TOKEN` | personal access token for the Supabase CLI |
| secret | `SUPABASE_DB_PASSWORD` | per environment |
| secret | `CLOUDFLARE_API_TOKEN` | |
| var | `SUPABASE_PROJECT_REF` | per environment |
| var | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | public, per environment |
| var | `VITE_TURNSTILE_SITE_KEY` | optional |
| var | `CLOUDFLARE_ACCOUNT_ID`, `SITE_URL` | `SITE_URL` is used by the smoke test |

Branch protection on `main`: require the CI jobs `quality`, `database` and `e2e` to pass.

## 5. Release checklist (production)

- [ ] CI green on the release commit, and staging verified by booking, cancelling and checking SMS on a real phone
- [ ] `supabase db push` dry run reviewed (`supabase db diff --linked`)
- [ ] Vault secrets present, `cron.job_run_details` shows successful runs
- [ ] Edge secrets set (`supabase secrets list`), `APP_ENV=production`, `SMS_PROVIDER=twilio`
- [ ] Twilio sender approved; one test SMS received on an Israeli number; status callback updates to `delivered`
- [ ] Working hours, owner phone, contact links and real photos configured
- [ ] Backups enabled and a restore drill done (SECURITY.md §Backups)
- [ ] Smoke test step of the Deploy workflow passed
- [ ] Manual check on iPhone Safari and Android Chrome

## 6. Rollback

- **Frontend**: `npx wrangler rollback --env production`, or redeploy the previous tag.
- **Functions**: redeploy from the previous tag (`git checkout vX && supabase functions deploy`).
- **Database**: migrations are forward-only. Write a new migration that reverts the change. For data
  loss, restore from backup / PITR (SECURITY.md).

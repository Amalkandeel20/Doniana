# DONIANA — Booking website

Arabic-first (RTL), mobile-first booking site and admin dashboard for **DONIANA · Piercing &
Eyebrows Lamination**. Customers book in about a minute without an account. Bookings are confirmed
automatically, overlaps are impossible at the database level, and SMS confirmations, reminders and
cancellations go out through a provider-independent outbox.

| | |
|---|---|
| Frontend | React 18 + TypeScript (strict) + Vite, Tailwind CSS, shadcn/ui-style components (Radix), React Router, React Hook Form + Zod, Lucide, date/time via `Intl` (Asia/Jerusalem), FullCalendar (admin) |
| Backend | Supabase: PostgreSQL (RLS everywhere, exclusion constraint), Auth (admins only), Storage (images), Edge Functions (Deno), `pg_cron` + `pg_net` |
| Hosting | Cloudflare Workers static assets (SPA) with strict security headers |
| Quality | Vitest (unit + component), DB integration & concurrency tests on real PostgreSQL, Playwright e2e on the real local stack, ESLint, Lighthouse CI, GitHub Actions |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): system design, data model, booking integrity, pages
- [docs/INSTALL.md](docs/INSTALL.md): local development setup
- [docs/TESTING.md](docs/TESTING.md): test suites and how to run them
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): environments, secrets, Cloudflare, Supabase, SMS, cron, smoke tests
- [docs/ADMIN-GUIDE.md](docs/ADMIN-GUIDE.md): دليل الاستخدام لصاحبة الصالون (owner's guide, Arabic)
- [docs/SECURITY.md](docs/SECURITY.md): security model, privacy (Israel), retention, backups and recovery
- [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md): business details still needed before launch, and the defaults used meanwhile

## Quick start (local)

```bash
npm ci
npx supabase start                      # needs Docker; applies migrations + supabase/seed.sql
cp .env.example .env.local              # paste API URL + anon key from `npx supabase status`
cp supabase/functions/.env.example supabase/functions/.env   # fill the secrets (see INSTALL.md)
npx supabase functions serve --env-file supabase/functions/.env
npm run dev                             # http://localhost:5173
```

Without Docker you can still run the type-check, lint, unit/component tests and the full database
suite: `npm run test:db` runs every migration on PGlite, which is PostgreSQL compiled to WebAssembly.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `preview` | Vite dev server / production build (+ `dist/_headers`) / preview |
| `npm run typecheck` / `lint` | TypeScript strict / ESLint |
| `npm run test:unit` | Domain logic, Edge Function handlers, SMS adapters, React components |
| `npm run test:db` | Migrations + booking/cancellation/RLS/outbox/concurrency against PostgreSQL |
| `npm run e2e` | Playwright against the local Supabase stack |
| `node scripts/create-admin.mjs` | Provision an administrator account |

## Repository layout

```
src/                     React app (pages, features/{booking,services,admin}, components/ui, i18n, lib)
supabase/migrations/     Schema, functions, triggers, RLS, initial catalog, platform jobs
supabase/functions/      Edge Functions (Deno) + _shared/ domain logic used by both server and browser
tests/db/                Database integration & concurrency tests
e2e/                     Playwright end-to-end tests
scripts/                 Admin provisioning, header generation, placeholder images
.github/workflows/       CI (every PR) and Deploy (staging on main, production with approval)
```

Branding: the official logo is `public/brand/doniana-logo.jpg` and is used unaltered on black
backgrounds. Every photo is a clearly labelled placeholder (`public/placeholders/`) until the
client supplies real images. Upload real photos in `/admin`.

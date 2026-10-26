# Open business questions (before production launch)

Confirmed by the client and implemented: business name **DONIANA**, the supplied logo, black and
white branding, the five services with exact prices and durations, eyebrow tint +₪10 / +0 min
(₪230 / 75 min total), automatic confirmation, SMS channel, reminders exactly 24h before,
same-day and next-day booking allowed, and customer cancellation only with ≥ 24h remaining.

Still needed from the client. Each item is configurable and none needs code changes.

| # | Question | Current default (clearly a placeholder) | Where to change |
|---|---|---|---|
| 1 | Weekly working hours and breaks | **Production: every day closed** (nothing bookable until set). Local dev seed: Sun–Thu 09–18, Fri 09–14 | `/admin/availability` |
| 2 | Real portfolio, hero and service photographs | Labelled placeholder images | `/admin/services`, `/admin/portfolio` (hero: replace `public/placeholders/hero.svg`) |
| 3 | Instagram URL, WhatsApp number, phone, address/map | Hidden until set ("will be added soon") | `/admin/settings` |
| 4 | Owner's mobile for new-booking/cancellation SMS | Not set: owner SMS are marked `skipped` | `/admin/settings` |
| 5 | SMS provider account, approved sender ID, monthly budget | Twilio adapter implemented; `dev` adapter elsewhere | Edge secrets (DEPLOYMENT.md §2) |
| 6 | Owner's admin email | none | `scripts/create-admin.mjs` |
| 7 | Minimum advance-booking notice | 0 minutes (same-day allowed, per client) | `/admin/availability` |
| 8 | Maximum booking horizon | 60 days | `/admin/availability` |
| 9 | Slot granularity (start times every …) | 15 minutes | `/admin/availability` |
| 10 | Buffer between appointments | **10 minutes** (client request, 2026-10-26) | `/admin/availability` |
| 11 | Accept Palestinian mobile numbers (+970 56/59)? | Only Israeli mobiles (050–055, 058) | `supabase/functions/_shared/domain/phone.ts` |
| 12 | Data-retention period | Proposed 24 months, then anonymise (not scheduled yet) | SECURITY.md |
| 13 | Privacy notice text and legal review | Not published | footer link (to add) |
| 14 | Domain name | none | `wrangler.jsonc`, DEPLOYMENT.md §3 |
| 15 | Logo usage on light backgrounds | Logo shown only on black, unaltered. Any variant needs the client's approval | `src/components/layout/Logo.tsx` |
| 16 | Late reminders: if the worker is down at T−24h, until when may it still send? | 60 minutes late at most, then `skipped` | `/admin/settings` |
| 17 | Does a piercing location change price or duration? | No (deltas = 0) | `/admin/services` → locations |
| 18 | Visual direction | **Changed 2026-10-26** from black & white to cream / sage green / dusty rose with Aref Ruqaa headings and the poster copy («وصلتِ للمكان الصح.»), per the client's reference images. Logo shown black (inverted file) on light surfaces | `src/styles/globals.css`, `tailwind.config.ts` |
| 19 | Hero feature claims «نتائج طبيعية · تعقيم ومعايير عالية · رعاية شخصية» | Taken from the reference mock-up; the owner should confirm they are accurate | `src/i18n/ar.ts` → `home.features` |

-- DONIANA booking — core schema
-- All instants are timestamptz (stored as UTC). Weekly schedules are wall-clock `time`
-- values interpreted in Asia/Jerusalem. Money is integer agorot.

create schema if not exists private;

create type public.service_category as enum ('brows', 'piercing');
create type public.appointment_status as enum ('confirmed', 'cancelled', 'completed');
create type public.appointment_source as enum ('online', 'admin');
create type public.actor_type as enum ('customer', 'admin', 'system');
create type public.block_kind as enum ('day_off', 'holiday', 'closure', 'custom');
create type public.notification_event as enum (
  'booking_confirmed',
  'owner_new_booking',
  'owner_cancellation',
  'reminder_24h',
  'cancelled_by_owner',
  'appointment_changed'
);
create type public.notification_recipient as enum ('customer', 'owner');
create type public.notification_status as enum (
  'pending',     -- waiting for scheduled_at / next_attempt_at
  'processing',  -- claimed by a worker
  'sent',        -- accepted by the provider
  'delivered',   -- provider confirmed handset delivery
  'failed',      -- gave up (see last_error)
  'cancelled',   -- no longer relevant (e.g. reminder of a cancelled appointment)
  'skipped',     -- intentionally not sent (no destination, too late, sms disabled)
  'unknown',     -- worker died mid-send; not retried automatically to avoid duplicates
  'dev_logged'   -- recorded by the development adapter, nothing was sent
);

-- ---------------------------------------------------------------- catalog

create table public.services (
  id uuid primary key default gen_random_uuid(),
  category public.service_category not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name_ar text not null check (char_length(name_ar) between 1 and 120),
  name_en text not null check (char_length(name_en) between 1 and 120),
  description_ar text check (char_length(description_ar) <= 600),
  description_en text check (char_length(description_en) <= 600),
  price_agorot integer not null check (price_agorot >= 0),
  duration_minutes integer not null check (duration_minutes between 5 and 600),
  image_path text,
  location_required boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_addons (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  name_ar text not null check (char_length(name_ar) between 1 and 120),
  name_en text not null check (char_length(name_en) between 1 and 120),
  description_ar text check (char_length(description_ar) <= 400),
  price_agorot integer not null check (price_agorot >= 0),
  extra_duration_minutes integer not null default 0 check (extra_duration_minutes between 0 and 240),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, slug)
);
create index service_addons_service_idx on public.service_addons (service_id);

-- Piercing location (ear / nose / navel). Deltas default to 0: location never changes price or
-- duration unless the administrator explicitly configures it.
create table public.service_locations (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9-]{2,40}$'),
  name_ar text not null,
  name_en text not null,
  price_delta_agorot integer not null default 0,
  duration_delta_minutes integer not null default 0 check (duration_delta_minutes between -60 and 240),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, code)
);
create index service_locations_service_idx on public.service_locations (service_id);

-- ---------------------------------------------------------------- schedule

create table public.business_hours (
  weekday smallint primary key check (weekday between 0 and 6), -- 0 = Sunday
  is_open boolean not null default false,
  open_time time not null default '09:00',
  close_time time not null default '17:00',
  updated_at timestamptz not null default now(),
  check (not is_open or open_time < close_time)
);

create table public.business_breaks (
  id uuid primary key default gen_random_uuid(),
  weekday smallint check (weekday between 0 and 6), -- null = every day
  start_time time not null,
  end_time time not null,
  label text check (char_length(label) <= 80),
  created_at timestamptz not null default now(),
  check (start_time < end_time)
);

create table public.blocked_time_ranges (
  id uuid primary key default gen_random_uuid(),
  kind public.block_kind not null default 'custom',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (char_length(reason) <= 200),
  created_by uuid,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index blocked_time_ranges_range_idx on public.blocked_time_ranges using gist (tstzrange(starts_at, ends_at, '[)'));

create table public.business_settings (
  id boolean primary key default true check (id),
  business_name text not null default 'DONIANA',
  tagline text not null default 'Piercing & Eyebrows Lamination',
  instagram_url text check (instagram_url is null or instagram_url ~ '^https://'),
  whatsapp_phone text check (whatsapp_phone is null or whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$'),
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  address_ar text,
  maps_url text check (maps_url is null or maps_url ~ '^https://'),
  slot_interval_minutes integer not null default 15 check (slot_interval_minutes between 5 and 120),
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 120),
  min_notice_minutes integer not null default 0 check (min_notice_minutes between 0 and 10080),
  booking_horizon_days integer not null default 60 check (booking_horizon_days between 1 and 365),
  updated_at timestamptz not null default now()
);

create table public.notification_settings (
  id boolean primary key default true check (id),
  owner_phone text check (owner_phone is null or owner_phone ~ '^\+[1-9][0-9]{7,14}$'),
  sms_enabled boolean not null default true,
  reminder_max_lateness_minutes integer not null default 60 check (reminder_max_lateness_minutes between 1 and 720),
  updated_at timestamptz not null default now()
);

create table public.notification_templates (
  event public.notification_event primary key,
  body_ar text not null check (char_length(body_ar) between 1 and 600),
  updated_at timestamptz not null default now()
);

create table public.portfolio_images (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  alt_ar text not null default '',
  category public.service_category,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.admin_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- appointments

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  status public.appointment_status not null default 'confirmed',
  source public.appointment_source not null,
  -- catalog references (nullable history-safe snapshots below are authoritative)
  service_id uuid not null references public.services (id) on delete restrict,
  location_id uuid references public.service_locations (id) on delete set null,
  category public.service_category not null,
  service_name_ar text not null,
  service_name_en text not null,
  location_name_ar text,
  location_name_en text,
  service_price_agorot integer not null check (service_price_agorot >= 0),
  total_price_agorot integer not null check (total_price_agorot >= 0),
  duration_minutes integer not null check (duration_minutes > 0),
  buffer_minutes integer not null default 0 check (buffer_minutes >= 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  occupied_until timestamptz not null,
  customer_name text check (char_length(customer_name) between 2 and 80),
  customer_phone text check (customer_phone ~ '^\+[1-9][0-9]{7,14}$'),
  manage_token_hash text not null unique check (manage_token_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key uuid not null unique,
  notes text check (char_length(notes) <= 1000),
  version integer not null default 1,
  cancelled_at timestamptz,
  cancelled_by public.actor_type,
  cancellation_reason text check (char_length(cancellation_reason) <= 300),
  completed_at timestamptz,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (occupied_until >= ends_at),
  check (ends_at = starts_at + make_interval(mins => duration_minutes)),
  check (occupied_until = ends_at + make_interval(mins => buffer_minutes)),
  check ((customer_name is not null and customer_phone is not null) or anonymized_at is not null),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  -- THE double-booking guard: no two non-cancelled appointments may overlap, whatever their
  -- start times. Enforced atomically by PostgreSQL for every insert/update path.
  constraint appointments_no_overlap exclude using gist (
    tstzrange(starts_at, occupied_until, '[)') with &&
  ) where (status <> 'cancelled')
);
create index appointments_starts_at_idx on public.appointments (starts_at);
create index appointments_status_starts_idx on public.appointments (status, starts_at);
create index appointments_phone_idx on public.appointments (customer_phone);
create index appointments_name_idx on public.appointments (lower(customer_name));

create table public.appointment_addons (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  addon_id uuid references public.service_addons (id) on delete set null,
  name_ar text not null,
  name_en text not null,
  price_agorot integer not null check (price_agorot >= 0),
  extra_duration_minutes integer not null check (extra_duration_minutes >= 0)
);
create index appointment_addons_appt_idx on public.appointment_addons (appointment_id);

create table public.appointment_audit_log (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  action text not null,
  actor public.actor_type not null,
  actor_user_id uuid,
  changes jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index appointment_audit_log_appt_idx on public.appointment_audit_log (appointment_id, created_at);

-- ---------------------------------------------------------------- notifications

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  event public.notification_event not null,
  recipient public.notification_recipient not null,
  channel text not null default 'sms' check (channel in ('sms')),
  dedupe_key text not null unique,
  status public.notification_status not null default 'pending',
  scheduled_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  locked_until timestamptz,
  first_processed_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notification_outbox_due_idx on public.notification_outbox (next_attempt_at) where status = 'pending';
create index notification_outbox_appt_idx on public.notification_outbox (appointment_id);

create table public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.notification_outbox (id) on delete cascade,
  attempt_no integer not null,
  provider text not null,
  outcome text not null default 'started' check (outcome in ('started', 'accepted', 'failed', 'unknown', 'dev_logged')),
  provider_message_id text unique,
  provider_status text,
  http_status integer,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status_updated_at timestamptz,
  unique (outbox_id, attempt_no)
);

-- ---------------------------------------------------------------- abuse protection

create table public.rate_limit_counters (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

-- DONIANA booking — server-side operations
-- Functions in `private` are not exposed through the Data API.
-- `public` functions are either service-role only (called by Edge Functions) or admin RPCs that
-- verify private.is_admin() themselves. Every function pins search_path.

-- ---------------------------------------------------------------- helpers

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_profiles where user_id = (select auth.uid()));
$$;

create or replace function private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- Serialises writes that change the schedule. Without it, concurrent inserts of overlapping
-- ranges can deadlock inside the exclusion constraint check (integrity still holds, but losers
-- wait for deadlock_timeout and get an opaque error). One practitioner = low write volume.
create or replace function private.lock_schedule()
returns void
language sql
volatile
as $$ select pg_advisory_xact_lock(7340211) $$;

create or replace function private.minutes_of(t time)
returns integer
language sql
immutable
as $$ select (extract(epoch from t) / 60)::integer $$;

create or replace function private.new_reference()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    candidate := 'DN-';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.appointments where reference = candidate);
  end loop;
  return candidate;
end;
$$;

-- Returns null when [p_starts, p_starts + duration) is bookable, otherwise the reason.
-- Mirrors checkSlot() in supabase/functions/_shared/domain/availability.ts. Appointment overlap
-- is not checked here: the exclusion constraint does that atomically.
create or replace function private.schedule_violation(p_starts timestamptz, p_duration integer)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  tz constant text := 'Asia/Jerusalem';
  s public.business_settings;
  h public.business_hours;
  local_start timestamp := p_starts at time zone tz;
  local_date date := (p_starts at time zone tz)::date;
  start_min integer := extract(hour from local_start)::integer * 60 + extract(minute from local_start)::integer;
  end_min integer := start_min + p_duration;
  wd integer := extract(dow from local_start)::integer;
begin
  select * into s from public.business_settings where id;
  if date_trunc('minute', p_starts) <> p_starts then
    return 'invalid_time';
  end if;
  if p_starts < now() + make_interval(mins => s.min_notice_minutes) then
    return 'past';
  end if;
  if local_date > (now() at time zone tz)::date + s.booking_horizon_days then
    return 'beyond_horizon';
  end if;
  select * into h from public.business_hours where weekday = wd;
  if not found or not h.is_open then
    return 'closed';
  end if;
  if start_min < private.minutes_of(h.open_time) or end_min > private.minutes_of(h.close_time) then
    return 'outside_hours';
  end if;
  if exists (
    select 1 from public.business_breaks b
    where (b.weekday is null or b.weekday = wd)
      and start_min < private.minutes_of(b.end_time)
      and private.minutes_of(b.start_time) < end_min
  ) then
    return 'break';
  end if;
  if exists (
    select 1 from public.blocked_time_ranges r
    where tstzrange(r.starts_at, r.ends_at, '[)')
       && tstzrange(p_starts, p_starts + make_interval(mins => p_duration), '[)')
  ) then
    return 'blocked';
  end if;
  return null;
end;
$$;

-- Authoritative price/duration calculation from the live catalog.
create or replace function private.price_booking(
  p_service_id uuid,
  p_addon_ids uuid[],
  p_location_id uuid,
  p_allow_inactive boolean
)
returns table (
  category public.service_category,
  service_name_ar text,
  service_name_en text,
  location_name_ar text,
  location_name_en text,
  service_price_agorot integer,
  total_price_agorot integer,
  duration_minutes integer,
  addons jsonb
)
language plpgsql
stable
set search_path = ''
as $$
declare
  svc public.services;
  loc public.service_locations;
  ids uuid[] := coalesce((select array_agg(distinct x) from unnest(p_addon_ids) as x), '{}');
  addon_count integer;
  addon_price integer;
  addon_minutes integer;
  addon_json jsonb;
  total_price integer;
  total_minutes integer;
begin
  select * into svc from public.services where id = p_service_id;
  if not found or (not svc.is_active and not p_allow_inactive) then
    raise exception 'service_unavailable' using errcode = 'P0001';
  end if;

  select count(*), coalesce(sum(a.price_agorot), 0), coalesce(sum(a.extra_duration_minutes), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'name_ar', a.name_ar, 'name_en', a.name_en,
           'price_agorot', a.price_agorot, 'extra_duration_minutes', a.extra_duration_minutes
         ) order by a.sort_order), '[]'::jsonb)
    into addon_count, addon_price, addon_minutes, addon_json
    from public.service_addons a
   where a.id = any (ids) and a.service_id = svc.id and (a.is_active or p_allow_inactive);
  if addon_count <> cardinality(ids) then
    raise exception 'addon_unavailable' using errcode = 'P0001';
  end if;

  if p_location_id is not null then
    select * into loc from public.service_locations l
     where l.id = p_location_id and l.service_id = svc.id and (l.is_active or p_allow_inactive);
    if not found then
      raise exception 'location_unavailable' using errcode = 'P0001';
    end if;
  elsif svc.location_required then
    raise exception 'location_required' using errcode = 'P0001';
  end if;

  total_price := svc.price_agorot + addon_price + coalesce(loc.price_delta_agorot, 0);
  total_minutes := svc.duration_minutes + addon_minutes + coalesce(loc.duration_delta_minutes, 0);
  if total_price < 0 or total_minutes <= 0 then
    raise exception 'invalid_pricing' using errcode = 'P0001';
  end if;

  return query select svc.category, svc.name_ar, svc.name_en, loc.name_ar, loc.name_en,
    svc.price_agorot, total_price, total_minutes, addon_json;
end;
$$;

-- What a customer holding a valid management link may see.
create or replace function private.public_appointment_json(a public.appointments, p_now timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'reference', a.reference,
    'status', a.status,
    'category', a.category,
    'serviceNameAr', a.service_name_ar,
    'serviceNameEn', a.service_name_en,
    'locationNameAr', a.location_name_ar,
    'addons', coalesce((
      select jsonb_agg(jsonb_build_object('nameAr', x.name_ar, 'nameEn', x.name_en, 'priceAgorot', x.price_agorot) order by x.id)
        from public.appointment_addons x where x.appointment_id = a.id
    ), '[]'::jsonb),
    'totalPriceAgorot', a.total_price_agorot,
    'durationMinutes', a.duration_minutes,
    'startsAt', a.starts_at,
    'endsAt', a.ends_at,
    'customerName', a.customer_name,
    'phoneLast3', right(a.customer_phone, 3),
    'cancelledBy', a.cancelled_by,
    'cancellationDeadline', a.starts_at - interval '24 hours',
    'canCancel', a.status = 'confirmed' and extract(epoch from (a.starts_at - p_now)) >= 86400
  );
$$;

create or replace function private.set_actor(p_actor public.actor_type, p_user uuid, p_notify_customer boolean)
returns void
language sql
volatile
set search_path = ''
as $$
  select set_config('doniana.actor', p_actor::text, true),
         set_config('doniana.actor_user_id', coalesce(p_user::text, ''), true),
         set_config('doniana.suppress_customer_notifications', case when p_notify_customer then 'off' else 'on' end, true);
$$;

-- ---------------------------------------------------------------- booking (service role)

create or replace function public.book_appointment(
  p_idempotency_key uuid,
  p_manage_token_hash text,
  p_service_id uuid,
  p_addon_ids uuid[],
  p_location_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_source public.appointment_source default 'online',
  p_admin_override boolean default false,
  p_notes text default null,
  p_actor_user_id uuid default null,
  p_notify_customer boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  existing public.appointments;
  appt public.appointments;
  q record;
  s public.business_settings;
  violation text;
begin
  perform private.lock_schedule();
  -- Idempotency: a repeated request (double tap, retry after timeout) returns the original booking.
  select * into existing from public.appointments where idempotency_key = p_idempotency_key;
  if found then
    if existing.service_id = p_service_id and existing.starts_at = p_starts_at
       and existing.customer_phone = p_customer_phone then
      return jsonb_build_object('replayed', true, 'appointment', to_jsonb(existing));
    end if;
    raise exception 'idempotency_conflict' using errcode = 'P0001';
  end if;

  if p_source = 'online' and p_admin_override then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into q from private.price_booking(p_service_id, p_addon_ids, p_location_id, p_source = 'admin');
  select * into s from public.business_settings where id;

  -- Revalidate immediately before committing.
  if not p_admin_override then
    violation := private.schedule_violation(p_starts_at, q.duration_minutes);
    if violation is not null then
      raise exception 'slot_unavailable' using errcode = 'P0001', detail = violation;
    end if;
  end if;

  perform private.set_actor(
    case when p_source = 'admin' then 'admin' else 'customer' end::public.actor_type,
    p_actor_user_id,
    p_notify_customer
  );

  begin
    insert into public.appointments (
      reference, status, source, service_id, location_id, category,
      service_name_ar, service_name_en, location_name_ar, location_name_en,
      service_price_agorot, total_price_agorot, duration_minutes, buffer_minutes,
      starts_at, ends_at, occupied_until,
      customer_name, customer_phone, manage_token_hash, idempotency_key, notes
    ) values (
      private.new_reference(), 'confirmed', p_source, p_service_id, p_location_id, q.category,
      q.service_name_ar, q.service_name_en, q.location_name_ar, q.location_name_en,
      q.service_price_agorot, q.total_price_agorot, q.duration_minutes, s.buffer_minutes,
      p_starts_at,
      p_starts_at + make_interval(mins => q.duration_minutes),
      p_starts_at + make_interval(mins => q.duration_minutes + s.buffer_minutes),
      btrim(p_customer_name), p_customer_phone, p_manage_token_hash, p_idempotency_key, nullif(btrim(p_notes), '')
    )
    returning * into appt;
  exception
    when exclusion_violation then
      raise exception 'slot_unavailable' using errcode = 'P0001', detail = 'conflict';
    when unique_violation then
      -- A concurrent request with the same idempotency key won the race.
      select * into existing from public.appointments where idempotency_key = p_idempotency_key;
      if found then
        return jsonb_build_object('replayed', true, 'appointment', to_jsonb(existing));
      end if;
      raise;
  end;

  insert into public.appointment_addons (appointment_id, addon_id, name_ar, name_en, price_agorot, extra_duration_minutes)
  select appt.id, (a ->> 'id')::uuid, a ->> 'name_ar', a ->> 'name_en',
         (a ->> 'price_agorot')::integer, (a ->> 'extra_duration_minutes')::integer
    from jsonb_array_elements(q.addons) as a;

  return jsonb_build_object('replayed', false, 'appointment', to_jsonb(appt));
end;
$$;

-- ---------------------------------------------------------------- customer management link (service role)

create or replace function public.get_appointment_by_token(p_token_hash text, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  appt public.appointments;
begin
  select * into appt from public.appointments where manage_token_hash = p_token_hash and anonymized_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return private.public_appointment_json(appt, p_now);
end;
$$;

-- Customer cancellation: allowed only while at least 24 hours remain (absolute time).
create or replace function public.cancel_appointment_by_token(p_token_hash text, p_now timestamptz default now())
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  appt public.appointments;
begin
  select * into appt from public.appointments
   where manage_token_hash = p_token_hash and anonymized_at is null
   for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if appt.status = 'cancelled' then
    return private.public_appointment_json(appt, p_now);
  end if;
  if appt.status <> 'confirmed' then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;
  if extract(epoch from (appt.starts_at - p_now)) < 86400 then
    raise exception 'cancellation_window_closed' using errcode = 'P0001';
  end if;

  perform private.set_actor('customer', null, true);
  update public.appointments
     set status = 'cancelled', cancelled_at = p_now, cancelled_by = 'customer'
   where id = appt.id
  returning * into appt;
  return private.public_appointment_json(appt, p_now);
end;
$$;

-- ---------------------------------------------------------------- admin RPCs (authenticated + is_admin)

create or replace function public.admin_cancel_appointment(
  p_appointment_id uuid,
  p_reason text default null,
  p_notify_customer boolean default true
)
returns public.appointments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  appt public.appointments;
begin
  perform private.require_admin();
  perform private.set_actor('admin', auth.uid(), p_notify_customer);
  update public.appointments
     set status = 'cancelled', cancelled_at = now(), cancelled_by = 'admin',
         cancellation_reason = nullif(btrim(p_reason), '')
   where id = p_appointment_id and status <> 'cancelled'
  returning * into appt;
  if not found then
    select * into appt from public.appointments where id = p_appointment_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
  end if;
  return appt;
end;
$$;

create or replace function public.admin_update_appointment(
  p_appointment_id uuid,
  p_starts_at timestamptz,
  p_service_id uuid,
  p_addon_ids uuid[],
  p_location_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_notes text default null,
  p_admin_override boolean default false,
  p_notify_customer boolean default true
)
returns public.appointments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  appt public.appointments;
  q record;
  s public.business_settings;
  violation text;
  catalog_changed boolean;
  current_addons uuid[];
  new_addons uuid[] := coalesce((select array_agg(distinct x order by x) from unnest(p_addon_ids) as x), '{}');
  new_duration integer;
  new_buffer integer;
begin
  perform private.require_admin();
  perform private.lock_schedule();
  select * into appt from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if appt.status = 'cancelled' then
    raise exception 'appointment_cancelled' using errcode = 'P0001';
  end if;
  select * into s from public.business_settings where id;

  select coalesce(array_agg(addon_id order by addon_id), '{}') into current_addons
    from public.appointment_addons where appointment_id = appt.id and addon_id is not null;
  catalog_changed := appt.service_id <> p_service_id
    or appt.location_id is distinct from p_location_id
    or current_addons <> new_addons;

  -- Unchanged selections keep their historical price/duration snapshot.
  select * into q from private.price_booking(p_service_id, new_addons, p_location_id, true);
  new_duration := case when catalog_changed then q.duration_minutes else appt.duration_minutes end;
  new_buffer := case when p_starts_at = appt.starts_at and new_duration = appt.duration_minutes
                     then appt.buffer_minutes else s.buffer_minutes end;

  if not p_admin_override and (p_starts_at <> appt.starts_at or new_duration <> appt.duration_minutes) then
    violation := private.schedule_violation(p_starts_at, new_duration);
    if violation is not null then
      raise exception 'slot_unavailable' using errcode = 'P0001', detail = violation;
    end if;
  end if;

  perform private.set_actor('admin', auth.uid(), p_notify_customer);
  begin
    update public.appointments set
      starts_at = p_starts_at,
      ends_at = p_starts_at + make_interval(mins => new_duration),
      occupied_until = p_starts_at + make_interval(mins => new_duration + new_buffer),
      duration_minutes = new_duration,
      buffer_minutes = new_buffer,
      service_id = p_service_id,
      location_id = p_location_id,
      category = case when catalog_changed then q.category else category end,
      service_name_ar = case when catalog_changed then q.service_name_ar else service_name_ar end,
      service_name_en = case when catalog_changed then q.service_name_en else service_name_en end,
      location_name_ar = case when catalog_changed then q.location_name_ar else location_name_ar end,
      location_name_en = case when catalog_changed then q.location_name_en else location_name_en end,
      service_price_agorot = case when catalog_changed then q.service_price_agorot else service_price_agorot end,
      total_price_agorot = case when catalog_changed then q.total_price_agorot else total_price_agorot end,
      customer_name = btrim(p_customer_name),
      customer_phone = p_customer_phone,
      notes = nullif(btrim(p_notes), '')
    where id = appt.id
    returning * into appt;
  exception
    when exclusion_violation then
      raise exception 'slot_unavailable' using errcode = 'P0001', detail = 'conflict';
  end;

  if catalog_changed then
    delete from public.appointment_addons where appointment_id = appt.id;
    insert into public.appointment_addons (appointment_id, addon_id, name_ar, name_en, price_agorot, extra_duration_minutes)
    select appt.id, (a ->> 'id')::uuid, a ->> 'name_ar', a ->> 'name_en',
           (a ->> 'price_agorot')::integer, (a ->> 'extra_duration_minutes')::integer
      from jsonb_array_elements(q.addons) as a;
  end if;
  return appt;
end;
$$;

-- Mark completed, or restore a cancelled/completed appointment to confirmed.
create or replace function public.admin_set_appointment_status(
  p_appointment_id uuid,
  p_status public.appointment_status,
  p_notify_customer boolean default false
)
returns public.appointments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  appt public.appointments;
begin
  perform private.require_admin();
  if p_status = 'cancelled' then
    raise exception 'use_admin_cancel_appointment' using errcode = 'P0001';
  end if;
  perform private.lock_schedule();
  perform private.set_actor('admin', auth.uid(), p_notify_customer);
  begin
    update public.appointments set
      status = p_status,
      completed_at = case when p_status = 'completed' then now() else null end,
      cancelled_at = null,
      cancelled_by = null,
      cancellation_reason = null
    where id = p_appointment_id
    returning * into appt;
  exception
    when exclusion_violation then
      raise exception 'slot_unavailable' using errcode = 'P0001', detail = 'conflict';
  end;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return appt;
end;
$$;

create or replace function public.admin_retry_notification(p_outbox_id uuid)
returns public.notification_outbox
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  row public.notification_outbox;
begin
  perform private.require_admin();
  update public.notification_outbox
     set status = 'pending', next_attempt_at = now(), locked_until = null,
         max_attempts = attempts + 3, last_error = null
   where id = p_outbox_id and status in ('failed', 'unknown', 'skipped')
  returning * into row;
  if not found then
    raise exception 'not_retryable' using errcode = 'P0001';
  end if;
  return row;
end;
$$;

-- Privacy: removes customer personal data from appointments that ended before p_cutoff.
create or replace function public.anonymize_appointments_before(p_cutoff timestamptz)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if auth.role() <> 'service_role' then
    perform private.require_admin();
  end if;
  if p_cutoff > now() then
    raise exception 'cutoff_in_future' using errcode = 'P0001';
  end if;
  perform set_config('doniana.anonymizing', 'on', true);
  update public.appointments
     set customer_name = null, customer_phone = null, notes = null, anonymized_at = now()
   where ends_at < p_cutoff and anonymized_at is null;
  get diagnostics affected = row_count;
  update public.appointment_audit_log l
     set changes = l.changes - 'customer_name' - 'customer_phone' - 'notes'
   where l.appointment_id in (select id from public.appointments where anonymized_at is not null);
  return affected;
end;
$$;

-- ---------------------------------------------------------------- abuse protection (service role)

create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  win timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  current_hits integer;
begin
  insert into public.rate_limit_counters (key, window_start, hits)
  values (p_key, win, 1)
  on conflict (key, window_start) do update set hits = public.rate_limit_counters.hits + 1
  returning hits into current_hits;
  return current_hits <= p_limit;
end;
$$;

create or replace function public.purge_rate_limit_counters()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.rate_limit_counters where window_start < now() - interval '1 day';
$$;

-- ---------------------------------------------------------------- notification worker (service role)

create or replace function public.claim_due_notifications(p_limit integer default 20, p_lease_seconds integer default 60)
returns setof public.notification_outbox
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- Recover rows whose worker died. If a provider call had started we cannot know whether the
  -- SMS went out, so the row becomes 'unknown' (never auto-resent) instead of risking a duplicate.
  with stale as (
    select id from public.notification_outbox
     where status = 'processing' and locked_until < now()
     for update skip locked
  ), started as (
    update public.notification_delivery_attempts a
       set outcome = 'unknown', finished_at = now(), error = 'worker lease expired during provider call'
     where a.outbox_id in (select id from stale) and a.outcome = 'started'
    returning a.outbox_id
  )
  update public.notification_outbox o
     set status = case when o.id in (select outbox_id from started) then 'unknown'::public.notification_status
                       else 'pending'::public.notification_status end,
         locked_until = null,
         last_error = case when o.id in (select outbox_id from started)
                           then 'worker lease expired during provider call; not retried to avoid duplicate SMS'
                           else o.last_error end
   where o.id in (select id from stale);

  return query
  with due as (
    select id from public.notification_outbox
     where status = 'pending' and next_attempt_at <= now()
     order by next_attempt_at
     limit p_limit
     for update skip locked
  )
  update public.notification_outbox o
     set status = 'processing',
         locked_until = now() + make_interval(secs => p_lease_seconds),
         first_processed_at = coalesce(o.first_processed_at, now())
    from due
   where o.id = due.id
  returning o.*;
end;
$$;

-- Decides whether a claimed notification should still be sent, and if so opens an attempt.
create or replace function public.begin_notification_delivery(p_outbox_id uuid, p_provider text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ob public.notification_outbox;
  appt public.appointments;
  ns public.notification_settings;
  bs public.business_settings;
  destination text;
  skip_status public.notification_status;
  skip_reason text;
  template text;
  attempt_id uuid;
begin
  select * into ob from public.notification_outbox where id = p_outbox_id and status = 'processing' for update;
  if not found then
    return jsonb_build_object('action', 'none', 'reason', 'not_claimed');
  end if;
  select * into appt from public.appointments where id = ob.appointment_id;
  select * into ns from public.notification_settings where id;
  select * into bs from public.business_settings where id;

  if not coalesce(ns.sms_enabled, false) then
    skip_status := 'skipped'; skip_reason := 'sms_disabled';
  elsif ob.event = 'reminder_24h' and appt.status <> 'confirmed' then
    skip_status := 'cancelled'; skip_reason := 'appointment_not_confirmed';
  elsif ob.event = 'reminder_24h' and ob.scheduled_at <> appt.starts_at - interval '24 hours' then
    skip_status := 'cancelled'; skip_reason := 'stale_reminder';
  elsif ob.event = 'reminder_24h'
        and now() > ob.scheduled_at + make_interval(mins => ns.reminder_max_lateness_minutes) then
    skip_status := 'skipped'; skip_reason := 'too_late';
  elsif ob.event in ('booking_confirmed', 'appointment_changed') and appt.status <> 'confirmed' then
    skip_status := 'cancelled'; skip_reason := 'appointment_not_confirmed';
  end if;

  if skip_status is null then
    destination := case ob.recipient when 'customer' then appt.customer_phone else ns.owner_phone end;
    if destination is null then
      skip_status := 'skipped';
      skip_reason := case ob.recipient when 'customer' then 'no_customer_phone' else 'no_owner_phone' end;
    end if;
  end if;

  if skip_status is not null then
    update public.notification_outbox
       set status = skip_status, last_error = skip_reason, locked_until = null
     where id = ob.id;
    return jsonb_build_object('action', 'skip', 'reason', skip_reason);
  end if;

  select body_ar into template from public.notification_templates where event = ob.event;

  insert into public.notification_delivery_attempts (outbox_id, attempt_no, provider)
  values (ob.id, ob.attempts + 1, p_provider)
  returning id into attempt_id;
  update public.notification_outbox set attempts = ob.attempts + 1 where id = ob.id;

  return jsonb_build_object(
    'action', 'send',
    'attemptId', attempt_id,
    'outboxId', ob.id,
    'event', ob.event,
    'recipient', ob.recipient,
    'destination', destination,
    'template', template,
    'businessName', bs.business_name,
    'appointment', jsonb_build_object(
      'reference', appt.reference,
      'serviceNameAr', appt.service_name_ar,
      'locationNameAr', appt.location_name_ar,
      'startsAt', appt.starts_at,
      'totalPriceAgorot', appt.total_price_agorot,
      'customerName', appt.customer_name,
      'customerPhone', appt.customer_phone,
      'idempotencyKey', appt.idempotency_key
    )
  );
end;
$$;

create or replace function public.finish_notification_delivery(
  p_attempt_id uuid,
  p_outcome text,
  p_provider_message_id text default null,
  p_provider_status text default null,
  p_http_status integer default null,
  p_error text default null,
  p_retryable boolean default false
)
returns public.notification_outbox
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_outbox_id uuid;
  ob public.notification_outbox;
begin
  if p_outcome not in ('accepted', 'failed', 'unknown', 'dev_logged') then
    raise exception 'invalid_outcome' using errcode = 'P0001';
  end if;
  update public.notification_delivery_attempts
     set outcome = p_outcome, provider_message_id = p_provider_message_id, provider_status = p_provider_status,
         http_status = p_http_status, error = left(p_error, 1000), finished_at = now()
   where id = p_attempt_id and outcome = 'started'
  returning outbox_id into v_outbox_id;
  if not found then
    raise exception 'attempt_not_open' using errcode = 'P0001';
  end if;

  select * into ob from public.notification_outbox where id = v_outbox_id for update;
  update public.notification_outbox set
    status = case
      when p_outcome = 'accepted' then 'sent'
      when p_outcome = 'dev_logged' then 'dev_logged'
      when p_outcome = 'unknown' then 'unknown'
      when p_retryable and ob.attempts < ob.max_attempts then 'pending'
      else 'failed' end::public.notification_status,
    sent_at = case when p_outcome = 'accepted' then now() else sent_at end,
    provider_message_id = coalesce(p_provider_message_id, provider_message_id),
    last_error = case when p_outcome in ('accepted', 'dev_logged') then null else left(p_error, 1000) end,
    next_attempt_at = case when p_outcome = 'failed' and p_retryable
                           then now() + make_interval(secs => least(3600, 30 * power(2, greatest(ob.attempts - 1, 0))::integer))
                           else next_attempt_at end,
    locked_until = null
  where id = v_outbox_id
  returning * into ob;
  return ob;
end;
$$;

-- Provider delivery receipts (e.g. Twilio status callback).
create or replace function public.record_delivery_status(
  p_provider_message_id text,
  p_provider_status text,
  p_error text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_outbox_id uuid;
begin
  update public.notification_delivery_attempts
     set provider_status = p_provider_status, status_updated_at = now(),
         error = coalesce(left(p_error, 1000), error)
   where provider_message_id = p_provider_message_id
  returning outbox_id into v_outbox_id;
  if not found then
    return;
  end if;
  if p_provider_status = 'delivered' then
    update public.notification_outbox set status = 'delivered', delivered_at = now()
     where id = v_outbox_id and status in ('sent', 'failed');
  elsif p_provider_status in ('undelivered', 'failed') then
    -- The provider accepted the message, so it is not retried automatically (no duplicates).
    update public.notification_outbox set status = 'failed', last_error = coalesce(p_error, 'provider: ' || p_provider_status)
     where id = v_outbox_id and status = 'sent';
  end if;
end;
$$;

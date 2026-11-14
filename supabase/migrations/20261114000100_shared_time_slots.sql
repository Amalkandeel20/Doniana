-- The owner can deliberately put two clients at the same time (e.g. two friends booked together).
-- Such appointments are flagged allow_overlap: they are left out of the database-level overlap
-- guard, so they may sit on top of any other appointment. Every normal appointment is still
-- protected from them by a trigger, so online bookings can never land on a busy slot.
alter table public.appointments add column allow_overlap boolean not null default false;

alter table public.appointments drop constraint appointments_no_overlap;
alter table public.appointments add constraint appointments_no_overlap exclude using gist (
  tstzrange(starts_at, occupied_until, '[)') with &&
) where (status <> 'cancelled' and not allow_overlap);

-- Normal appointments must not overlap a flagged one either. All writers hold
-- private.lock_schedule(), so this check cannot race. Raised as an exclusion violation so the
-- existing handlers report it as slot_unavailable.
create or replace function private.guard_flagged_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'cancelled' and not new.allow_overlap and exists (
    select 1 from public.appointments o
     where o.id <> new.id and o.status <> 'cancelled' and o.allow_overlap
       and tstzrange(o.starts_at, o.occupied_until, '[)') && tstzrange(new.starts_at, new.occupied_until, '[)')
  ) then
    raise exception 'overlaps a shared appointment' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger appointments_guard_flagged_overlap
  before insert or update of starts_at, occupied_until, status, allow_overlap on public.appointments
  for each row execute function private.guard_flagged_overlap();

-- book_appointment gains p_allow_overlap (admin only). Dropped and recreated because the
-- signature changes; permissions are restored as in the security migration.
drop function public.book_appointment(uuid, text, uuid, uuid[], uuid, timestamptz, text, text, public.appointment_source, boolean, text, uuid, boolean);

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
  p_notify_customer boolean default true,
  p_allow_overlap boolean default false
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

  if p_source = 'online' and (p_admin_override or p_allow_overlap) then
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
      customer_name, customer_phone, manage_token_hash, idempotency_key, notes, allow_overlap
    ) values (
      private.new_reference(), 'confirmed', p_source, p_service_id, p_location_id, q.category,
      q.service_name_ar, q.service_name_en, q.location_name_ar, q.location_name_en,
      q.service_price_agorot, q.total_price_agorot, q.duration_minutes, s.buffer_minutes,
      p_starts_at,
      p_starts_at + make_interval(mins => q.duration_minutes),
      p_starts_at + make_interval(mins => q.duration_minutes + s.buffer_minutes),
      btrim(p_customer_name), p_customer_phone, p_manage_token_hash, p_idempotency_key, nullif(btrim(p_notes), ''), p_allow_overlap
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

revoke all on function public.book_appointment(uuid, text, uuid, uuid[], uuid, timestamptz, text, text, public.appointment_source, boolean, text, uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.book_appointment(uuid, text, uuid, uuid[], uuid, timestamptz, text, text, public.appointment_source, boolean, text, uuid, boolean, boolean) to service_role;

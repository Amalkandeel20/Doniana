-- DONIANA booking — triggers: timestamps, versioning, audit log, notification outbox.
-- Notifications are enqueued in the same transaction as the appointment change, so a booking and
-- its SMS jobs commit (or roll back) together, and an SMS outage can never affect a booking.

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'services', 'service_addons', 'service_locations', 'business_hours', 'business_settings',
    'notification_settings', 'notification_templates', 'notification_outbox'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.touch_updated_at()',
      t || '_touch_updated_at', t
    );
  end loop;
end;
$$;

create or replace function private.appointments_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(new.*) is distinct from row(old.*) then
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger appointments_before_update
before update on public.appointments
for each row execute function private.appointments_before_update();

create or replace function private.enqueue_notification(
  p_appointment_id uuid,
  p_event public.notification_event,
  p_recipient public.notification_recipient,
  p_dedupe_key text,
  p_scheduled_at timestamptz default now()
)
returns void
language sql
volatile
set search_path = ''
as $$
  insert into public.notification_outbox (appointment_id, event, recipient, dedupe_key, scheduled_at, next_attempt_at)
  values (p_appointment_id, p_event, p_recipient, p_dedupe_key, p_scheduled_at, p_scheduled_at)
  on conflict (dedupe_key) do update
    set status = 'pending', scheduled_at = excluded.scheduled_at, next_attempt_at = excluded.next_attempt_at,
        attempts = 0, last_error = null
  where public.notification_outbox.status = 'cancelled';
$$;

-- Keeps exactly one pending 24h reminder at starts_at − 24h for confirmed appointments whose
-- reminder time is still in the future; cancels anything else.
create or replace function private.sync_reminder(a public.appointments)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  reminder_at timestamptz := a.starts_at - interval '24 hours';
begin
  update public.notification_outbox
     set status = 'cancelled', last_error = 'superseded'
   where appointment_id = a.id and event = 'reminder_24h' and status = 'pending'
     and (a.status <> 'confirmed' or scheduled_at <> reminder_at);
  if a.status = 'confirmed' and reminder_at > now() then
    perform private.enqueue_notification(
      a.id, 'reminder_24h', 'customer',
      'reminder_24h:' || a.id || ':' || extract(epoch from a.starts_at)::bigint,
      reminder_at
    );
  end if;
end;
$$;

create or replace function private.appointments_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.actor_type := coalesce(
    nullif(current_setting('doniana.actor', true), '')::public.actor_type,
    case when private.is_admin() then 'admin' else 'system' end::public.actor_type
  );
  v_actor_id uuid := coalesce(nullif(current_setting('doniana.actor_user_id', true), '')::uuid, auth.uid());
  v_suppress boolean := coalesce(current_setting('doniana.suppress_customer_notifications', true), '') = 'on';
  v_changes jsonb;
  schedule_changed boolean;
begin
  if tg_op = 'INSERT' then
    insert into public.appointment_audit_log (appointment_id, action, actor, actor_user_id, changes)
    values (new.id, 'created', v_actor, v_actor_id, jsonb_build_object(
      'status', new.status, 'source', new.source, 'starts_at', new.starts_at,
      'service', new.service_name_en, 'total_price_agorot', new.total_price_agorot
    ));
    if new.status = 'confirmed' then
      if not v_suppress then
        perform private.enqueue_notification(new.id, 'booking_confirmed', 'customer', 'booking_confirmed:' || new.id);
      end if;
      if new.source = 'online' then
        perform private.enqueue_notification(new.id, 'owner_new_booking', 'owner', 'owner_new_booking:' || new.id);
      end if;
      perform private.sync_reminder(new);
    end if;
    return new;
  end if;

  -- UPDATE
  if coalesce(current_setting('doniana.anonymizing', true), '') = 'on' then
    insert into public.appointment_audit_log (appointment_id, action, actor, actor_user_id)
    values (new.id, 'anonymized', v_actor, v_actor_id);
    return new;
  end if;

  select jsonb_object_agg(o.key, jsonb_build_object('old', o.value, 'new', n.value))
    into v_changes
    from jsonb_each(to_jsonb(old)) as o
    join jsonb_each(to_jsonb(new)) as n on n.key = o.key
   where o.value is distinct from n.value
     and o.key not in ('updated_at', 'version', 'manage_token_hash');
  if v_changes is null then
    return new;
  end if;

  insert into public.appointment_audit_log (appointment_id, action, actor, actor_user_id, changes)
  values (
    new.id,
    case when new.status <> old.status then 'status_' || new.status::text else 'updated' end,
    v_actor, v_actor_id, v_changes
  );

  schedule_changed := old.starts_at <> new.starts_at
    or old.duration_minutes <> new.duration_minutes
    or old.service_id <> new.service_id
    or old.location_id is distinct from new.location_id;

  if new.status = 'cancelled' and old.status <> 'cancelled' then
    perform private.sync_reminder(new);
    if new.cancelled_by = 'customer' then
      perform private.enqueue_notification(new.id, 'owner_cancellation', 'owner',
        'owner_cancellation:' || new.id || ':' || new.version);
    elsif not v_suppress then
      perform private.enqueue_notification(new.id, 'cancelled_by_owner', 'customer',
        'cancelled_by_owner:' || new.id || ':' || new.version);
    end if;
  elsif new.status = 'completed' then
    perform private.sync_reminder(new);
  elsif new.status = 'confirmed' then
    perform private.sync_reminder(new);
    if (old.status <> 'confirmed' or schedule_changed) and v_actor = 'admin' and not v_suppress then
      perform private.enqueue_notification(new.id, 'appointment_changed', 'customer',
        'appointment_changed:' || new.id || ':' || new.version);
    end if;
  end if;
  return new;
end;
$$;

create trigger appointments_after_write
after insert or update on public.appointments
for each row execute function private.appointments_after_write();

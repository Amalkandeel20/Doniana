-- Each SMS type can be switched on or off in the admin. To keep costs down, only the reminder
-- starts switched on; the confirmation (shown on screen), owner alerts and other notices are off.
alter table public.notification_templates add column is_enabled boolean not null default true;
update public.notification_templates set is_enabled = (event = 'reminder_24h');

-- The shortest useful reminder: one Arabic SMS segment. The reminder goes out exactly 24 hours
-- before the appointment, so "tomorrow" is always right. Owner-edited texts are kept.
update public.notification_templates
   set body_ar = 'تذكير: موعدك في {{business}} غداً الساعة {{time}}'
 where event = 'reminder_24h'
   and body_ar in (
     E'تذكير من {{business}}: موعدك ({{service}}) يوم {{date}} الساعة {{time}}.
لإدارة الموعد: {{link}}',
     'تذكير من {{business}}: موعدك {{date}} الساعة {{time}}'
   );

-- Disabled message types are skipped instead of sent.
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
  elsif not coalesce((select t.is_enabled from public.notification_templates t where t.event = ob.event), true) then
    skip_status := 'skipped'; skip_reason := 'message_disabled';
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

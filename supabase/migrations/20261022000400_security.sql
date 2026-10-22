-- DONIANA booking — Row Level Security and privileges.
-- Public (anon) users can read only the catalog, opening hours and public business info.
-- Appointments and everything containing personal data are readable only by administrators and
-- writable only through the security-definer functions above.

grant usage on schema private to anon, authenticated, service_role;
revoke all on all functions in schema private from public;
grant execute on function private.is_admin() to anon, authenticated, service_role;

-- Tables ------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'services', 'service_addons', 'service_locations', 'business_hours', 'business_breaks',
    'blocked_time_ranges', 'business_settings', 'notification_settings', 'notification_templates',
    'portfolio_images', 'admin_profiles', 'appointments', 'appointment_addons', 'appointment_audit_log',
    'notification_outbox', 'notification_delivery_attempts', 'rate_limit_counters'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- Public catalog & info: read-only for everyone, full control for admins.
do $$
declare
  t text;
begin
  foreach t in array array['services', 'service_addons', 'service_locations', 'business_hours', 'business_settings', 'portfolio_images'] loop
    execute format('grant select on table public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on table public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',
      t || '_admin_all', t
    );
  end loop;
end;
$$;

create policy services_public_read on public.services
  for select to anon, authenticated using (is_active);
create policy service_addons_public_read on public.service_addons
  for select to anon, authenticated using (is_active);
create policy service_locations_public_read on public.service_locations
  for select to anon, authenticated using (is_active);
create policy business_hours_public_read on public.business_hours
  for select to anon, authenticated using (true);
create policy business_settings_public_read on public.business_settings
  for select to anon, authenticated using (true);
create policy portfolio_images_public_read on public.portfolio_images
  for select to anon, authenticated using (is_published);

-- Admin-only configuration.
do $$
declare
  t text;
begin
  foreach t in array array['business_breaks', 'blocked_time_ranges', 'notification_settings', 'notification_templates'] loop
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',
      t || '_admin_all', t
    );
  end loop;
end;
$$;

-- Personal data & operational logs: admins may read; all writes go through functions.
do $$
declare
  t text;
begin
  foreach t in array array['appointments', 'appointment_addons', 'appointment_audit_log', 'notification_outbox', 'notification_delivery_attempts'] loop
    execute format('grant select on table public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.is_admin()))',
      t || '_admin_read', t
    );
  end loop;
end;
$$;

grant select on table public.admin_profiles to authenticated;
create policy admin_profiles_self_read on public.admin_profiles
  for select to authenticated using (user_id = (select auth.uid()));

-- rate_limit_counters: no grants, no policies (service role only).

-- Functions ----------------------------------------------------------------

do $$
declare
  f text;
begin
  -- Service-role only: called by Edge Functions after their own validation.
  foreach f in array array[
    'public.book_appointment(uuid, text, uuid, uuid[], uuid, timestamptz, text, text, public.appointment_source, boolean, text, uuid, boolean)',
    'public.get_appointment_by_token(text, timestamptz)',
    'public.cancel_appointment_by_token(text, timestamptz)',
    'public.rate_limit_hit(text, integer, integer)',
    'public.purge_rate_limit_counters()',
    'public.claim_due_notifications(integer, integer)',
    'public.begin_notification_delivery(uuid, text)',
    'public.finish_notification_delivery(uuid, text, text, text, integer, text, boolean)',
    'public.record_delivery_status(text, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;

  -- Admin RPCs: callable by signed-in users, each one checks private.is_admin() itself.
  foreach f in array array[
    'public.admin_cancel_appointment(uuid, text, boolean)',
    'public.admin_update_appointment(uuid, timestamptz, uuid, uuid[], uuid, text, text, text, boolean, boolean)',
    'public.admin_set_appointment_status(uuid, public.appointment_status, boolean)',
    'public.admin_retry_notification(uuid)',
    'public.anonymize_appointments_before(timestamptz)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;

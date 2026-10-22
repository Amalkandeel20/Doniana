-- DONIANA — Supabase platform integration: Storage buckets and scheduled jobs.
-- Guarded so the schema can also be applied to plain PostgreSQL (CI integration tests).

-- Storage ------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'storage' and c.relname = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('service-images', 'service-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
      ('portfolio', 'portfolio', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
    on conflict (id) do nothing;

    execute $p$
      create policy "admin upload images" on storage.objects for insert to authenticated
      with check (bucket_id in ('service-images', 'portfolio') and (select private.is_admin()))
    $p$;
    execute $p$
      create policy "admin update images" on storage.objects for update to authenticated
      using (bucket_id in ('service-images', 'portfolio') and (select private.is_admin()))
    $p$;
    execute $p$
      create policy "admin delete images" on storage.objects for delete to authenticated
      using (bucket_id in ('service-images', 'portfolio') and (select private.is_admin()))
    $p$;
  end if;
end;
$$;

-- Scheduled jobs -------------------------------------------------------------
-- process-notifications runs every 30 seconds so reminders go out within seconds of
-- starts_at − 24h. Requires two Vault secrets (see docs/DEPLOYMENT.md):
--   project_url  e.g. https://<ref>.supabase.co
--   cron_secret  same value as the CRON_SECRET Edge Function secret
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_namespace where nspname = 'vault') then
    create extension if not exists pg_cron with schema pg_catalog;
    create extension if not exists pg_net with schema extensions;

    perform cron.schedule(
      'doniana-process-notifications',
      '30 seconds',
      $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/process-notifications',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 25000
        );
      $job$
    );

    perform cron.schedule('doniana-purge-rate-limits', '17 3 * * *', 'select public.purge_rate_limit_counters()');
  end if;
end;
$$;

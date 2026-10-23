-- Edge Function configuration from Supabase Vault.
-- Functions read settings from their environment first (`supabase secrets set`); anything missing
-- falls back to Vault secrets named `doniana_<setting>` (e.g. doniana_manage_token_secret →
-- MANAGE_TOKEN_SECRET), plus the cron job's `cron_secret`. This lets an environment be configured
-- entirely from SQL: secret values can be generated inside the database and never leave it.
create or replace function public.get_function_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  config jsonb;
begin
  select coalesce(jsonb_object_agg(
           case when s.name = 'cron_secret' then 'CRON_SECRET' else upper(substr(s.name, 9)) end,
           s.decrypted_secret
         ), '{}'::jsonb)
    into config
    from vault.decrypted_secrets s
   where s.name like 'doniana\_%' or s.name = 'cron_secret';
  return config;
end;
$$;

revoke all on function public.get_function_config() from public, anon, authenticated;
grant execute on function public.get_function_config() to service_role;

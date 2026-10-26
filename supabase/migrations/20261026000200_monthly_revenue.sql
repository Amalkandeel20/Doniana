-- Admin revenue overview: totals per calendar month in Asia/Jerusalem, from the price snapshot
-- stored on each appointment. Cancelled appointments never count.
--   earned_agorot   = appointments that already started (completed, or confirmed and past)
--   expected_agorot = confirmed appointments still ahead
create or replace function public.admin_monthly_revenue(p_months integer default 12)
returns table (
  month date,
  earned_agorot bigint,
  expected_agorot bigint,
  appointments integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  with months as (
    select (date_trunc('month', now() at time zone 'Asia/Jerusalem') - make_interval(months => g))::date as m
      from generate_series(0, greatest(1, least(coalesce(p_months, 12), 36)) - 1) as g
  )
  select mo.m,
         coalesce(sum(a.total_price_agorot) filter (where a.starts_at <= now()), 0)::bigint,
         coalesce(sum(a.total_price_agorot) filter (where a.starts_at > now()), 0)::bigint,
         count(a.id)::integer
    from months mo
    left join public.appointments a
      on a.status <> 'cancelled'
     and (a.starts_at at time zone 'Asia/Jerusalem') >= mo.m
     and (a.starts_at at time zone 'Asia/Jerusalem') < (mo.m + interval '1 month')
   group by mo.m
   order by mo.m;
end;
$$;

revoke all on function public.admin_monthly_revenue(integer) from public, anon;
grant execute on function public.admin_monthly_revenue(integer) to authenticated, service_role;

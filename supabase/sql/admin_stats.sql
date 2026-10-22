-- Aggregations for the admin dashboard. Callable ONLY with the service role
-- (the admin-* edge functions); they read auth.users so must never be exposed
-- to clients. Safe to re-run. Depends on voice_sessions.sql for DAU/usage.

create or replace function admin_user_stats(p_days int default 30, p_tz text default 'UTC')
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with days as (
    select d::date as day
    from generate_series(
      (now() at time zone p_tz)::date - (p_days - 1),
      (now() at time zone p_tz)::date,
      interval '1 day'
    ) d
  ),
  signups as (
    select (created_at at time zone p_tz)::date as day, count(*) as n
    from auth.users group by 1
  ),
  activity as (
    select user_id, created_at as ts from journal_entries
    union all
    select c.user_id, m.created_at from chat_messages m
      join chat_conversations c on c.id = m.conversation_id where m.role = 'user'
    union all
    select user_id, started_at from voice_sessions where user_id is not null
  ),
  dau as (
    select (ts at time zone p_tz)::date as day, count(distinct user_id) as n
    from activity group by 1
  )
  select jsonb_build_object(
    'total_users', (select count(*) from auth.users),
    'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'new_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'active_today', (select coalesce(n, 0) from dau where day = (now() at time zone p_tz)::date),
    'active_7d', (select count(distinct user_id) from activity where ts > now() - interval '7 days'),
    'active_30d', (select count(distinct user_id) from activity where ts > now() - interval '30 days'),
    'signups_per_day', (
      select jsonb_agg(jsonb_build_object('day', days.day, 'count', coalesce(s.n, 0)) order by days.day)
      from days left join signups s using (day)
    ),
    'dau_per_day', (
      select jsonb_agg(jsonb_build_object('day', days.day, 'count', coalesce(a.n, 0)) order by days.day)
      from days left join dau a using (day)
    )
  );
$$;

revoke all on function admin_user_stats(int, text) from public, anon, authenticated;
grant execute on function admin_user_stats(int, text) to service_role;

-- One row per live-transcription WebSocket session, written by the
-- transcribe-voice-live edge function. Usage numbers only start from when
-- the function that writes this ships.

create table if not exists voice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  language text not null default 'en',
  -- 'active' while open; 'completed' on clean close; 'error' if Deepgram or
  -- the relay failed mid-session; 'rejected' if the session never got going
  -- (e.g. Deepgram refused the connection because the concurrency limit hit).
  status text not null default 'active'
    check (status in ('active', 'completed', 'error', 'rejected')),
  reject_reason text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds numeric,
  audio_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists voice_sessions_started_at_idx on voice_sessions(started_at desc);
create index if not exists voice_sessions_user_id_idx on voice_sessions(user_id);
create index if not exists voice_sessions_active_idx on voice_sessions(last_seen_at) where status = 'active';

alter table voice_sessions enable row level security;

drop policy if exists "admins read voice_sessions" on voice_sessions;
create policy "admins read voice_sessions" on voice_sessions
  for select using (is_admin());
-- Writes come from the edge function using the service role (bypasses RLS).

-- Sessions still 'active' with no heartbeat for this long are treated as dead
-- (the function crashed / was recycled before it could write the end row).
create or replace function voice_session_stale_after() returns interval
language sql immutable as $$ select interval '90 seconds' $$;

create or replace function admin_voice_usage(
  p_days int default 30,
  p_tz text default 'UTC',
  p_rate_en numeric default 0.0077,    -- USD per audio minute, Nova-3 monolingual streaming
  p_rate_multi numeric default 0.0092  -- USD per audio minute, Nova-3 multilingual streaming
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select d::date as day
    from generate_series(
      (now() at time zone p_tz)::date - (p_days - 1),
      (now() at time zone p_tz)::date,
      interval '1 day'
    ) d
  ),
  s as (
    select
      (started_at at time zone p_tz)::date as day,
      language,
      -- audio seconds: bytes / (16000 samples/s * 2 bytes); fall back to wall clock
      greatest(coalesce(nullif(audio_bytes, 0) / 32000.0, 0), 0) as audio_s
    from voice_sessions
    where status in ('completed', 'error', 'active')
      and started_at > now() - make_interval(days => p_days + 1)
  ),
  per_day as (
    select day,
      count(*) as sessions,
      sum(audio_s) / 60.0 as minutes,
      sum(audio_s / 60.0 * case when language = 'multi' then p_rate_multi else p_rate_en end) as cost
    from s group by day
  )
  select jsonb_build_object(
    'per_day', (
      select jsonb_agg(jsonb_build_object(
        'day', days.day,
        'sessions', coalesce(p.sessions, 0),
        'minutes', round(coalesce(p.minutes, 0)::numeric, 2),
        'cost', round(coalesce(p.cost, 0)::numeric, 4)
      ) order by days.day)
      from days left join per_day p using (day)
    ),
    'totals', (
      select jsonb_build_object(
        'sessions', coalesce(sum(sessions), 0),
        'minutes', round(coalesce(sum(minutes), 0)::numeric, 2),
        'cost', round(coalesce(sum(cost), 0)::numeric, 4)
      ) from per_day
    ),
    'unique_users', (
      select count(distinct user_id) from voice_sessions
      where started_at > now() - make_interval(days => p_days) and status <> 'rejected'
    )
  );
$$;

-- Concurrency: live count, hourly peaks, and rejections.
create or replace function admin_voice_concurrency(p_hours int default 72)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with sessions as (
    select
      started_at as s,
      -- open sessions with a live heartbeat run until now; dead ones end at last heartbeat
      case
        when ended_at is not null then ended_at
        when last_seen_at > now() - voice_session_stale_after() then now()
        else last_seen_at
      end as e
    from voice_sessions
    where status <> 'rejected'
      and started_at > now() - make_interval(hours => p_hours + 6)
  ),
  events as (
    select s as ts, 1 as delta from sessions
    union all
    select e as ts, -1 as delta from sessions
  ),
  running as (
    -- order -1 before +1 at the same instant so back-to-back sessions don't double count
    select ts, sum(delta) over (order by ts, delta rows between unbounded preceding and current row) as c
    from events
  ),
  hours as (
    select h as hour_start
    from generate_series(
      date_trunc('hour', now()) - make_interval(hours => p_hours - 1),
      date_trunc('hour', now()),
      interval '1 hour'
    ) h
  ),
  hourly as (
    select hours.hour_start,
      coalesce(max(r.c), 0) as peak,
      -- sessions already open when the hour began also count toward its peak
      greatest(coalesce(max(r.c), 0), (
        select count(*) from sessions
        where s < hours.hour_start and e >= hours.hour_start
      )) as peak_incl_carry
    from hours
    left join running r on r.ts >= hours.hour_start and r.ts < hours.hour_start + interval '1 hour'
    group by hours.hour_start
  )
  select jsonb_build_object(
    'active_now', (
      select count(*) from voice_sessions
      where status = 'active' and last_seen_at > now() - voice_session_stale_after()
    ),
    'peak_per_hour', (
      select jsonb_agg(jsonb_build_object('hour', hour_start, 'peak', peak_incl_carry) order by hour_start)
      from hourly
    ),
    'peak_overall', (select coalesce(max(peak_incl_carry), 0) from hourly),
    'rejections_per_hour', (
      select coalesce(jsonb_agg(jsonb_build_object('hour', hour_start, 'count', n) order by hour_start), '[]'::jsonb)
      from (
        select date_trunc('hour', started_at) as hour_start, count(*) as n
        from voice_sessions
        where status = 'rejected' and started_at > now() - make_interval(hours => p_hours)
        group by 1
      ) r
    ),
    'recent_rejections', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'at', started_at, 'reason', reject_reason, 'user_id', user_id
      ) order by started_at desc), '[]'::jsonb)
      from (
        select * from voice_sessions
        where status = 'rejected' order by started_at desc limit 20
      ) rr
    ),
    'rejected_total', (
      select count(*) from voice_sessions
      where status = 'rejected' and started_at > now() - make_interval(hours => p_hours)
    )
  );
$$;

revoke all on function admin_voice_usage(int, text, numeric, numeric) from public, anon, authenticated;
revoke all on function admin_voice_concurrency(int) from public, anon, authenticated;
grant execute on function admin_voice_usage(int, text, numeric, numeric) to service_role;
grant execute on function admin_voice_concurrency(int) to service_role;

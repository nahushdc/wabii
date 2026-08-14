-- Per-user toggle for whether weekly/monthly reflections get generated at all.
alter table users add column if not exists weekly_reflections_enabled boolean not null default true;
alter table users add column if not exists monthly_reflections_enabled boolean not null default true;

-- Monthly reflection — same shape as weekly_digests (content, rating,
-- feedback_comment, seen_at), scoped to a calendar month instead of a week.
create table if not exists monthly_digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  month_start date not null,
  rating text check (rating in ('up', 'down')),
  feedback_comment text,
  seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists monthly_digests_user_id_idx on monthly_digests(user_id);
create unique index if not exists monthly_digests_user_month_idx on monthly_digests(user_id, month_start);

alter table monthly_digests enable row level security;

-- Mirrors weekly_digests' existing (permissive) policy shape for consistency
-- with how that table is already set up.
create policy "Service role can manage monthly digests" on monthly_digests
  for all using (true) with check (true);

create policy "Users can view own monthly digests" on monthly_digests
  for select using (auth.uid() = user_id);

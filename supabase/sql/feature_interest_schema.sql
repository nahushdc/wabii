-- Tracks who's tapped "Notify me" on upcoming/paywalled feature announcements
-- (e.g. proactive iMessage/voice-call reminders), so we know demand before building.

create table if not exists feature_interest (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  created_at timestamptz not null default now(),
  unique (user_id, feature)
);

create index if not exists feature_interest_user_id_idx on feature_interest(user_id);

alter table feature_interest enable row level security;

create policy "select own feature interest" on feature_interest
  for select using (user_id = auth.uid());

create policy "insert own feature interest" on feature_interest
  for insert with check (user_id = auth.uid());

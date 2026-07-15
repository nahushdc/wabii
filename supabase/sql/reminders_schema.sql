-- Multiple reminders per user, replacing the single notify_* columns on `users`.

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  hour integer not null check (hour >= 0 and hour <= 23),
  message text,
  skip_if_journaled boolean not null default true,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reminders_user_id_idx on reminders(user_id);

alter table reminders enable row level security;

create policy "select own reminders" on reminders
  for select using (user_id = auth.uid());

create policy "insert own reminders" on reminders
  for insert with check (user_id = auth.uid());

create policy "update own reminders" on reminders
  for update using (user_id = auth.uid());

create policy "delete own reminders" on reminders
  for delete using (user_id = auth.uid());

-- Carry over each user's existing single reminder, if they had one enabled.
-- Old notify_* columns on `users` are left in place but unused going forward.
insert into reminders (user_id, hour, message, skip_if_journaled)
select id, notify_hour, nullif(notify_message, ''), coalesce(notify_skip_if_journaled, true)
from users
where notify_enabled = true and notify_hour is not null;

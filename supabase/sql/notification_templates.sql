-- Editable notification copy + rules. The app (and the send-reminders edge
-- function) read these; the app falls back to its built-in copy if the fetch
-- fails or the table is empty. Safe to re-run.
--
-- A zone applies from its start_hour until the next zone's start_hour. An hour
-- earlier than every start_hour belongs to the zone with the latest start_hour
-- (so with 5/12/17, 3am is "evening" — i.e. late night).

create table if not exists notification_zones (
  key text primary key,
  label text not null,
  start_hour integer not null unique check (start_hour >= 0 and start_hour <= 23),
  title text not null,
  bodies text[] not null check (array_length(bodies, 1) >= 1),
  updated_at timestamptz not null default now()
);

create table if not exists notification_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table notification_zones enable row level security;
alter table notification_settings enable row level security;

drop policy if exists "authenticated read notification_zones" on notification_zones;
create policy "authenticated read notification_zones" on notification_zones
  for select using (auth.role() = 'authenticated');
drop policy if exists "admins write notification_zones" on notification_zones;
create policy "admins write notification_zones" on notification_zones
  for all using (is_admin()) with check (is_admin());

drop policy if exists "authenticated read notification_settings" on notification_settings;
create policy "authenticated read notification_settings" on notification_settings
  for select using (auth.role() = 'authenticated');
drop policy if exists "admins write notification_settings" on notification_settings;
create policy "admins write notification_settings" on notification_settings
  for all using (is_admin()) with check (is_admin());

insert into notification_zones (key, label, start_hour, title, bodies) values
  ('morning', 'Morning', 5, 'Good Morning! 🌅', array[
    'Time for your morning journaling session. How are you feeling today?',
    'A fresh page is waiting. What do you want to carry into today?',
    'Before the day gets loud, take a quiet minute for your thoughts.',
    'How are you waking up today? Let it out on the page.',
    'Set your intention, or just ramble. Either way, start here.'
  ]),
  ('afternoon', 'Afternoon', 12, 'Afternoon Check-in 🌤️', array[
    'How''s your day going? Take a moment to reflect and journal.',
    'Pause for a breath. What has today been like so far?',
    'Halfway through the day. A few words can reset the rest of it.',
    'Something on your mind? Give it a home here.',
    'Take two minutes for yourself before the day carries on.'
  ]),
  ('evening', 'Evening', 17, 'Evening Reflection 🌙', array[
    'End your day with gratitude and reflection. What are you thankful for?',
    'How did today actually feel? Let it settle onto the page.',
    'Wind down by looking back. What is worth remembering?',
    'Put the day down gently. What do you want to let go of?',
    'One good thing, one hard thing. Write them both before bed.'
  ])
on conflict (key) do nothing;

-- days_ahead: how many days of upcoming reminders each phone schedules locally.
insert into notification_settings (key, value) values ('days_ahead', '14'::jsonb)
on conflict (key) do nothing;

-- One-off notifications the server sends (weekly/monthly reflection ready).
-- Edge functions fall back to their built-in text if a row is missing.
create table if not exists notification_messages (
  key text primary key,
  title text not null check (length(trim(title)) > 0),
  body text not null check (length(trim(body)) > 0),
  updated_at timestamptz not null default now()
);

alter table notification_messages enable row level security;

drop policy if exists "admins manage notification_messages" on notification_messages;
create policy "admins manage notification_messages" on notification_messages
  for all using (is_admin()) with check (is_admin());

insert into notification_messages (key, title, body) values
  ('weekly_digest_ready', 'Your weekly reflection is ready 🌿', 'A look back at your week, and the pursuits you explored.'),
  ('monthly_digest_ready', 'Your monthly reflection is ready 🌙', 'A look back at your month, and the pursuits you explored.')
on conflict (key) do nothing;

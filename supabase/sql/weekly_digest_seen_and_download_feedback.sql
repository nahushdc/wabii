-- Tracks when a user has actually opened a weekly reflection, so the Reflect
-- tab can highlight unread ones and tone down once viewed.
alter table weekly_digests add column if not exists seen_at timestamptz;

-- Feedback collected specifically from people who download/share their
-- weekly reflection — a moment of high intent worth asking about.
create table if not exists weekly_digest_download_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  digest_id uuid not null references weekly_digests(id) on delete cascade,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists weekly_digest_download_feedback_user_id_idx on weekly_digest_download_feedback(user_id);

alter table weekly_digest_download_feedback enable row level security;

create policy "select own weekly_digest_download_feedback" on weekly_digest_download_feedback
  for select using (user_id = auth.uid());

create policy "insert own weekly_digest_download_feedback" on weekly_digest_download_feedback
  for insert with check (user_id = auth.uid());

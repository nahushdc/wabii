create table prompt_themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table theme_prompts (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references prompt_themes(id) on delete cascade,
  prompt_text text not null,
  sort_order integer not null default 0
);

create table theme_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  theme_id uuid not null references prompt_themes(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  created_at timestamptz not null default now()
);

create index theme_prompts_theme_id_idx on theme_prompts(theme_id, sort_order);
create index theme_insights_theme_id_idx on theme_insights(theme_id, created_at);
create index search_history_user_id_idx on search_history(user_id, created_at);

alter table reminders add column if not exists prompt_theme_id uuid references prompt_themes(id) on delete set null;
alter table journal_entries add column if not exists prompt_theme_id uuid references prompt_themes(id) on delete set null;

alter table prompt_themes enable row level security;
alter table theme_prompts enable row level security;
alter table theme_insights enable row level security;
alter table search_history enable row level security;

create policy "select own prompt_themes" on prompt_themes for select using (user_id = auth.uid());
create policy "insert own prompt_themes" on prompt_themes for insert with check (user_id = auth.uid());
create policy "update own prompt_themes" on prompt_themes for update using (user_id = auth.uid());
create policy "delete own prompt_themes" on prompt_themes for delete using (user_id = auth.uid());

create policy "select own theme_prompts" on theme_prompts
  for select using (exists (select 1 from prompt_themes t where t.id = theme_prompts.theme_id and t.user_id = auth.uid()));
create policy "insert own theme_prompts" on theme_prompts
  for insert with check (exists (select 1 from prompt_themes t where t.id = theme_prompts.theme_id and t.user_id = auth.uid()));
create policy "update own theme_prompts" on theme_prompts
  for update using (exists (select 1 from prompt_themes t where t.id = theme_prompts.theme_id and t.user_id = auth.uid()));
create policy "delete own theme_prompts" on theme_prompts
  for delete using (exists (select 1 from prompt_themes t where t.id = theme_prompts.theme_id and t.user_id = auth.uid()));

create policy "select own theme_insights" on theme_insights for select using (user_id = auth.uid());
create policy "insert own theme_insights" on theme_insights for insert with check (user_id = auth.uid());

create policy "select own search_history" on search_history for select using (user_id = auth.uid());
create policy "insert own search_history" on search_history for insert with check (user_id = auth.uid());

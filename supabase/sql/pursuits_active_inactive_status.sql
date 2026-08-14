alter table prompt_themes add column if not exists status text not null default 'active' check (status in ('active', 'inactive'));

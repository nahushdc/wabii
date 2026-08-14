-- Upgrades prompt_themes ("Awareness Themes" in the UI) with a stated goal,
-- the reason behind it, and a nudge duration (e.g. 2 weeks, 1 month) instead
-- of an indefinite set of prompts.

alter table prompt_themes add column if not exists goal text;
alter table prompt_themes add column if not exists motivation text;
alter table prompt_themes add column if not exists duration_days integer;
alter table prompt_themes add column if not exists started_at timestamptz not null default now();

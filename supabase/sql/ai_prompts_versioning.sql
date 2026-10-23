-- Version history for ai_prompts. Every insert/update/delete on ai_prompts
-- snapshots into ai_prompt_versions. A delete means "reset to the default
-- baked into the edge function" and is recorded with a null template.
-- Safe to re-run. Run admin_foundation.sql first.

alter table ai_prompts add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table ai_prompts add column if not exists note text;

create table if not exists ai_prompt_versions (
  id bigint generated always as identity primary key,
  key text not null,
  template text,            -- null = reset to default
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_prompt_versions_key_idx on ai_prompt_versions(key, created_at desc);

alter table ai_prompt_versions enable row level security;

drop policy if exists "admins read ai_prompt_versions" on ai_prompt_versions;
create policy "admins read ai_prompt_versions" on ai_prompt_versions
  for select using (is_admin());

create or replace function snapshot_ai_prompt() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into ai_prompt_versions (key, template, note, created_by)
    values (old.key, null, 'Reset to default', old.updated_by);
    return old;
  end if;

  if tg_op = 'UPDATE' and new.template is not distinct from old.template then
    return new;
  end if;

  new.updated_at := now();
  insert into ai_prompt_versions (key, template, note, created_by)
  values (new.key, new.template, new.note, new.updated_by);
  return new;
end;
$$;

drop trigger if exists ai_prompts_snapshot on ai_prompts;
create trigger ai_prompts_snapshot
  before insert or update or delete on ai_prompts
  for each row execute function snapshot_ai_prompt();

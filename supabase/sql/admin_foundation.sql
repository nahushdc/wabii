-- Admin dashboard foundation: who is an admin, and lock down ai_prompts.
-- Run in the Supabase SQL editor. Safe to re-run.

create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table admin_users enable row level security;

-- Admins can see their own row (lets the dashboard check "am I an admin").
-- No insert/update/delete policies: rows are managed from the SQL editor only.
drop policy if exists "admins read own row" on admin_users;
create policy "admins read own row" on admin_users
  for select using (user_id = auth.uid());

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$;

revoke all on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated, service_role;

-- Seed the owner account by email (must have signed in to the app once).
insert into admin_users (user_id)
select id from auth.users where lower(email) = 'nahushdc@gmail.com'
on conflict do nothing;

-- Tighten ai_prompts: previously ANY signed-in user could read/insert/update.
-- Edge functions use the service role (bypasses RLS); the dashboard goes through
-- admin-* edge functions. Direct client access is admin-only.
drop policy if exists "authenticated can select ai_prompts" on ai_prompts;
drop policy if exists "authenticated can insert ai_prompts" on ai_prompts;
drop policy if exists "authenticated can update ai_prompts" on ai_prompts;
drop policy if exists "admins manage ai_prompts" on ai_prompts;

create policy "admins manage ai_prompts" on ai_prompts
  for all using (is_admin()) with check (is_admin());

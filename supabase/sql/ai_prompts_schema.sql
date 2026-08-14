-- Stores editable prompt templates for AI features (starting with the search
-- summary) so they can be tuned from an in-app admin screen without a redeploy.
-- {{placeholder}} tokens in `template` are substituted by the calling edge function.

create table if not exists ai_prompts (
  key text primary key,
  template text not null,
  updated_at timestamptz not null default now()
);

alter table ai_prompts enable row level security;

-- No admin-role system exists yet — this app has a single owner-operator, so
-- any authenticated user can view/edit. Tighten this if that ever changes.
create policy "authenticated can select ai_prompts" on ai_prompts
  for select using (auth.role() = 'authenticated');

create policy "authenticated can insert ai_prompts" on ai_prompts
  for insert with check (auth.role() = 'authenticated');

create policy "authenticated can update ai_prompts" on ai_prompts
  for update using (auth.role() = 'authenticated');

insert into ai_prompts (key, template) values (
  'search_summary',
  $tpl$Someone searched their own journal for: "{{query}}"

Below are journal entries that matched. Respond with 2-3 short, punchy bullet points (one per line, no numbering or dashes, under 20 words each) that directly address what they asked, grounded strictly in what's actually written. Don't invent details or generalize beyond the entries. Second person ("you").

Journal entries:
{{entries}}$tpl$
) on conflict (key) do nothing;

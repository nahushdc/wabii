-- Thumbs up/down feedback on search AI summaries, with an optional written
-- reason when the summary didn't land (thumbs down).

create table if not exists ai_summary_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  summary text not null,
  rating text not null check (rating in ('up', 'down')),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists ai_summary_feedback_user_id_idx on ai_summary_feedback(user_id);

alter table ai_summary_feedback enable row level security;

create policy "select own ai_summary_feedback" on ai_summary_feedback
  for select using (user_id = auth.uid());

create policy "insert own ai_summary_feedback" on ai_summary_feedback
  for insert with check (user_id = auth.uid());

create policy "update own ai_summary_feedback" on ai_summary_feedback
  for update using (user_id = auth.uid());

-- Upgrade the search-summary prompt to produce a short headline plus a
-- separate detailed breakdown (client shows short by default, detailed behind "More").
update ai_prompts set template = $tpl$Someone searched their own journal for: "{{query}}"

Below are journal entries that matched. Respond in exactly this format:

SHORT: <one short sentence, under 15 words, directly answering what they asked, second person ("you")>
DETAILED:
<2-3 short bullet points, one per line, no numbering or dashes, under 20 words each>

Ground everything strictly in what's actually written — don't invent details or generalize beyond the entries.

Journal entries:
{{entries}}$tpl$
where key = 'search_summary';

-- Pursuit redesign: a pursuit is a saved question answered from the WHOLE
-- journal, not only from entries logged against it.
--
-- pursuit_queries holds a few embedded "what this looks like in a journal"
-- sentences per pursuit (written by the AI when the pursuit is first opened),
-- so abstract questions like "Why do I sabotage myself?" can match entries that
-- never use those words. Only the service role (edge functions) reads or writes
-- it, so it has RLS on and no policies.
create table if not exists pursuit_queries (
  id uuid primary key default gen_random_uuid(),
  pursuit_id uuid not null references prompt_themes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  embedding vector(384) not null,
  created_at timestamptz not null default now()
);
create index if not exists pursuit_queries_pursuit_id_idx on pursuit_queries(pursuit_id);
alter table pursuit_queries enable row level security;

-- Cached "what keeps showing up" write-ups live beside the existing insights.
alter table theme_insights drop constraint if exists theme_insights_insight_type_check;
alter table theme_insights add constraint theme_insights_insight_type_check
  check (insight_type in ('theme', 'pattern', 'overview'));

-- Entries related to a pursuit: the best similarity across its query
-- sentences, with entries already logged against the pursuit counted as full
-- matches. Callable only by the service role; the edge function passes the
-- user it has already authenticated.
create or replace function match_pursuit_entries(
  p_pursuit_id uuid,
  p_user_id uuid,
  p_min_similarity double precision default 0.8,
  p_limit integer default 500
)
returns table (id uuid, content text, created_at timestamptz, similarity double precision, tagged boolean)
language sql stable
as $$
  with best as (
    select e.entry_id, max(1 - (e.embedding <=> q.embedding)) as sim
    from pursuit_queries q
    cross join embeddings e
    join journal_entries je on je.id = e.entry_id
    where q.pursuit_id = p_pursuit_id and je.user_id = p_user_id
    group by e.entry_id
  )
  select
    je.id,
    je.content,
    je.created_at,
    case when je.prompt_theme_id = p_pursuit_id then 1.0::double precision else b.sim end as similarity,
    (je.prompt_theme_id = p_pursuit_id) as tagged
  from journal_entries je
  left join best b on b.entry_id = je.id
  where je.user_id = p_user_id
    and (je.prompt_theme_id = p_pursuit_id or coalesce(b.sim, 0) >= p_min_similarity)
  order by similarity desc
  limit p_limit;
$$;

revoke all on function match_pursuit_entries(uuid, uuid, double precision, integer) from public, anon, authenticated;
grant execute on function match_pursuit_entries(uuid, uuid, double precision, integer) to service_role;

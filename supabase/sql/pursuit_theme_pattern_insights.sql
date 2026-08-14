-- A Pursuit now produces two distinct AI-generated insight types:
--   'theme'   — what it's about, semantic/content-based, powered by embeddings
--               (same match_journal_entries mechanism as search), can surface
--               from as little as one relevant entry anywhere in the journal.
--   'pattern' — when/how it recurs, structural/temporal, powered by a Claude
--               call over the entries explicitly logged under this pursuit
--               (needs multiple occurrences to say anything about timing).
-- Existing rows predate this split and were all pattern-style analyses.
alter table theme_insights add column if not exists insight_type text not null default 'pattern'
  check (insight_type in ('theme', 'pattern'));

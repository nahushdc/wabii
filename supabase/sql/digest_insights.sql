-- Structured highlights for weekly/monthly reflections: moods identified,
-- and patterns classified as new / repeating / needing attention (compared
-- against the user's previous digest of the same type). Lets the UI show
-- data points ("4 moods · 3 new patterns · 6 repeating · 2 need attention")
-- instead of just a truncated snippet of the prose reflection.
--
-- Shape:
-- {
--   "moods": ["anxious", "hopeful", "overwhelmed"],
--   "new_patterns": ["Starting to set boundaries at work"],
--   "repeating_patterns": ["Self-doubt after social interactions"],
--   "attention_patterns": ["Avoiding conflict with partner"]
-- }

alter table weekly_digests add column if not exists insights jsonb;
alter table monthly_digests add column if not exists insights jsonb;

-- Replaces the multi-select chip version (signup_reasons/signup_reason_other,
-- from onboarding_signup_reasons.sql) with a single free-text field. Chips
-- lost exactly the specific, personal language that matters most ("it's hard
-- to sit with my emotions" vs. "Process what I'm feeling") — open text
-- captures their actual words instead of forcing a category. No rows had
-- been written under the old columns yet, so this is a clean swap.

alter table users drop column if exists signup_reasons;
alter table users drop column if exists signup_reason_other;
alter table users add column if not exists signup_reason text;

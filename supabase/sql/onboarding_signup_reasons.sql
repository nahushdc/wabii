-- Captures why someone signed up (multi-select presets + optional free-text
-- "other"), collected once during onboarding. Lets us understand what draws
-- people to the app without guessing.

alter table users add column if not exists signup_reasons text[];
alter table users add column if not exists signup_reason_other text;

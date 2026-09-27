-- A persistent testing switch, independent of the normal per-user
-- onboarding_complete flag: when true, onboarding shows on every launch for
-- that account regardless of whether onboarding was actually completed —
-- useful for repeatedly testing the onboarding flow without it "sticking"
-- as done the moment you finish/skip it once.
alter table users add column if not exists force_onboarding boolean not null default false;

-- Same one-time backfill as the earlier reminders_add_days.sql migration —
-- existing accounts (created before or without ever finishing the onboarding
-- flow's finish() action) were stuck with onboarding_complete = false,
-- causing onboarding to reappear on every launch instead of only for
-- genuinely new signups.
update users set onboarding_complete = true where onboarding_complete is not true;

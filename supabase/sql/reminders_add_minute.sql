alter table reminders add column if not exists minute integer not null default 0 check (minute >= 0 and minute <= 59);

alter table reminders
  add column if not exists days_of_week smallint[] not null default array[0,1,2,3,4,5,6]::smallint[];

alter table reminders
  add constraint reminders_days_of_week_valid check (days_of_week <@ array[0,1,2,3,4,5,6]::smallint[]);

alter table reminders
  add constraint reminders_days_of_week_nonempty check (array_length(days_of_week, 1) > 0);

-- Onboarding is new; make sure nobody who already uses the app gets routed into it.
update users set onboarding_complete = true where onboarding_complete is not true;

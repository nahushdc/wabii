-- Runs 9:00 UTC on the last few days of every month; the function itself
-- checks whether "today" is actually the last day before doing anything, so
-- it only ever generates once per month.
select cron.schedule(
  'monthly-digest-check',
  '0 9 28-31 * *',
  $cmd$
  select net.http_post(
    url := 'https://vkuxebtqryiphzeoecay.supabase.co/functions/v1/monthly-digest',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_-WZwxq58baT20i44rIOkEA_hr3AFsq5"}'::jsonb,
    body := '{}'::jsonb
  );
  $cmd$
);

-- Both cron jobs were calling their edge functions with a hardcoded legacy-format
-- anon JWT. Supabase's gateway now rejects that format for Edge Function calls
-- (401 UNAUTHORIZED_LEGACY_JWT), which has been silently breaking weekly-digest
-- and send-reminders since the project moved to the new sb_publishable_/sb_secret_
-- key format. Swap in the current publishable key.

select cron.alter_job(
  job_id := 1,
  command := $cmd$
  select net.http_post(
    url := 'https://vkuxebtqryiphzeoecay.supabase.co/functions/v1/weekly-digest',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_-WZwxq58baT20i44rIOkEA_hr3AFsq5"}'::jsonb,
    body := '{}'::jsonb
  );
  $cmd$
);

select cron.alter_job(
  job_id := 2,
  command := $cmd$
  select net.http_post(
    url := 'https://vkuxebtqryiphzeoecay.supabase.co/functions/v1/send-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_-WZwxq58baT20i44rIOkEA_hr3AFsq5"}'::jsonb,
    body := '{}'::jsonb
  );
  $cmd$
);

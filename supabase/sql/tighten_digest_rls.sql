-- The "Service role can manage digests" policies on weekly_digests and
-- monthly_digests were never actually restricted to the service role — they
-- applied to the `public` role (i.e. every signed-in user), granting full
-- read/write/delete on ANY row, not just your own. Scope them down to
-- service_role only, and give regular users a proper "own rows only" update
-- policy for the actions the app actually performs client-side (rating,
-- seen_at, feedback_comment).

drop policy if exists "Service role can manage digests" on weekly_digests;
drop policy if exists "Service role can manage monthly digests" on monthly_digests;

create policy "Service role can manage digests" on weekly_digests
  for all to service_role using (true) with check (true);

create policy "Service role can manage monthly digests" on monthly_digests
  for all to service_role using (true) with check (true);

create policy "Users can update own digests" on weekly_digests
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can update own monthly digests" on monthly_digests
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Simple local app-lock PIN. The hash+salt live server-side (same pattern as
-- every other per-user setting in this table) so the lock survives a
-- reinstall and isn't lost if local device storage is cleared.
alter table users add column if not exists app_lock_enabled boolean not null default false;
alter table users add column if not exists app_lock_pin_hash text;
alter table users add column if not exists app_lock_pin_salt text;

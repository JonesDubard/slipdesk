-- Rollback for 0013_email_notifications.sql

begin;

drop policy if exists notif_logs_no_client_update on public.notification_logs;
drop policy if exists notif_logs_no_client_write on public.notification_logs;
drop policy if exists notif_logs_select_staff on public.notification_logs;
drop table if exists public.notification_logs;

drop policy if exists secure_tokens_deny_all on public.secure_tokens;
drop table if exists public.secure_tokens;

drop policy if exists notif_prefs_insert_deny on public.notification_preferences;
drop policy if exists notif_prefs_update_own on public.notification_preferences;
drop policy if exists notif_prefs_select_own on public.notification_preferences;
drop table if exists public.notification_preferences;

alter table public.employees drop column if exists email_verified;
alter table public.employees drop column if exists last_email_at;
alter table public.employees drop column if exists last_email_status;

commit;

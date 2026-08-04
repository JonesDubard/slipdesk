-- Rollback for 0012_employee_password_auth.sql

begin;

drop policy if exists employee_auth_events_deny_all on public.employee_auth_events;
drop table if exists public.employee_auth_events;

drop policy if exists employee_credentials_deny_all on public.employee_credentials;
drop table if exists public.employee_credentials;

commit;

-- ============================================================================
-- Rollback for 0010_employee_self_service.sql
-- Safe to run when tearing down the employee portal schema.
-- ============================================================================

begin;

drop policy if exists pay_run_lines_select_own on public.pay_run_lines;
drop policy if exists employees_select_own on public.employees;
drop policy if exists change_requests_no_delete on public.employee_change_requests;
drop policy if exists change_requests_no_update on public.employee_change_requests;
drop policy if exists change_requests_insert_own on public.employee_change_requests;
drop policy if exists change_requests_select on public.employee_change_requests;
drop policy if exists employee_otps_deny_all on public.employee_otps;

drop function if exists public.my_employee_id();

drop table if exists public.employee_change_requests;
drop table if exists public.employee_otps;

drop index if exists uq_employees_company_phone_e164;
drop index if exists idx_employees_user_id;
drop index if exists idx_employees_phone_e164;

alter table public.employees drop column if exists user_id;
alter table public.employees drop column if exists phone_e164;
alter table public.employees drop column if exists address;

commit;

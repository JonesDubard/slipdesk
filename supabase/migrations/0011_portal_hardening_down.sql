-- ============================================================================
-- Rollback for 0011_portal_hardening.sql
-- ============================================================================

begin;

drop policy if exists pay_run_lines_select_own on public.pay_run_lines;
drop policy if exists pay_run_lines_select_staff on public.pay_run_lines;
drop policy if exists employees_update_deny_portal on public.employees;
drop policy if exists employees_select_own on public.employees;
drop policy if exists employees_select_staff on public.employees;

-- Restore v0.1.0 change-request select (null-employee heuristic)
drop policy if exists change_requests_select on public.employee_change_requests;
create policy change_requests_select on public.employee_change_requests
  for select using (
    company_id = public.my_company_id()
    and (
      employee_id = public.my_employee_id()
      or public.my_employee_id() is null
    )
  );

-- Restore simpler self-only policies from 0010
drop policy if exists employees_select_own on public.employees;
create policy employees_select_own on public.employees
  for select using (user_id = auth.uid());

drop policy if exists pay_run_lines_select_own on public.pay_run_lines;
create policy pay_run_lines_select_own on public.pay_run_lines
  for select using (employee_id = public.my_employee_id());

drop policy if exists employee_otp_events_deny_all on public.employee_otp_events;
drop table if exists public.employee_otp_events;

alter table public.employee_otps drop column if exists locked_until;

drop function if exists public.is_company_staff();
drop function if exists public.is_employee_portal_user();

drop index if exists idx_employees_portal_enabled;
alter table public.employees drop column if exists portal_enabled;

commit;

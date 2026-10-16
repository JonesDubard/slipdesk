-- Scope HR SELECT policies to the caller's company.
-- Does not edit 0014 or 0015. Does not change write policies, payroll math,
-- company rows, or my_company_id().
-- Rollback, not applied by the migration runner: supabase/rollback/0025_tenant_scope_hr_select_policies_down.sql
--
-- is_company_staff() is true for any company the user owns, so staff access
-- also requires company_id = my_company_id(). Employee access stays on
-- my_employee_id(), or that employee's company for leave policies.

begin;

drop policy if exists leave_requests_select on public.leave_requests;
create policy leave_requests_select on public.leave_requests
  for select using (
    employee_id = public.my_employee_id()
    or (
      public.is_company_staff()
      and company_id = public.my_company_id()
    )
  );

drop policy if exists leave_events_select on public.leave_approval_events;
create policy leave_events_select on public.leave_approval_events
  for select using (
    (
      public.is_company_staff()
      and company_id = public.my_company_id()
    )
    or exists (
      select 1
      from public.leave_requests lr
      where lr.id = leave_request_id
        and lr.employee_id = public.my_employee_id()
    )
  );

drop policy if exists attendance_select on public.attendance_records;
create policy attendance_select on public.attendance_records
  for select using (
    employee_id = public.my_employee_id()
    or (
      public.is_company_staff()
      and company_id = public.my_company_id()
    )
  );

drop policy if exists ot_select on public.overtime_records;
create policy ot_select on public.overtime_records
  for select using (
    employee_id = public.my_employee_id()
    or (
      public.is_company_staff()
      and company_id = public.my_company_id()
    )
  );

drop policy if exists leave_policies_select on public.leave_policies;
create policy leave_policies_select on public.leave_policies
  for select using (
    (
      public.is_company_staff()
      and company_id = public.my_company_id()
    )
    or company_id = (
      select e.company_id
      from public.employees e
      where e.id = public.my_employee_id()
    )
  );

drop policy if exists leave_balances_select on public.leave_balances;
create policy leave_balances_select on public.leave_balances
  for select using (
    employee_id = public.my_employee_id()
    or (
      public.is_company_staff()
      and company_id = public.my_company_id()
    )
  );

drop policy if exists leave_ledger_select on public.leave_balance_ledger;
create policy leave_ledger_select on public.leave_balance_ledger
  for select using (
    employee_id = public.my_employee_id()
    or (
      public.is_company_staff()
      and company_id = public.my_company_id()
    )
  );

drop policy if exists weekly_ot_select on public.weekly_overtime_records;
create policy weekly_ot_select on public.weekly_overtime_records
  for select using (
    employee_id = public.my_employee_id()
    or (
      public.is_company_staff()
      and company_id = public.my_company_id()
    )
  );

drop policy if exists att_config_select on public.company_attendance_config;
create policy att_config_select on public.company_attendance_config
  for select using (
    public.is_company_staff()
    and company_id = public.my_company_id()
  );

drop policy if exists reminder_log_select on public.attendance_reminder_log;
create policy reminder_log_select on public.attendance_reminder_log
  for select using (
    public.is_company_staff()
    and company_id = public.my_company_id()
  );

drop policy if exists scheduler_runs_select on public.attendance_scheduler_runs;
create policy scheduler_runs_select on public.attendance_scheduler_runs
  for select using (
    public.is_company_staff()
    and company_id = public.my_company_id()
  );

drop policy if exists payroll_val_select on public.payroll_validation_logs;
create policy payroll_val_select on public.payroll_validation_logs
  for select using (
    public.is_company_staff()
    and company_id = public.my_company_id()
  );

drop policy if exists notif_prefs_select_own on public.notification_preferences;
create policy notif_prefs_select_own on public.notification_preferences
  for select using (
    employee_id = public.my_employee_id()
    or (
      public.is_company_staff()
      and company_id = public.my_company_id()
    )
  );

commit;

-- Rollback for 0015_leave_attendance_hardening.sql

begin;

alter table public.notification_preferences
  drop constraint if exists notification_preferences_event_type_check;
alter table public.notification_preferences
  add constraint notification_preferences_event_type_check
  check (event_type in (
    'payslip_ready', 'password_reset', 'password_changed', 'welcome',
    'leave_submitted', 'leave_approved', 'leave_rejected', 'leave_info_requested',
    'attendance_missing_clockout', 'attendance_corrected'
  ));

drop policy if exists payroll_val_no_client_write on public.payroll_validation_logs;
drop policy if exists payroll_val_select on public.payroll_validation_logs;
drop table if exists public.payroll_validation_logs;

drop policy if exists scheduler_runs_no_client_write on public.attendance_scheduler_runs;
drop policy if exists scheduler_runs_select on public.attendance_scheduler_runs;
drop table if exists public.attendance_scheduler_runs;

drop policy if exists reminder_log_no_client_write on public.attendance_reminder_log;
drop policy if exists reminder_log_select on public.attendance_reminder_log;
drop table if exists public.attendance_reminder_log;

drop policy if exists weekly_ot_no_client_write on public.weekly_overtime_records;
drop policy if exists weekly_ot_select on public.weekly_overtime_records;
drop table if exists public.weekly_overtime_records;

alter table public.overtime_records drop column if exists daily_ot_hours;
alter table public.overtime_records drop column if exists weekly_ot_extra;
alter table public.overtime_records drop column if exists iso_week;
alter table public.overtime_records drop column if exists ot_mode;

drop policy if exists att_config_no_client_write on public.company_attendance_config;
drop policy if exists att_config_select on public.company_attendance_config;
drop table if exists public.company_attendance_config;

drop policy if exists leave_ledger_no_client_write on public.leave_balance_ledger;
drop policy if exists leave_ledger_select on public.leave_balance_ledger;
drop table if exists public.leave_balance_ledger;

drop policy if exists leave_balances_no_client_write on public.leave_balances;
drop policy if exists leave_balances_select on public.leave_balances;
drop table if exists public.leave_balances;

drop policy if exists leave_policies_no_client_write on public.leave_policies;
drop policy if exists leave_policies_select on public.leave_policies;
drop table if exists public.leave_policies;

alter table public.leave_requests drop constraint if exists leave_requests_leave_type_check;
alter table public.leave_requests
  add constraint leave_requests_leave_type_check
  check (leave_type in (
    'annual', 'sick', 'unpaid', 'compassionate', 'other'
  ));

commit;

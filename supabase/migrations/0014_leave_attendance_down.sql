-- Rollback for 0014_leave_attendance.sql

begin;

alter table public.notification_logs drop column if exists workflow_ref;

alter table public.notification_preferences
  drop constraint if exists notification_preferences_event_type_check;
alter table public.notification_preferences
  add constraint notification_preferences_event_type_check
  check (event_type in (
    'payslip_ready', 'password_reset', 'password_changed', 'welcome'
  ));

drop policy if exists ot_no_client_update on public.overtime_records;
drop policy if exists ot_no_client_write on public.overtime_records;
drop policy if exists ot_select on public.overtime_records;
drop table if exists public.overtime_records;

drop policy if exists attendance_no_client_update on public.attendance_records;
drop policy if exists attendance_no_client_write on public.attendance_records;
drop policy if exists attendance_select on public.attendance_records;
drop table if exists public.attendance_records;

drop policy if exists leave_events_no_client_write on public.leave_approval_events;
drop policy if exists leave_events_select on public.leave_approval_events;
drop table if exists public.leave_approval_events;

drop policy if exists leave_requests_no_client_update on public.leave_requests;
drop policy if exists leave_requests_no_client_write on public.leave_requests;
drop policy if exists leave_requests_select on public.leave_requests;
drop table if exists public.leave_requests;

commit;

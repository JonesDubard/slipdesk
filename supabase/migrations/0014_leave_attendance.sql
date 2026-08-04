-- ============================================================================
-- Slipdesk — Leave Management + Time & Attendance (0014)  [v0.2.0]
-- ----------------------------------------------------------------------------
-- Additive + idempotent. No departments/branches/onboarding/documents.
-- Rollback: 0014_leave_attendance_down.sql
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. LEAVE REQUESTS
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  employee_id     uuid not null references public.employees(id) on delete cascade,
  leave_type      text not null
                    check (leave_type in (
                      'annual', 'sick', 'unpaid', 'compassionate', 'other'
                    )),
  start_date      date not null,
  end_date        date not null,
  days            numeric(6,2) not null check (days > 0),
  reason          text,
  is_unpaid       boolean not null default false,
  status          text not null default 'pending'
                    check (status in (
                      'pending', 'info_requested', 'approved', 'rejected', 'cancelled'
                    )),
  hr_note         text,
  pay_period_label text,
  payroll_applied boolean not null default false,
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists idx_leave_requests_company_status
  on public.leave_requests(company_id, status, created_at desc);
create index if not exists idx_leave_requests_employee
  on public.leave_requests(employee_id, created_at desc);
create index if not exists idx_leave_requests_dates
  on public.leave_requests(company_id, start_date, end_date);

alter table public.leave_requests enable row level security;
drop policy if exists leave_requests_select on public.leave_requests;
create policy leave_requests_select on public.leave_requests
  for select using (
    employee_id = public.my_employee_id()
    or public.is_company_staff()
  );
drop policy if exists leave_requests_no_client_write on public.leave_requests;
create policy leave_requests_no_client_write on public.leave_requests
  for insert with check (false);
drop policy if exists leave_requests_no_client_update on public.leave_requests;
create policy leave_requests_no_client_update on public.leave_requests
  for update using (false);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. LEAVE APPROVAL HISTORY
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.leave_approval_events (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  leave_request_id uuid not null references public.leave_requests(id) on delete cascade,
  actor_id        uuid,
  action          text not null
                    check (action in (
                      'submitted', 'approved', 'rejected', 'info_requested', 'cancelled', 'info_provided'
                    )),
  note            text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_leave_events_request
  on public.leave_approval_events(leave_request_id, created_at);

alter table public.leave_approval_events enable row level security;
drop policy if exists leave_events_select on public.leave_approval_events;
create policy leave_events_select on public.leave_approval_events
  for select using (
    exists (
      select 1 from public.leave_requests lr
      where lr.id = leave_request_id
        and (lr.employee_id = public.my_employee_id() or public.is_company_staff())
    )
  );
drop policy if exists leave_events_no_client_write on public.leave_approval_events;
create policy leave_events_no_client_write on public.leave_approval_events
  for insert with check (false);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ATTENDANCE RECORDS
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.attendance_records (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  employee_id     uuid not null references public.employees(id) on delete cascade,
  work_date       date not null,
  clock_in_at     timestamptz,
  clock_out_at    timestamptz,
  hours_worked    numeric(6,2) not null default 0,
  source          text not null default 'manual'
                    check (source in ('clock', 'manual', 'correction')),
  status          text not null default 'open'
                    check (status in ('open', 'complete', 'corrected', 'missing_clock_out')),
  notes           text,
  corrected_by    uuid,
  pay_period_label text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (employee_id, work_date, source)
);
-- Allow multiple sources per day is awkward with unique — use unique (employee_id, work_date) for one row/day
alter table public.attendance_records drop constraint if exists attendance_records_employee_id_work_date_source_key;
do $$ begin
  alter table public.attendance_records
    add constraint attendance_records_employee_work_date_unique unique (employee_id, work_date);
exception when duplicate_object then null;
end $$;

create index if not exists idx_attendance_company_date
  on public.attendance_records(company_id, work_date desc);
create index if not exists idx_attendance_employee_date
  on public.attendance_records(employee_id, work_date desc);
create index if not exists idx_attendance_missing
  on public.attendance_records(company_id, status)
  where status = 'missing_clock_out';

alter table public.attendance_records enable row level security;
drop policy if exists attendance_select on public.attendance_records;
create policy attendance_select on public.attendance_records
  for select using (
    employee_id = public.my_employee_id()
    or public.is_company_staff()
  );
drop policy if exists attendance_no_client_write on public.attendance_records;
create policy attendance_no_client_write on public.attendance_records
  for insert with check (false);
drop policy if exists attendance_no_client_update on public.attendance_records;
create policy attendance_no_client_update on public.attendance_records
  for update using (false);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. OVERTIME RECORDS (derived from attendance; feeds payroll pending OT)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.overtime_records (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  employee_id     uuid not null references public.employees(id) on delete cascade,
  attendance_id   uuid references public.attendance_records(id) on delete set null,
  work_date       date not null,
  regular_hours   numeric(6,2) not null default 0,
  overtime_hours  numeric(6,2) not null default 0,
  daily_threshold numeric(6,2) not null default 8,
  ot_multiplier   numeric(4,2) not null default 1.5,
  pay_period_label text,
  applied_to_payroll boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index if not exists idx_ot_company_period
  on public.overtime_records(company_id, pay_period_label, applied_to_payroll);
create index if not exists idx_ot_employee
  on public.overtime_records(employee_id, work_date desc);

alter table public.overtime_records enable row level security;
drop policy if exists ot_select on public.overtime_records;
create policy ot_select on public.overtime_records
  for select using (
    employee_id = public.my_employee_id()
    or public.is_company_staff()
  );
drop policy if exists ot_no_client_write on public.overtime_records;
create policy ot_no_client_write on public.overtime_records
  for insert with check (false);
drop policy if exists ot_no_client_update on public.overtime_records;
create policy ot_no_client_update on public.overtime_records
  for update using (false);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. NOTIFICATION PREFERENCE EVENT TYPES (extend 0013 check)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.notification_preferences
  drop constraint if exists notification_preferences_event_type_check;
alter table public.notification_preferences
  add constraint notification_preferences_event_type_check
  check (event_type in (
    'payslip_ready', 'password_reset', 'password_changed', 'welcome',
    'leave_submitted', 'leave_approved', 'leave_rejected', 'leave_info_requested',
    'attendance_missing_clockout', 'attendance_corrected'
  ));

-- Optional reference on notification_logs for workflow correlation
alter table public.notification_logs
  add column if not exists workflow_ref text;
comment on column public.notification_logs.workflow_ref is
  'Optional leave_request_id / attendance_id for correlation; never secrets';

commit;

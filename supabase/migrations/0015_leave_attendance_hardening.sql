-- ============================================================================
-- Slipdesk — Leave & Attendance Hardening (0015)  [v0.2.1]
-- ----------------------------------------------------------------------------
-- Stabilization only. Rollback: 0015_leave_attendance_hardening_down.sql
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. EXTEND LEAVE TYPES (maternity)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.leave_requests drop constraint if exists leave_requests_leave_type_check;
alter table public.leave_requests
  add constraint leave_requests_leave_type_check
  check (leave_type in (
    'annual', 'sick', 'unpaid', 'compassionate', 'maternity', 'other'
  ));

-- ────────────────────────────────────────────────────────────────────────────
-- 2. LEAVE POLICIES (configurable entitlements — no Liberian defaults assumed)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.leave_policies (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  leave_type        text not null
                      check (leave_type in (
                        'annual', 'sick', 'unpaid', 'compassionate', 'maternity', 'other'
                      )),
  -- NULL = unlimited / not tracked; HR sets values later
  annual_allocation numeric(8,2),
  tracks_balance    boolean not null default true,
  low_balance_threshold numeric(8,2) not null default 2,
  allow_negative    boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (company_id, leave_type)
);

alter table public.leave_policies enable row level security;
drop policy if exists leave_policies_select on public.leave_policies;
create policy leave_policies_select on public.leave_policies
  for select using (public.is_company_staff() or public.my_employee_id() is not null);
drop policy if exists leave_policies_no_client_write on public.leave_policies;
create policy leave_policies_no_client_write on public.leave_policies
  for all using (false) with check (false);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. LEAVE BALANCES
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.leave_balances (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  leave_type   text not null
                 check (leave_type in (
                   'annual', 'sick', 'unpaid', 'compassionate', 'maternity', 'other'
                 )),
  year         int not null,
  allocated    numeric(8,2) not null default 0,
  used         numeric(8,2) not null default 0,
  pending      numeric(8,2) not null default 0,
  -- remaining = allocated - used - pending (maintained on write)
  remaining    numeric(8,2) not null default 0,
  updated_at   timestamptz not null default now(),
  unique (employee_id, leave_type, year)
);
create index if not exists idx_leave_balances_company
  on public.leave_balances(company_id, year);

alter table public.leave_balances enable row level security;
drop policy if exists leave_balances_select on public.leave_balances;
create policy leave_balances_select on public.leave_balances
  for select using (
    employee_id = public.my_employee_id()
    or public.is_company_staff()
  );
drop policy if exists leave_balances_no_client_write on public.leave_balances;
create policy leave_balances_no_client_write on public.leave_balances
  for all using (false) with check (false);

create table if not exists public.leave_balance_ledger (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  employee_id     uuid not null references public.employees(id) on delete cascade,
  leave_type      text not null,
  year            int not null,
  delta_allocated numeric(8,2) not null default 0,
  delta_used      numeric(8,2) not null default 0,
  delta_pending   numeric(8,2) not null default 0,
  reason          text not null,
  leave_request_id uuid references public.leave_requests(id) on delete set null,
  actor_id        uuid,
  created_at      timestamptz not null default now()
);
create index if not exists idx_leave_balance_ledger_emp
  on public.leave_balance_ledger(employee_id, created_at desc);

alter table public.leave_balance_ledger enable row level security;
drop policy if exists leave_ledger_select on public.leave_balance_ledger;
create policy leave_ledger_select on public.leave_balance_ledger
  for select using (
    employee_id = public.my_employee_id()
    or public.is_company_staff()
  );
drop policy if exists leave_ledger_no_client_write on public.leave_balance_ledger;
create policy leave_ledger_no_client_write on public.leave_balance_ledger
  for insert with check (false);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. COMPANY ATTENDANCE / LABOR CONFIG
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.company_attendance_config (
  company_id                uuid primary key references public.companies(id) on delete cascade,
  timezone                  text not null default 'Africa/Monrovia',
  daily_ot_enabled          boolean not null default true,
  weekly_ot_enabled         boolean not null default false,
  daily_hours_threshold     numeric(6,2) not null default 8,
  weekly_hours_threshold    numeric(6,2) not null default 48,
  ot_multiplier             numeric(4,2) not null default 1.5,
  max_shift_hours           numeric(6,2) not null default 12,
  grace_period_minutes      int not null default 15,
  missing_clockout_cutoff_hour int not null default 2, -- local hour after which prior day open = missing
  scheduler_enabled         boolean not null default true,
  scheduler_hour_local      int not null default 2 check (scheduler_hour_local between 0 and 23),
  leave_approval_timeout_days int not null default 7,
  low_balance_notify        boolean not null default true,
  updated_at                timestamptz not null default now()
);

alter table public.company_attendance_config enable row level security;
drop policy if exists att_config_select on public.company_attendance_config;
create policy att_config_select on public.company_attendance_config
  for select using (public.is_company_staff());
drop policy if exists att_config_no_client_write on public.company_attendance_config;
create policy att_config_no_client_write on public.company_attendance_config
  for all using (false) with check (false);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. WEEKLY OVERTIME TRACKING
-- ────────────────────────────────────────────────────────────────────────────
alter table public.overtime_records
  add column if not exists daily_ot_hours numeric(6,2) not null default 0;
alter table public.overtime_records
  add column if not exists weekly_ot_extra numeric(6,2) not null default 0;
alter table public.overtime_records
  add column if not exists iso_week text;
alter table public.overtime_records
  add column if not exists ot_mode text;

create table if not exists public.weekly_overtime_records (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  employee_id       uuid not null references public.employees(id) on delete cascade,
  iso_week          text not null, -- e.g. 2026-W32
  week_start        date not null,
  week_end          date not null,
  total_hours       numeric(8,2) not null default 0,
  daily_ot_sum      numeric(8,2) not null default 0,
  weekly_ot_raw     numeric(8,2) not null default 0,
  payable_ot_hours  numeric(8,2) not null default 0,
  weekly_threshold  numeric(6,2) not null default 48,
  ot_mode           text not null default 'daily_only',
  applied_to_payroll boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (employee_id, iso_week)
);

alter table public.weekly_overtime_records enable row level security;
drop policy if exists weekly_ot_select on public.weekly_overtime_records;
create policy weekly_ot_select on public.weekly_overtime_records
  for select using (
    employee_id = public.my_employee_id()
    or public.is_company_staff()
  );
drop policy if exists weekly_ot_no_client_write on public.weekly_overtime_records;
create policy weekly_ot_no_client_write on public.weekly_overtime_records
  for all using (false) with check (false);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. ATTENDANCE REMINDER DEDUPE + SCHEDULER RUN LOG
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.attendance_reminder_log (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  employee_id     uuid not null references public.employees(id) on delete cascade,
  attendance_id   uuid references public.attendance_records(id) on delete cascade,
  work_date       date not null,
  reminder_key    text not null, -- company|employee|work_date|missing_clockout
  created_at      timestamptz not null default now(),
  unique (reminder_key)
);

alter table public.attendance_reminder_log enable row level security;
drop policy if exists reminder_log_select on public.attendance_reminder_log;
create policy reminder_log_select on public.attendance_reminder_log
  for select using (public.is_company_staff());
drop policy if exists reminder_log_no_client_write on public.attendance_reminder_log;
create policy reminder_log_no_client_write on public.attendance_reminder_log
  for insert with check (false);

create table if not exists public.attendance_scheduler_runs (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  ran_at        timestamptz not null default now(),
  local_date    date not null,
  local_hour    int not null,
  flagged_count int not null default 0,
  skipped_leave int not null default 0,
  meta          jsonb not null default '{}'::jsonb
);

alter table public.attendance_scheduler_runs enable row level security;
drop policy if exists scheduler_runs_select on public.attendance_scheduler_runs;
create policy scheduler_runs_select on public.attendance_scheduler_runs
  for select using (public.is_company_staff());
drop policy if exists scheduler_runs_no_client_write on public.attendance_scheduler_runs;
create policy scheduler_runs_no_client_write on public.attendance_scheduler_runs
  for insert with check (false);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. PAYROLL VALIDATION LOGS
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.payroll_validation_logs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  period_label    text,
  period_start    date,
  period_end      date,
  severity        text not null check (severity in ('warning', 'error', 'info')),
  code            text not null,
  message         text not null,
  employee_id     uuid references public.employees(id) on delete set null,
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  actor_id        uuid
);
create index if not exists idx_payroll_validation_company
  on public.payroll_validation_logs(company_id, created_at desc);

alter table public.payroll_validation_logs enable row level security;
drop policy if exists payroll_val_select on public.payroll_validation_logs;
create policy payroll_val_select on public.payroll_validation_logs
  for select using (public.is_company_staff());
drop policy if exists payroll_val_no_client_write on public.payroll_validation_logs;
create policy payroll_val_no_client_write on public.payroll_validation_logs
  for insert with check (false);

-- ────────────────────────────────────────────────────────────────────────────
-- 8. NOTIFICATION EVENT TYPES (extend)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.notification_preferences
  drop constraint if exists notification_preferences_event_type_check;
alter table public.notification_preferences
  add constraint notification_preferences_event_type_check
  check (event_type in (
    'payslip_ready', 'password_reset', 'password_changed', 'welcome',
    'leave_submitted', 'leave_approved', 'leave_rejected', 'leave_info_requested',
    'attendance_missing_clockout', 'attendance_corrected',
    'leave_balance_low', 'leave_balance_exhausted',
    'attendance_auto_missing_clockout', 'payroll_validation_warning'
  ));

commit;

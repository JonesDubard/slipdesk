-- ============================================================================
-- Slipdesk — Employee Self-Service Portal (0010)  [Release v0.1.0]
-- ----------------------------------------------------------------------------
-- Additive + idempotent. Adds:
--   • employees.user_id / phone_e164 / address — portal identity link
--   • employee_otps — phone OTP challenge store
--   • employee_change_requests — HR approval queue (never auto-applies)
--   • RLS helpers for self-only employee data access
--
-- Apply:  supabase db push  |  Dashboard SQL Editor
-- Rollback: see 0010_employee_self_service_down.sql
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. EMPLOYEE PORTAL IDENTITY
-- ────────────────────────────────────────────────────────────────────────────
alter table public.employees add column if not exists user_id    uuid unique;
alter table public.employees add column if not exists phone_e164 text;
alter table public.employees add column if not exists address    text not null default '';

comment on column public.employees.user_id    is 'Linked auth.users id for employee portal login';
comment on column public.employees.phone_e164 is 'Normalized E.164 phone used for OTP auth';
comment on column public.employees.address    is 'Residential / mailing address (change-requestable)';

-- Unique portal phone per company (allows same number across companies)
create unique index if not exists uq_employees_company_phone_e164
  on public.employees(company_id, phone_e164)
  where phone_e164 is not null and phone_e164 <> '';

create index if not exists idx_employees_user_id on public.employees(user_id)
  where user_id is not null;

create index if not exists idx_employees_phone_e164 on public.employees(phone_e164)
  where phone_e164 is not null;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. OTP CHALLENGES
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.employee_otps (
  id           uuid primary key default gen_random_uuid(),
  phone_e164   text not null,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  code_hash    text not null,
  attempts     int  not null default 0,
  max_attempts int  not null default 5,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_employee_otps_phone
  on public.employee_otps(phone_e164, created_at desc);
create index if not exists idx_employee_otps_employee
  on public.employee_otps(employee_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. CHANGE-REQUEST QUEUE (HR must approve — never auto-applies)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.employee_change_requests (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  employee_id      uuid not null references public.employees(id) on delete cascade,
  requested_by     uuid,  -- auth.users id of the employee
  field_type       text not null
                     check (field_type in ('address', 'bank_details', 'phone')),
  old_value        jsonb not null default '{}'::jsonb,
  new_value        jsonb not null,
  status           text not null default 'pending'
                     check (status in ('pending', 'approved', 'rejected')),
  reviewed_by      uuid,
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_change_requests_company_status
  on public.employee_change_requests(company_id, status, created_at desc);
create index if not exists idx_change_requests_employee
  on public.employee_change_requests(employee_id, created_at desc);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. SELF-ONLY HELPERS
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.my_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.employees where user_id = auth.uid() limit 1;
$$;

grant execute on function public.my_employee_id() to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RLS — employee portal tables
-- ────────────────────────────────────────────────────────────────────────────
alter table public.employee_otps enable row level security;
alter table public.employee_change_requests enable row level security;

-- OTP rows are only managed via service role / server APIs (no direct client access)
drop policy if exists employee_otps_deny_all on public.employee_otps;
create policy employee_otps_deny_all on public.employee_otps
  for all using (false) with check (false);

-- Employees can read/create their own change requests; HR/company members can read all for company
drop policy if exists change_requests_select on public.employee_change_requests;
create policy change_requests_select on public.employee_change_requests
  for select using (
    company_id = public.my_company_id()
    and (
      employee_id = public.my_employee_id()
      or public.my_employee_id() is null  -- staff (no linked employee row) see company queue
    )
  );

drop policy if exists change_requests_insert_own on public.employee_change_requests;
create policy change_requests_insert_own on public.employee_change_requests
  for insert with check (
    company_id = public.my_company_id()
    and employee_id = public.my_employee_id()
    and status = 'pending'
  );

-- Updates (approve/reject) go through service-role APIs so policies stay tight
drop policy if exists change_requests_no_update on public.employee_change_requests;
create policy change_requests_no_update on public.employee_change_requests
  for update using (false);

drop policy if exists change_requests_no_delete on public.employee_change_requests;
create policy change_requests_no_delete on public.employee_change_requests
  for delete using (false);

-- Self-only SELECT on own employee row (additive — existing company policies remain)
drop policy if exists employees_select_own on public.employees;
create policy employees_select_own on public.employees
  for select using (user_id = auth.uid());

-- Self-only SELECT on own pay_run_lines
drop policy if exists pay_run_lines_select_own on public.pay_run_lines;
create policy pay_run_lines_select_own on public.pay_run_lines
  for select using (
    employee_id = public.my_employee_id()
  );

commit;

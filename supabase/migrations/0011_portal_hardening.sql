-- ============================================================================
-- Slipdesk — Portal hardening (0011)
-- ----------------------------------------------------------------------------
-- Addresses v0.1.0 release risks:
--   • employees.portal_enabled — explicit HR opt-in for portal OTP login
--   • OTP rate-limit / lockout columns + telemetry events
--   • is_company_staff() / is_employee_portal_user() for correct RLS composition
--   • Staff vs self-only SELECT policies on employees + pay_run_lines
--
-- Rollback: 0011_portal_hardening_down.sql
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. EXPLICIT PORTAL OPT-IN
-- ────────────────────────────────────────────────────────────────────────────
alter table public.employees
  add column if not exists portal_enabled boolean not null default false;

comment on column public.employees.portal_enabled is
  'HR must enable before employee can request OTP / use the self-service portal';

create index if not exists idx_employees_portal_enabled
  on public.employees(company_id, portal_enabled)
  where portal_enabled = true;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. OTP LOCKOUT + TELEMETRY
-- ────────────────────────────────────────────────────────────────────────────
alter table public.employee_otps
  add column if not exists locked_until timestamptz;

create table if not exists public.employee_otp_events (
  id           uuid primary key default gen_random_uuid(),
  phone_e164   text not null,
  employee_id  uuid references public.employees(id) on delete set null,
  company_id   uuid references public.companies(id) on delete set null,
  event_type   text not null
                 check (event_type in (
                   'request', 'request_denied_rate', 'request_denied_cooldown',
                   'request_denied_lockout', 'request_denied_disabled',
                   'verify_ok', 'verify_fail', 'verify_lockout'
                 )),
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_otp_events_phone_created
  on public.employee_otp_events(phone_e164, created_at desc);
create index if not exists idx_otp_events_type_created
  on public.employee_otp_events(event_type, created_at desc);

alter table public.employee_otp_events enable row level security;
drop policy if exists employee_otp_events_deny_all on public.employee_otp_events;
create policy employee_otp_events_deny_all on public.employee_otp_events
  for all using (false) with check (false);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ROLE HELPERS — staff vs portal employee
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.is_employee_portal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.employees e
    where e.user_id = auth.uid()
  );
$$;

create or replace function public.is_company_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.companies c where c.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.company_members m
      where m.user_id = auth.uid()
        and m.status = 'active'
        and m.role <> 'employee'
    )
    or (
      -- Legacy profiles.role admin/owner without company_members row
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('admin', 'owner', 'super_admin', 'company_owner')
      )
      and not public.is_employee_portal_user()
    );
$$;

grant execute on function public.is_employee_portal_user() to authenticated;
grant execute on function public.is_company_staff() to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. CHANGE REQUESTS — staff review, not "null employee id"
-- ────────────────────────────────────────────────────────────────────────────
drop policy if exists change_requests_select on public.employee_change_requests;
create policy change_requests_select on public.employee_change_requests
  for select using (
    company_id = public.my_company_id()
    and (
      employee_id = public.my_employee_id()
      or public.is_company_staff()
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 5. EMPLOYEES + PAY_RUN_LINES — compose staff company-scope with self-only
--    Postgres ORs permissive policies. Portal users must NOT inherit a broad
--    company SELECT. Drop common broad policy names, then add staff + own.
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare
  pol text;
begin
  foreach pol in array array[
    'employees_select',
    'employees_select_policy',
    'Employees select',
    'Enable read access for company members'
  ]
  loop
    begin
      execute format('drop policy if exists %I on public.employees', pol);
    exception when others then null;
    end;
  end loop;

  foreach pol in array array[
    'pay_run_lines_select',
    'pay_run_lines_select_policy',
    'Pay run lines select',
    'Enable read access for company members'
  ]
  loop
    begin
      execute format('drop policy if exists %I on public.pay_run_lines', pol);
    exception when others then null;
    end;
  end loop;
end $$;

drop policy if exists employees_select_staff on public.employees;
create policy employees_select_staff on public.employees
  for select using (
    company_id = public.my_company_id()
    and public.is_company_staff()
  );

drop policy if exists employees_select_own on public.employees;
create policy employees_select_own on public.employees
  for select using (user_id = auth.uid());

-- Portal employees must not update/delete via client; staff keep company update if present
drop policy if exists employees_update_deny_portal on public.employees;
create policy employees_update_deny_portal on public.employees
  for update using (
    public.is_company_staff()
    and company_id = public.my_company_id()
  )
  with check (
    public.is_company_staff()
    and company_id = public.my_company_id()
  );

drop policy if exists pay_run_lines_select_staff on public.pay_run_lines;
create policy pay_run_lines_select_staff on public.pay_run_lines
  for select using (
    company_id = public.my_company_id()
    and public.is_company_staff()
  );

drop policy if exists pay_run_lines_select_own on public.pay_run_lines;
create policy pay_run_lines_select_own on public.pay_run_lines
  for select using (employee_id = public.my_employee_id());

commit;

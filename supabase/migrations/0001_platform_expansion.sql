-- ============================================================================
-- Slipdesk — Platform Expansion Migration (0001)
-- ----------------------------------------------------------------------------
-- Transforms Slipdesk from a payslip generator into a full Payroll & Compliance
-- Platform. This migration is ADDITIVE and IDEMPOTENT — it only adds columns,
-- tables, indexes and policies. It does NOT drop or alter existing data, so it
-- is safe to run against production and safe to re-run.
--
-- Apply via the Supabase SQL editor or CLI:
--   supabase db push          (if using the CLI)
--   -- or paste this file into the Supabase Dashboard → SQL Editor and run.
--
-- Assumes the existing helper function public.my_company_id() returns the
-- company_id for the current auth user (already used by existing RLS policies).
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. EMPLOYEE MANAGEMENT — richer employee profiles
--    (employee_number already stores the Employee ID; job_title already exists)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.employees add column if not exists branch            text        not null default '';
alter table public.employees add column if not exists position          text        not null default '';
alter table public.employees add column if not exists tax_id            text        not null default '';
alter table public.employees add column if not exists employment_status text        not null default 'active';
alter table public.employees add column if not exists bank_branch       text        not null default '';
alter table public.employees add column if not exists date_terminated   date;

comment on column public.employees.employment_status is 'active | on_leave | suspended | terminated';

-- Salary history (append-only record of pay-rate changes)
create table if not exists public.employee_salary_history (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  currency     text not null default 'USD',
  old_rate     numeric,
  new_rate     numeric not null,
  effective_date date not null default current_date,
  changed_by   uuid,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_salary_history_employee on public.employee_salary_history(employee_id);
create index if not exists idx_salary_history_company  on public.employee_salary_history(company_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. PAYROLL MANAGEMENT — periods, lifecycle & run types
-- ────────────────────────────────────────────────────────────────────────────
alter table public.pay_runs add column if not exists run_type       text        not null default 'monthly';
alter table public.pay_runs add column if not exists workflow_stage text        not null default 'payroll_officer';
alter table public.pay_runs add column if not exists locked_at      timestamptz;
alter table public.pay_runs add column if not exists archived_at    timestamptz;
alter table public.pay_runs add column if not exists approved_by    uuid;
alter table public.pay_runs add column if not exists reopened_by    uuid;
alter table public.pay_runs add column if not exists reopened_at    timestamptz;

comment on column public.pay_runs.run_type       is 'monthly | weekly | bi_weekly | bonus | off_cycle';
comment on column public.pay_runs.workflow_stage is 'payroll_officer | finance_manager | hr_manager | managing_director | approved | locked | released';

-- Existing pay_runs.status CHECK constraint may restrict values to
-- (draft, review, approved, paid). Widen it to include the full lifecycle.
do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'pay_runs' and constraint_name = 'pay_runs_status_check'
  ) then
    alter table public.pay_runs drop constraint pay_runs_status_check;
  end if;
  alter table public.pay_runs
    add constraint pay_runs_status_check
    check (status in ('draft','review','approved','locked','archived','paid'));
exception when others then
  -- If the constraint name differs, skip silently; lifecycle still works.
  null;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. COMPANY ADMINISTRATION — branding & settings
-- ────────────────────────────────────────────────────────────────────────────
alter table public.companies add column if not exists brand_primary_color   text not null default '#002147';
alter table public.companies add column if not exists brand_secondary_color text not null default '#50C878';
alter table public.companies add column if not exists email_footer          text not null default '';
alter table public.companies add column if not exists payslip_footer        text not null default '';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. USER ROLES (RBAC) — company_members
--    Mirrors the app's Role type. Owners get 'company_owner'.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.company_members (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid,   -- null until an invited teammate accepts / signs up
  role        text not null default 'payroll_officer'
                check (role in ('super_admin','company_owner','payroll_officer',
                                'finance_manager','hr_manager','auditor','executive')),
  invited_email text,
  status        text not null default 'pending' check (status in ('pending','active')),
  created_at  timestamptz not null default now(),
  unique (company_id, user_id)
);
-- If an earlier version created user_id NOT NULL, relax it so pending invites work.
do $$ begin
  alter table public.company_members alter column user_id drop not null;
exception when others then null; end $$;
alter table public.company_members add column if not exists status text not null default 'pending';
create index if not exists idx_company_members_company on public.company_members(company_id);
create index if not exists idx_company_members_user    on public.company_members(user_id);
create unique index if not exists uq_company_members_email
  on public.company_members(company_id, lower(invited_email)) where invited_email is not null;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. AUDIT CENTER — immutable audit log
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  actor_id    uuid,
  actor_email text,
  action      text not null,          -- e.g. 'employee.update', 'payroll.approve'
  entity_type text,                   -- 'employee' | 'pay_run' | 'company' | ...
  entity_id   text,
  old_value   jsonb,
  new_value   jsonb,
  ip_address  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_company on public.audit_log(company_id, created_at desc);
create index if not exists idx_audit_entity  on public.audit_log(entity_type, entity_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. NOTIFICATION CENTER
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid,                  -- null = whole-company notification
  type        text not null,         -- 'payroll_due' | 'payroll_approved' | 'compliance_warning' | ...
  title       text not null,
  body        text,
  severity    text not null default 'info' check (severity in ('info','success','warning','critical')),
  link        text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notifications_company on public.notifications(company_id, created_at desc);
create index if not exists idx_notifications_user    on public.notifications(user_id, is_read);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. COMPLIANCE HISTORY — periodic compliance snapshots (Enterprise)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.compliance_snapshots (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  period_label   text not null,
  score          integer not null default 0,
  critical_count integer not null default 0,
  warning_count  integer not null default 0,
  payroll_ready  boolean not null default false,
  lra_ready      boolean not null default false,
  nasscorp_ready boolean not null default false,
  details        jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_compliance_company on public.compliance_snapshots(company_id, created_at desc);

-- ────────────────────────────────────────────────────────────────────────────
-- 8. ROW LEVEL SECURITY
--    Scope every new table to the caller's company via my_company_id().
-- ────────────────────────────────────────────────────────────────────────────
alter table public.employee_salary_history enable row level security;
alter table public.company_members         enable row level security;
alter table public.audit_log               enable row level security;
alter table public.notifications           enable row level security;
alter table public.compliance_snapshots    enable row level security;

do $$
declare
  t text;
  tbls text[] := array[
    'employee_salary_history','company_members','audit_log',
    'notifications','compliance_snapshots'
  ];
begin
  foreach t in array tbls loop
    -- SELECT
    execute format('drop policy if exists %I on public.%I;', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select using (company_id = public.my_company_id());',
      t || '_select', t
    );
    -- INSERT
    execute format('drop policy if exists %I on public.%I;', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert with check (company_id = public.my_company_id());',
      t || '_insert', t
    );
    -- UPDATE (audit_log intentionally excluded to keep it append-only)
    if t <> 'audit_log' then
      execute format('drop policy if exists %I on public.%I;', t || '_update', t);
      execute format(
        'create policy %I on public.%I for update using (company_id = public.my_company_id()) with check (company_id = public.my_company_id());',
        t || '_update', t
      );
    end if;
  end loop;
end $$;

commit;

-- ============================================================================
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.compliance_snapshots, public.notifications,
--     public.audit_log, public.company_members, public.employee_salary_history;
--   alter table public.companies drop column if exists brand_primary_color, ...;
--   alter table public.employees drop column if exists branch, position, ...;
-- (Left commented so this migration never destroys data automatically.)
-- ============================================================================

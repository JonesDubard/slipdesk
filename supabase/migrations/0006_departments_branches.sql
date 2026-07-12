-- ============================================================================
-- Slipdesk — Departments & Branches (0006)
-- Company-scoped org units for Professional+ department/branch management.
-- ============================================================================

begin;

create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.branches (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (company_id, name)
);

create index if not exists idx_departments_company on public.departments(company_id);
create index if not exists idx_branches_company on public.branches(company_id);

alter table public.departments enable row level security;
alter table public.branches enable row level security;

-- Allow the new Employee RBAC role on company_members.
do $$
begin
  alter table public.company_members drop constraint if exists company_members_role_check;
  alter table public.company_members
    add constraint company_members_role_check
    check (role in (
      'super_admin','company_owner','payroll_officer',
      'finance_manager','hr_manager','auditor','executive','employee'
    ));
exception when others then
  null;
end $$;

-- Members of the company can read; owners/managers write via service role APIs.
drop policy if exists departments_select on public.departments;
create policy departments_select on public.departments
  for select using (company_id = public.my_company_id());

drop policy if exists departments_write on public.departments;
create policy departments_write on public.departments
  for all using (company_id = public.my_company_id())
  with check (company_id = public.my_company_id());

drop policy if exists branches_select on public.branches;
create policy branches_select on public.branches
  for select using (company_id = public.my_company_id());

drop policy if exists branches_write on public.branches;
create policy branches_write on public.branches
  for all using (company_id = public.my_company_id())
  with check (company_id = public.my_company_id());

commit;

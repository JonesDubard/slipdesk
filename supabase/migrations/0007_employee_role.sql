-- Allow the Employee role family on company_members.
alter table public.company_members drop constraint if exists company_members_role_check;
alter table public.company_members
  add constraint company_members_role_check
  check (role in (
    'super_admin','company_owner','payroll_officer',
    'finance_manager','hr_manager','auditor','executive','employee'
  ));

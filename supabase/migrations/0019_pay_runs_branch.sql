-- Branch-scoped payroll runs (additive). NULL branch_id = org-wide (legacy behavior).
begin;

alter table public.pay_runs
  add column if not exists branch_id uuid references public.branches(id) on delete set null;

comment on column public.pay_runs.branch_id is
  'NULL = organization-wide payroll run (all branches). Non-null = branch-scoped run.';

create index if not exists idx_pay_runs_company_branch_status
  on public.pay_runs (company_id, branch_id, status, updated_at desc);

commit;

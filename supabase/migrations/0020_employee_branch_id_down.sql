begin;

drop trigger if exists trg_employees_branch_same_company on public.employees;
drop function if exists public.employees_branch_same_company();

drop index if exists public.idx_employees_company_branch_id;

alter table public.employees drop column if exists branch_id;

alter table public.branches drop constraint if exists branches_id_company_id_key;

commit;

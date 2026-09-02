begin;
drop index if exists public.idx_pay_runs_company_branch_status;
alter table public.pay_runs drop column if exists branch_id;
commit;

begin;

drop index if exists public.idx_pay_runs_company_status;

alter table public.pay_run_lines drop column if exists deduction_items;
alter table public.pay_run_lines drop column if exists deductions;
alter table public.pay_runs drop column if exists draft_payload;

commit;

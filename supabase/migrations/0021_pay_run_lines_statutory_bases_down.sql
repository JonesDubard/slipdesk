begin;

alter table public.pay_run_lines drop column if exists nasscorp_base;
alter table public.pay_run_lines drop column if exists taxable_pay;

commit;

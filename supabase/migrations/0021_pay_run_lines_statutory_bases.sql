-- Persist the PAYE taxable base and NASSCORP contribution base used at
-- finalization so statutory exports do not re-derive from gross_pay.
begin;

alter table public.pay_run_lines
  add column if not exists taxable_pay numeric;

alter table public.pay_run_lines
  add column if not exists nasscorp_base numeric;

comment on column public.pay_run_lines.taxable_pay is
  'PAYE base used at finalization: regularSalary + overtimePay + holidayPay (additional_earnings excluded). Null on pre-0021 rows.';

comment on column public.pay_run_lines.nasscorp_base is
  'NASSCORP contribution base used at finalization: regularSalary (rate × regular_hours). Null on pre-0021 rows.';

commit;

-- Payroll draft autosave payload + line deduction columns (additive).
begin;

alter table public.pay_runs
  add column if not exists draft_payload jsonb;

comment on column public.pay_runs.draft_payload is
  'Serialized in-progress payroll grid (lines, flags). Cleared when status becomes paid/locked/archived.';

alter table public.pay_run_lines
  add column if not exists deductions numeric default 0;

alter table public.pay_run_lines
  add column if not exists deduction_items jsonb;

create index if not exists idx_pay_runs_company_status
  on public.pay_runs (company_id, status, updated_at desc);

commit;

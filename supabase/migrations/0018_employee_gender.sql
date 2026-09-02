-- Optional employee gender metadata (Phase 5).
begin;

alter table public.employees
  add column if not exists gender text;

comment on column public.employees.gender is
  'Optional: male | female | other | prefer_not_to_say (normalized on import).';

commit;

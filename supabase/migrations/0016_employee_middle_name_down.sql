begin;

alter table public.employees drop column if exists full_name;

alter table public.employees
  add column full_name text generated always as (
    trim(both ' ' from (
      coalesce(first_name::text, '') || ' ' || coalesce(last_name::text, '')
    ))
  ) stored;

alter table public.employees drop column if exists middle_name;

commit;

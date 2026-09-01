-- Employee middle name + regenerate full_name (stored generated column).
-- full_name was already GENERATED in Supabase — cannot UPDATE or use triggers.
-- Do NOT use concat_ws/concat/regexp_replace here (not IMMUTABLE).
begin;

alter table public.employees
  add column if not exists middle_name text not null default '';

comment on column public.employees.middle_name is 'Optional middle name; included in full_name when set.';

drop trigger if exists trg_employees_full_name on public.employees;
drop function if exists public.sync_employee_full_name();
drop function if exists public.employee_full_name(text, text, text);

alter table public.employees drop column if exists full_name;

alter table public.employees
  add column full_name text generated always as (
    trim(both ' ' from (
      coalesce(first_name::text, '') ||
      case
        when coalesce(middle_name::text, '') = '' then ' '
        else ' ' || middle_name::text || ' '
      end ||
      coalesce(last_name::text, '')
    ))
  ) stored;

commit;

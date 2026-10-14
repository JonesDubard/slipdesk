-- Employee → Branch via UUID (additive). Keep employees.branch text in sync.
-- NULL branch_id = Unassigned. ON DELETE SET NULL so deleting a branch does not drop employees.
begin;

do $$
begin
  alter table public.branches
    add constraint branches_id_company_id_key unique (id, company_id);
exception
  when duplicate_object then null;
end $$;

alter table public.employees
  add column if not exists branch_id uuid references public.branches(id) on delete set null;

comment on column public.employees.branch_id is
  'FK to public.branches.id within the same company. NULL = Unassigned. employees.branch stays as the canonical name for backward compatibility.';

create index if not exists idx_employees_company_branch_id
  on public.employees (company_id, branch_id);

-- Isolation: an employee must never reference a branch from another company.
create or replace function public.employees_branch_same_company()
returns trigger
language plpgsql
as $$
begin
  if new.branch_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.branches b
    where b.id = new.branch_id
      and b.company_id = new.company_id
  ) then
    raise exception 'branch_id % does not belong to company %', new.branch_id, new.company_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employees_branch_same_company on public.employees;
create trigger trg_employees_branch_same_company
  before insert or update of branch_id, company_id on public.employees
  for each row
  execute procedure public.employees_branch_same_company();

-- Backfill: one branch row per (company_id, case-insensitive trimmed name) when employees have a name.
insert into public.branches (company_id, name)
select company_id, name
from (
  select distinct on (company_id, lower(trim(branch)))
    company_id,
    trim(branch) as name
  from public.employees
  where trim(coalesce(branch, '')) <> ''
  order by company_id, lower(trim(branch)), trim(branch)
) src
where not exists (
  select 1
  from public.branches b
  where b.company_id = src.company_id
    and lower(trim(b.name)) = lower(src.name)
);

-- Point employees at the matching same-company branch and store the canonical name.
update public.employees e
set
  branch_id = matched.id,
  branch = matched.name
from (
  select distinct on (company_id, lower(trim(name)))
    id,
    company_id,
    name,
    lower(trim(name)) as name_key
  from public.branches
  order by company_id, lower(trim(name)), created_at
) matched
where e.company_id = matched.company_id
  and trim(coalesce(e.branch, '')) <> ''
  and lower(trim(e.branch)) = matched.name_key;

commit;

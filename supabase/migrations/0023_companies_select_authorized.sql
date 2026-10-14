-- Additive SELECT access for the company returned by my_company_id().
-- Does not drop or replace existing companies policies.
-- Does not change company, membership, profile, or billing rows.
--
-- my_company_id() is security definer, so this policy does not recurse into
-- itself when the function reads public.companies. The function must be the
-- 0021 definition; the 0002 definition still returns the newest owned company.

begin;

alter table public.companies enable row level security;

drop policy if exists companies_select_authorized on public.companies;
create policy companies_select_authorized
  on public.companies
  for select
  to authenticated
  using (id = public.my_company_id());

commit;

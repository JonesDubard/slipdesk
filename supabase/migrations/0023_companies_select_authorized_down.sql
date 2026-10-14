-- Removes only the additive companies read policy from 0023.

begin;

drop policy if exists companies_select_authorized on public.companies;

commit;

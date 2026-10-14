-- Restores the 0002 definition of public.my_company_id().
-- That definition prefers the newest owned company.

begin;

create or replace function public.my_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select id from public.companies where owner_id = auth.uid() order by created_at desc limit 1),
    (select company_id from public.profiles where id = auth.uid() limit 1),
    (select company_id from public.company_members where user_id = auth.uid() and status = 'active' limit 1)
  );
$$;

grant execute on function public.my_company_id() to authenticated;

commit;

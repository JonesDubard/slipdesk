-- A blank company created at signup no longer competes with an active membership.
-- Does not edit 0021. Does not delete companies or change membership rows.
-- A named company the user owns still requires profiles.company_id when they
-- also have an active membership.

begin;

create or replace function public.my_company_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owned_ids uuid[];
  competing_owned_ids uuid[];
  member_ids uuid[];
  allowed_ids uuid[];
  profile_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  select coalesce(array_agg(distinct m.company_id), array[]::uuid[])
    into member_ids
  from public.company_members m
  where m.user_id = auth.uid()
    and m.status = 'active'
    and m.company_id is not null;

  select coalesce(array_agg(owned.id), array[]::uuid[])
    into owned_ids
  from (
    select c.id
    from public.companies c
    where c.owner_id = auth.uid()
    limit 10
  ) owned;

  select p.company_id
    into profile_id
  from public.profiles p
  where p.id = auth.uid();

  if cardinality(owned_ids) >= 10 then
    return null;
  end if;

  select coalesce(array_agg(c.id), array[]::uuid[])
    into competing_owned_ids
  from public.companies c
  where c.id = any(owned_ids)
    and (
      cardinality(member_ids) = 0
      or btrim(coalesce(c.name, '')) <> ''
    );

  select coalesce(array_agg(distinct candidate.id), array[]::uuid[])
    into allowed_ids
  from (
    select unnest(competing_owned_ids) as id
    union
    select unnest(member_ids) as id
  ) candidate
  where candidate.id is not null;

  if cardinality(allowed_ids) = 1 then
    return allowed_ids[1];
  end if;

  if cardinality(allowed_ids) > 1 then
    if profile_id is not null and profile_id = any(allowed_ids) then
      return profile_id;
    end if;
    return null;
  end if;

  return profile_id;
end;
$$;

grant execute on function public.my_company_id() to authenticated;

commit;

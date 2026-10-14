-- Align public.my_company_id() with chooseCompanyForUser.
-- Does not edit migration 0002. Does not change company or billing rows.
--
-- Allowed organizations are companies the user owns plus active memberships.
-- One allowed organization is returned. Several require profiles.company_id
-- to name one of them. A name or created_at never breaks a tie.
-- A profile id outside that set is ignored, except when the user owns
-- nothing and has no active membership. Ambiguous context returns null,
-- so company_id = my_company_id() matches no tenant row.

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
  member_ids uuid[];
  allowed_ids uuid[];
  profile_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  select coalesce(array_agg(owned.id), array[]::uuid[])
    into owned_ids
  from (
    select c.id
    from public.companies c
    where c.owner_id = auth.uid()
    limit 10
  ) owned;

  select coalesce(array_agg(distinct m.company_id), array[]::uuid[])
    into member_ids
  from public.company_members m
  where m.user_id = auth.uid()
    and m.status = 'active'
    and m.company_id is not null;

  select p.company_id
    into profile_id
  from public.profiles p
  where p.id = auth.uid();

  -- More owned companies may exist beyond the fetch cap.
  if cardinality(owned_ids) >= 10 then
    return null;
  end if;

  select coalesce(array_agg(distinct candidate.id), array[]::uuid[])
    into allowed_ids
  from (
    select unnest(owned_ids) as id
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

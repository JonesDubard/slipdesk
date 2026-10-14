-- Remove the company that handle_new_user() creates for an invited signup.
-- Does not replace handle_new_user(), 0002, or 0020, and does not edit live rows.
--
-- on_auth_user_created runs on auth.users insert, before the app can accept
-- an invitation. This trigger is named to run after that one. It deletes only
-- companies owned by the new user when a pending, unexpired company_members
-- row matches the new account email. It does not read user metadata, does not
-- accept the invitation, and does not set profiles.company_id to the inviting
-- organization. A signup with no such invite keeps the company the existing
-- function created.

begin;

create or replace function public.remove_invitee_signup_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  company_ids uuid[];
  company_id_nullable text;
begin
  if new.email is null or btrim(new.email) = '' then
    return new;
  end if;

  if not exists (
    select 1
    from public.company_members m
    where lower(btrim(m.invited_email)) = lower(btrim(new.email))
      and m.status = 'pending'
      and m.invite_expires_at is not null
      and m.invite_expires_at > now()
  ) then
    return new;
  end if;

  select coalesce(array_agg(c.id), array[]::uuid[])
    into company_ids
  from public.companies c
  where c.owner_id = new.id;

  if cardinality(company_ids) = 0 then
    return new;
  end if;

  select c.is_nullable
    into company_id_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'profiles'
    and c.column_name = 'company_id';

  if company_id_nullable is distinct from 'YES' then
    raise warning 'remove_invitee_signup_company left the signup company because profiles.company_id is not nullable';
    return new;
  end if;

  begin
    update public.profiles
      set company_id = null
    where id = new.id
      and company_id = any(company_ids);

    delete from public.companies
    where id = any(company_ids);
  exception
    when foreign_key_violation or not_null_violation then
      raise warning 'remove_invitee_signup_company could not remove signup company %', sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.remove_invitee_signup_company() from public;

drop trigger if exists zz_remove_invitee_signup_company on auth.users;
create trigger zz_remove_invitee_signup_company
  after insert on auth.users
  for each row
  execute function public.remove_invitee_signup_company();

commit;

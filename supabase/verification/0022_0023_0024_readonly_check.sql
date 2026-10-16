-- Read-only check. Do not apply, recreate, or rerun migrations 0022, 0023, or 0024.
-- Run in the Supabase SQL editor. auth.uid() is null there, so this does not
-- prove which company a signed-in user sees. It only reports installed objects.
--
-- 0024 is installed when my_company_id_is_0024 is true.
-- 0022 is installed when invitee_signup_trigger_installed is true.
-- 0023 is installed when companies_select_authorized_installed is true.

select
  position(
    'competing_owned_ids' in pg_get_functiondef('public.my_company_id()'::regprocedure)
  ) > 0 as my_company_id_is_0024,
  position(
    'btrim(coalesce(c.name' in pg_get_functiondef('public.my_company_id()'::regprocedure)
  ) > 0 as ignores_blank_owned_name;

select exists (
  select 1
  from pg_trigger
  where tgname = 'zz_remove_invitee_signup_company'
    and not tgisinternal
) as invitee_signup_trigger_installed;

select exists (
  select 1
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'companies'
    and p.polname = 'companies_select_authorized'
) as companies_select_authorized_installed;

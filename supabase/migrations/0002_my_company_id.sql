-- ============================================================================
-- Slipdesk — my_company_id() helper (0002)
-- ----------------------------------------------------------------------------
-- Migration 0001 RLS policies depend on public.my_company_id(). Without a
-- function that resolves company owners (not just profile.company_id), inserts
-- into audit_log, notifications, and company_members fail or hang from the
-- client's perspective. This migration creates/replaces the helper so it works
-- for company owners, profile-linked users, and active team members.
-- ============================================================================

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

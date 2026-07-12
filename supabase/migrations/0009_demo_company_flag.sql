-- ============================================================================
-- Slipdesk — Demo company flag (0009)
-- Marks the shared Interactive Demo tenant. Demo companies are read-only
-- at the application layer (and optionally via RLS policies below).
-- ============================================================================

begin;

alter table public.companies
  add column if not exists is_demo boolean not null default false;

comment on column public.companies.is_demo is
  'When true, this company is the shared Interactive Demo tenant (read-only).';

create index if not exists idx_companies_is_demo
  on public.companies (is_demo)
  where is_demo = true;

-- Soft RLS belt: deny writes against demo companies for authenticated roles.
-- Service role (seed / admin) bypasses RLS.

create or replace function public.company_is_demo(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_demo from public.companies where id = p_company_id), false);
$$;

revoke all on function public.company_is_demo(uuid) from public;
grant execute on function public.company_is_demo(uuid) to authenticated, anon, service_role;

commit;

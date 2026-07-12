-- ============================================================================
-- Slipdesk — API keys for Enterprise API Access (0008)
-- ============================================================================

begin;

create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  name         text not null default 'Default',
  key_prefix   text not null,
  key_hash     text not null,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists idx_api_keys_company on public.api_keys(company_id);
create index if not exists idx_api_keys_hash on public.api_keys(key_hash);

alter table public.api_keys enable row level security;

drop policy if exists api_keys_select on public.api_keys;
create policy api_keys_select on public.api_keys
  for select using (company_id = public.my_company_id());

drop policy if exists api_keys_write on public.api_keys;
create policy api_keys_write on public.api_keys
  for all using (company_id = public.my_company_id())
  with check (company_id = public.my_company_id());

-- Optional parent link for multi-branch org hierarchy (Enterprise)
alter table public.branches add column if not exists code text;
alter table public.branches add column if not exists is_hq boolean not null default false;

commit;

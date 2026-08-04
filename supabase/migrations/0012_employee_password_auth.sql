-- ============================================================================
-- Slipdesk — Employee portal password/PIN auth (0012)
-- ----------------------------------------------------------------------------
-- Replaces OTP as the active auth method for v0.1.0 (cost constraint: no SMS).
-- Stores only salted scrypt hashes. Temporary passwords are never persisted
-- in plaintext. OTP tables from 0010/0011 remain unused (reserved for a
-- future funded OTP track) and are not dropped here.
--
-- Apply after 0010 + 0011. Rollback: 0012_employee_password_auth_down.sql
-- ============================================================================

begin;

create table if not exists public.employee_credentials (
  employee_id            uuid primary key references public.employees(id) on delete cascade,
  company_id             uuid not null references public.companies(id) on delete cascade,
  password_hash          text not null,
  must_change_password   boolean not null default true,
  failed_attempts        int not null default 0,
  locked_until           timestamptz,
  last_login_at          timestamptz,
  password_changed_at    timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_employee_credentials_company
  on public.employee_credentials(company_id);

comment on table public.employee_credentials is
  'Portal password/PIN hashes (scrypt). Plaintext never stored.';
comment on column public.employee_credentials.must_change_password is
  'True after HR assign/reset until employee sets their own password';

alter table public.employee_credentials enable row level security;

-- No direct client access — all reads/writes via service-role APIs
drop policy if exists employee_credentials_deny_all on public.employee_credentials;
create policy employee_credentials_deny_all on public.employee_credentials
  for all using (false) with check (false);

-- Optional audit-friendly events for password auth (no secrets in meta)
create table if not exists public.employee_auth_events (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid references public.employees(id) on delete set null,
  company_id   uuid references public.companies(id) on delete set null,
  event_type   text not null
                 check (event_type in (
                   'login_ok', 'login_fail', 'login_lockout',
                   'password_changed', 'password_assigned', 'password_reset',
                   'portal_disabled'
                 )),
  actor_id     uuid,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_employee_auth_events_employee
  on public.employee_auth_events(employee_id, created_at desc);

alter table public.employee_auth_events enable row level security;
drop policy if exists employee_auth_events_deny_all on public.employee_auth_events;
create policy employee_auth_events_deny_all on public.employee_auth_events
  for all using (false) with check (false);

commit;

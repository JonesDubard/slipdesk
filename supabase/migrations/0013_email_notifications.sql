-- ============================================================================
-- Slipdesk — Email notifications & account recovery (0013)  [v0.1.1]
-- ----------------------------------------------------------------------------
-- Email-only notification foundation (Resend). No SMS/WhatsApp.
-- Additive + idempotent. Rollback: 0013_email_notifications_down.sql
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. EMPLOYEE EMAIL METADATA
-- ────────────────────────────────────────────────────────────────────────────
alter table public.employees add column if not exists email_verified boolean not null default false;
alter table public.employees add column if not exists last_email_at timestamptz;
alter table public.employees add column if not exists last_email_status text;

comment on column public.employees.email_verified is 'True when employee confirmed ownership of email';
comment on column public.employees.last_email_status is 'Last outbound email status: sent|delivered|failed|pending|skipped';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. NOTIFICATION PREFERENCES (channel + event — future WhatsApp/SMS ready)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.notification_preferences (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  channel      text not null
                 check (channel in ('email', 'whatsapp', 'sms', 'push')),
  event_type   text not null
                 check (event_type in (
                   'payslip_ready', 'password_reset', 'password_changed', 'welcome'
                 )),
  enabled      boolean not null default true,
  -- Future channels start disabled at the preference layer
  available    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (employee_id, channel, event_type)
);
create index if not exists idx_notif_prefs_employee
  on public.notification_preferences(employee_id);

alter table public.notification_preferences enable row level security;
drop policy if exists notif_prefs_select_own on public.notification_preferences;
create policy notif_prefs_select_own on public.notification_preferences
  for select using (
    employee_id = public.my_employee_id()
    or public.is_company_staff()
  );
drop policy if exists notif_prefs_update_own on public.notification_preferences;
create policy notif_prefs_update_own on public.notification_preferences
  for update using (
    employee_id = public.my_employee_id()
    and channel = 'email'
    and event_type <> 'password_reset' -- password reset emails always on when email exists
  );
drop policy if exists notif_prefs_insert_deny on public.notification_preferences;
create policy notif_prefs_insert_deny on public.notification_preferences
  for insert with check (false);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. SECURE TOKENS (password reset + payslip access) — store hashes only
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.secure_tokens (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  purpose       text not null
                  check (purpose in ('password_reset', 'payslip_access', 'email_verify')),
  token_hash    text not null unique,
  payslip_id    uuid, -- pay_run_lines.id when purpose = payslip_access
  expires_at    timestamptz not null,
  used_at       timestamptz,
  created_at    timestamptz not null default now(),
  meta          jsonb not null default '{}'::jsonb
);
create index if not exists idx_secure_tokens_employee
  on public.secure_tokens(employee_id, purpose, created_at desc);
create index if not exists idx_secure_tokens_expires
  on public.secure_tokens(expires_at) where used_at is null;

alter table public.secure_tokens enable row level security;
drop policy if exists secure_tokens_deny_all on public.secure_tokens;
create policy secure_tokens_deny_all on public.secure_tokens
  for all using (false) with check (false);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. UNIVERSAL NOTIFICATION LOG (email now; WhatsApp/SMS/Push later)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.notification_logs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references public.companies(id) on delete set null,
  employee_id     uuid references public.employees(id) on delete set null,
  channel         text not null
                    check (channel in ('email', 'whatsapp', 'sms', 'push')),
  provider        text not null default 'resend',
  template_key    text not null,
  event_type      text not null,
  recipient       text not null, -- email address or future phone; never passwords
  status          text not null default 'pending'
                    check (status in ('pending', 'sent', 'delivered', 'failed', 'skipped')),
  attempt         int not null default 1,
  provider_message_id text,
  error_reason    text,
  meta            jsonb not null default '{}'::jsonb, -- period, company name — no secrets
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_notif_logs_company_created
  on public.notification_logs(company_id, created_at desc);
create index if not exists idx_notif_logs_status
  on public.notification_logs(status, created_at desc);
create index if not exists idx_notif_logs_employee
  on public.notification_logs(employee_id, created_at desc);
create index if not exists idx_notif_logs_recipient
  on public.notification_logs(lower(recipient));

alter table public.notification_logs enable row level security;
drop policy if exists notif_logs_select_staff on public.notification_logs;
create policy notif_logs_select_staff on public.notification_logs
  for select using (
    public.is_company_staff()
    and company_id = public.my_company_id()
  );
-- Writes via service role only
drop policy if exists notif_logs_no_client_write on public.notification_logs;
create policy notif_logs_no_client_write on public.notification_logs
  for insert with check (false);
drop policy if exists notif_logs_no_client_update on public.notification_logs;
create policy notif_logs_no_client_update on public.notification_logs
  for update using (false);

commit;

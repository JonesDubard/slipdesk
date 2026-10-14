-- Team invitations: name, hashed one-time token, expiry.
-- Company-member writes are limited to the company owner.
-- Service role (activation and Slipdesk admin) bypasses RLS.

begin;

alter table public.company_members
  add column if not exists invited_name text,
  add column if not exists invite_token_hash text,
  add column if not exists invite_expires_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists invited_by uuid;

comment on column public.company_members.invite_token_hash is
  'SHA-256 hex of the invitation token. The raw token is emailed once and is not stored.';
comment on column public.company_members.invite_expires_at is
  'When a pending invitation stops being acceptable.';

create unique index if not exists uq_company_members_invite_token
  on public.company_members (invite_token_hash)
  where invite_token_hash is not null;

drop policy if exists company_members_insert on public.company_members;
drop policy if exists company_members_update on public.company_members;
drop policy if exists company_members_delete on public.company_members;

create policy company_members_insert on public.company_members
  for insert with check (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = auth.uid()
    )
  );

create policy company_members_update on public.company_members
  for update using (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = auth.uid()
    )
  );

create policy company_members_delete on public.company_members
  for delete using (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = auth.uid()
    )
  );

commit;

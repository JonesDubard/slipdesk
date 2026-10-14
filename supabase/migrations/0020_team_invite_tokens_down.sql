begin;

drop policy if exists company_members_insert on public.company_members;
drop policy if exists company_members_update on public.company_members;
drop policy if exists company_members_delete on public.company_members;

create policy company_members_insert on public.company_members
  for insert with check (company_id = public.my_company_id());

create policy company_members_update on public.company_members
  for update using (company_id = public.my_company_id())
  with check (company_id = public.my_company_id());

drop index if exists uq_company_members_invite_token;

alter table public.company_members
  drop column if exists invited_by,
  drop column if exists accepted_at,
  drop column if exists invite_expires_at,
  drop column if exists invite_token_hash,
  drop column if exists invited_name;

commit;

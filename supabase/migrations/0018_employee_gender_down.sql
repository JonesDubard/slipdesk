begin;
alter table public.employees drop column if exists gender;
commit;

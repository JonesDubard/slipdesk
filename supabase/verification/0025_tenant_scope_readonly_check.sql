-- Read-only. Do not apply, recreate, or rerun 0022, 0023, 0024, or 0025.
-- Paste into the Supabase SQL editor. auth.uid() is null there, so this does
-- not prove what a signed-in user can read. It reports installed objects only.
--
-- PASS means the 13 SELECT policies from 0025 exist and each USING expression
-- calls my_company_id(), and none still match the rollback file
-- supabase/rollback/0025_tenant_scope_hr_select_policies_down.sql.
-- Write policies are listed. 0025 did not change them, so a write policy with
-- using (false) is not a failure.

-- 1. PASS / FAIL
with expected(policyname) as (
  values
    ('leave_requests_select'),
    ('leave_events_select'),
    ('attendance_select'),
    ('ot_select'),
    ('leave_policies_select'),
    ('leave_balances_select'),
    ('leave_ledger_select'),
    ('weekly_ot_select'),
    ('att_config_select'),
    ('reminder_log_select'),
    ('scheduler_runs_select'),
    ('payroll_val_select'),
    ('notif_prefs_select_own')
),
installed as (
  select
    c.relname as table_name,
    p.polname as policyname,
    p.polcmd,
    pg_get_expr(p.polqual, p.polrelid) as qual
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'leave_requests',
      'leave_approval_events',
      'attendance_records',
      'overtime_records',
      'leave_policies',
      'leave_balances',
      'leave_balance_ledger',
      'weekly_overtime_records',
      'company_attendance_config',
      'attendance_reminder_log',
      'attendance_scheduler_runs',
      'payroll_validation_logs',
      'notification_preferences'
    )
),
select_gaps as (
  select e.policyname
  from expected e
  where not exists (
    select 1
    from installed i
    where i.policyname = e.policyname
      and i.polcmd = 'r'
      and coalesce(i.qual, '') like '%my_company_id()%'
      and coalesce(i.qual, '') not like '%my_employee_id() is not null%'
  )
),
down_signatures as (
  select i.table_name, i.policyname
  from installed i
  where i.polcmd = 'r'
    and (
      coalesce(i.qual, '') like '%my_employee_id() is not null%'
      or (
        coalesce(i.qual, '') like '%is_company_staff()%'
        and coalesce(i.qual, '') not like '%my_company_id()%'
      )
    )
)
select
  case
    when (select count(*) from select_gaps) = 0
     and (select count(*) from down_signatures) = 0
    then 'PASS'
    else 'FAIL'
  end as result,
  (select count(*) from select_gaps) as missing_or_unscoped_select_policies,
  (select count(*) from down_signatures) as down_file_signatures_present,
  'Policy text decides PASS/FAIL. schema_migrations can be empty when these files were applied by hand.' as note;

-- 2. Migration history. A missing schema must not abort the script.
-- A static FROM cannot be skipped with a CTE: Postgres resolves the relation
-- before any WHERE/CASE runs. Dynamic SQL runs the original select only when
-- the table exists.
drop table if exists pg_temp._0025_schema_migrations_check;

do $$
declare
  history_sql text := $hist$
    insert into pg_temp._0025_schema_migrations_check (version, name)
    select version, name
    from supabase_migrations.schema_migrations
    where version in ('0022', '0023', '0024', '0025')
       or version like '0022_%'
       or version like '0023_%'
       or version like '0024_%'
       or version like '0025_%'
       or split_part(coalesce(name, ''), '_', 1) in ('0022', '0023', '0024', '0025')
    order by version
  $hist$;
begin
  create temp table _0025_schema_migrations_check (
    version text,
    name text
  );
  if to_regclass('supabase_migrations.schema_migrations') is null then
    insert into pg_temp._0025_schema_migrations_check (version, name)
    values ('SKIPPED', 'schema_migrations absent (hand-applied)');
  else
    execute history_sql;
  end if;
end $$;

select version, name
from pg_temp._0025_schema_migrations_check
order by version;

-- 3. Every RLS policy on the tables 0025 touched.
select
  c.relname as table_name,
  p.polname as policyname,
  case p.polcmd
    when 'r' then 'SELECT'
    when 'a' then 'INSERT'
    when 'w' then 'UPDATE'
    when 'd' then 'DELETE'
    when '*' then 'ALL'
    else p.polcmd::text
  end as cmd,
  coalesce(
    (
      select string_agg(rol.rolname, ', ' order by rol.rolname)
      from pg_roles rol
      where rol.oid = any (p.polroles)
    ),
    'public'
  ) as roles,
  pg_get_expr(p.polqual, p.polrelid) as qual,
  pg_get_expr(p.polwithcheck, p.polrelid) as with_check,
  case
    when p.polcmd = 'r'
      and (
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') not like '%my_company_id()%'
        or coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%my_employee_id() is not null%'
        or (
          coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%is_company_staff()%'
          and coalesce(pg_get_expr(p.polqual, p.polrelid), '') not like '%my_company_id()%'
        )
      )
    then 'FAIL'
    when p.polcmd = 'r' then 'OK'
    else 'INFO'
  end as flag
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'leave_requests',
    'leave_approval_events',
    'attendance_records',
    'overtime_records',
    'leave_policies',
    'leave_balances',
    'leave_balance_ledger',
    'weekly_overtime_records',
    'company_attendance_config',
    'attendance_reminder_log',
    'attendance_scheduler_runs',
    'payroll_validation_logs',
    'notification_preferences'
  )
order by c.relname, p.polname;

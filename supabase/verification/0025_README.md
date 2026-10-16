# 0025 tenant-scope check

Run `0025_tenant_scope_readonly_check.sql` in the Supabase SQL editor. It only selects. Do not run the migration or the rollback from that editor unless you intend to change policies.

The script returns three results.

1. A header row. `result` is `PASS` or `FAIL`. Query 1 is the source of truth.
2. Migration history. If `supabase_migrations.schema_migrations` exists, the original version/name filter runs. If that schema is absent, query 2 returns one row: `version = SKIPPED`, `name = schema_migrations absent (hand-applied)`. It does not raise and it does not stop query 3.
3. Every RLS policy on the 13 tables whose SELECT policies 0025 replaces, with `policyname`, `cmd`, `roles`, `qual`, `with_check`, and `flag`.

A missing `schema_migrations` schema means these files were applied by hand in the SQL editor. That is not a missing policy and it is not a failed migration.

A healthy header is `PASS`, with `missing_or_unscoped_select_policies = 0` and `down_file_signatures_present = 0`. On 2026-10-16 this project returned that PASS.

A healthy policy list has these SELECT policies, each with `flag = OK` and `my_company_id()` in `qual`:

- `leave_requests_select`
- `leave_events_select`
- `attendance_select`
- `ot_select`
- `leave_policies_select`
- `leave_balances_select`
- `leave_ledger_select`
- `weekly_ot_select`
- `att_config_select`
- `reminder_log_select`
- `scheduler_runs_select`
- `payroll_val_select`
- `notif_prefs_select_own`

`FAIL` means one of those policies is missing, its USING expression does not call `my_company_id()`, or it still matches the rollback (`is_company_staff()` without `my_company_id()`, or `my_employee_id() is not null`).

Write policies are `INFO`. 0025 did not change them. `using (false)` on a no-client-write policy is expected.

Do not rerun 0022, 0023, 0024, or 0025 to create `schema_migrations`. If the Supabase CLI is baselined later, insert rows for versions 0022–0025 into `supabase_migrations.schema_migrations` before the next `supabase db push`.

The SQL editor is not a signed-in user, so this check cannot prove which company a member sees. That still needs a signed-in session after the policies are in place.

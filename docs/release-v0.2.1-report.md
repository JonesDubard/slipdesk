# Release Report — v0.2.1 Leave & Attendance Hardening

**Status:** Complete — awaiting approval before v0.3.0  
**Date:** 2026-08-04  
**Scope:** Stabilization of v0.2.0 Leave + Attendance only. No new HR modules, no UI redesign, no departments/onboarding/documents/scheduling products.

---

## Limitation classification (from v0.2.0)

| Limitation | Class | v0.2.1 action |
|------------|-------|---------------|
| Daily-only OT; no weekly | **Production blocker** | Fixed — daily / weekly / both |
| No leave balances | **Production blocker** | Fixed — configurable policy engine |
| Leave days still get missing clock-out | **Production blocker** | Fixed — reconciliation |
| Manual-only missing clock-out | **Production blocker** | Fixed — cron scheduler |
| No pre-payroll validation | **Production blocker** | Fixed — validation layer |
| Hardcoded attendance rules | **Operational** | Fixed — per-company config |
| Thin audit coverage | **Operational** | Expanded |
| Limited notification events | **Operational** | Extended |
| Liberia statutory entitlements | **Future enhancement** | Documented only |
| Comp-time in lieu of OT | **Future enhancement** | Not implemented |
| Hard weekly OT cap (~5h) | **Future enhancement** | Not enforced |

---

## Production blockers resolved

1. **Weekly OT** — `computeWeekOvertime` supports `daily_only` | `weekly_only` | `both` via `company_attendance_config`  
2. **Leave balances** — allocated / used / pending / remaining; maternity supported; unpaid does not consume  
3. **Attendance reconciliation** — approved leave excluded from missing clock-out / reminders  
4. **Automatic missing clock-out** — `/api/cron/attendance-validation?secret=CRON_SECRET`  
5. **Payroll validation** — `/api/payroll/validate` on pay-run start (warnings/errors, not silent)  
6. **Company config** — OT mode, thresholds, scheduler hour, timezone, max shift, grace, leave timeout  

---

## Operational improvements completed

- Audit: balance changes, config updates, scheduler runs, validation runs, missing-clockout flags  
- Notifications: `leave_balance_low`, `leave_balance_exhausted`, `attendance_auto_missing_clockout`, `payroll_validation_warning`  
- Reminder dedupe via `attendance_reminder_log`  
- HR attendance page: OT mode + scheduler hour settings (no redesign)  
- Portal leave: balance summary + maternity type  

---

## Weekly OT calculation strategy

When **both** daily and weekly are enabled:

1. `daily_ot_i = max(0, hours_i − dailyThreshold)`  
2. `weekly_ot_raw = max(0, Σhours − weeklyThreshold)`  
3. `payable_ot = max(Σdaily_ot, weekly_ot_raw)`  
4. If weekly exceeds daily sum, the difference is **weekly extra** (no double-count of the same hour)

Modes are company-configurable; defaults remain daily-only for backwards compatibility with v0.2.0.

---

## Database changes

Apply after `0014`:

- `0015_leave_attendance_hardening.sql`  
- Rollback: `0015_leave_attendance_hardening_down.sql`

Adds: `leave_policies`, `leave_balances`, `leave_balance_ledger`, `company_attendance_config`, `weekly_overtime_records`, `attendance_reminder_log`, `attendance_scheduler_runs`, `payroll_validation_logs`; extends leave types + notification events; OT column metadata on `overtime_records`.

---

## Architecture improvements

- Pure engines: overtime, balances, reconcile, validate-period, scheduler gate  
- Services persist + audit; cron only invokes domain  
- Notifications only through Notification Service (no Resend in workflows)  

---

## Notification events (new)

| Event | Purpose |
|-------|---------|
| `leave_balance_low` | Remaining ≤ policy threshold |
| `leave_balance_exhausted` | Remaining ≤ 0 after approve |
| `attendance_auto_missing_clockout` | Scheduler-detected missing clock-out |
| `payroll_validation_warning` | Pre-payroll issues summary to company email |

Future WhatsApp/SMS: same event keys + templates.

---

## Tests executed

```
npm test       → 98 passed (12 files)  [+13 v0.2.1]
npm run typecheck → clean (after fix)
npm run build  → (production readiness)
```

Covered: weekly/daily/both OT, balances, reconciliation, dedupe keys, payroll validation, scheduler gate, templates, migration up/down.

---

## Smoke / regression

- [ ] Apply `0015` on demo DB  
- [ ] Set leave policy allocations via `/api/hr/attendance-config`  
- [ ] Leave submit consumes pending balance; approve → used  
- [ ] Employee on approved leave not reminded for missing clock-out  
- [ ] Cron with `CRON_SECRET` at configured local hour  
- [ ] Start payroll → validation toast if issues  
- [ ] v0.1.0 / v0.1.1 / v0.2.0 flows still work  

---

## Remaining future enhancements

- Liberia statutory entitlement defaults (by tenure/sector)  
- Comp-time instead of OT pay  
- Hard statutory weekly OT max (~5h) as optional enforced cap  
- Push/SMS providers for the new events  

---

## Known risks / recommendations before v0.3.0

- Companies must set leave policy `annual_allocation` or balances stay at 0 (blocks leave if tracking on)  
- Scheduler requires hourly cron hitting `/api/cron/attendance-validation`  
- Set `CRON_SECRET` and company timezone (`Africa/Monrovia` default)  
- Validation is advisory (does not block Mark as Paid) — review warnings before approve  

**Do not begin v0.3.0 until approved.**

---

## Stop

v0.2.1 complete. Waiting for explicit approval.

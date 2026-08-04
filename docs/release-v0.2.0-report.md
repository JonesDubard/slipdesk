# Release Report — v0.2.0 Leave Management + Time & Attendance

**Status:** Complete — awaiting approval before v0.3.0  
**Date:** 2026-08-04  
**Scope:** Leave request/approval + time & attendance with OT → payroll handoff.  
**Out of scope (not built):** departments/branches, onboarding/offboarding, document storage.

---

## Completed features

1. **Leave requests** — employees submit via portal; HR approve / reject / request info  
2. **Leave approval history** — `leave_approval_events` audit trail  
3. **Payroll handoff** — approved unpaid leave deducts `STANDARD_DAILY_HOURS × days` from `pending_regular_hours`  
4. **Attendance** — clock-in/out + manual hours; HR corrections  
5. **Overtime** — hours beyond configurable daily threshold → `overtime_records` + `pending_overtime_hours`  
6. **Notification events** via Notification Service (email provider only; no SMS/WhatsApp)  
7. **Migration 0014** + rollback  
8. **Configurable labor rules** — no magic OT threshold/rate in workflows  

---

## Statutory rate assumptions (flagged)

| Rule | Encoded value | Confidence |
|------|---------------|------------|
| Ordinary day | **8 hours** (`LABOR_RULES.STANDARD_DAILY_HOURS`) | Confirmed (Decent Work Act 2015 summaries) |
| Ordinary week | **48 hours** (`STANDARD_WEEKLY_HOURS`) | Confirmed — informational in v0.2; daily OT trigger used as specified |
| Overtime multiplier | **1.5×** (`OT_MULTIPLIER`) | Confirmed (≥150% ordinary rate) |
| Public holiday premium | **2.0×** (existing payroll) | Confirmed in secondary guides — already in engine |

**NOT hardcoded (need human confirmation before encoding):**

- Annual / sick / maternity / other **statutory leave day entitlements** by tenure or sector  
- Weekly OT **cap** (~5 hours/week averaged — cited in guides; not enforced)  
- Whether every sector must use **daily>8 OR weekly>48** (or both) for OT — this release uses **daily threshold only** per product spec  
- Comp-time in lieu of OT pay (allowed by law with written agreement) — not implemented  

Source constant file: `src/lib/labor-rules.ts`

---

## Notification events added

| Event | Recipient | Template |
|-------|-----------|----------|
| `leave_submitted` | Company/HR email | leave_submitted |
| `leave_approved` | Employee | leave_approved |
| `leave_rejected` | Employee | leave_rejected |
| `leave_info_requested` | Employee | leave_info_requested |
| `attendance_missing_clockout` | Employee | attendance_missing_clockout |
| `attendance_corrected` | Employee | attendance_corrected |

**Workflow triggers:** leave submit/review; HR attendance correct; HR “flag missing clock-outs”.

**Integration:** `@/lib/notifications/leave-attendance-notify` → `sendTemplatedEmail` → `EmailProvider`.  
Business success is independent of delivery (`void notify…` + try/catch; failed sends still log when possible).

**Future WhatsApp/SMS:** same event types + message models; register new providers; flip preference `available`.

---

## Database changes

Apply after 0013:

1. `0014_leave_attendance.sql`  
Rollback: `0014_leave_attendance_down.sql`

Tables: `leave_requests`, `leave_approval_events`, `attendance_records`, `overtime_records`  
Also extends `notification_preferences.event_type` check + optional `notification_logs.workflow_ref`.

---

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/employee/leave` | List / submit leave |
| GET/POST | `/api/hr/leave` | Queue + approve/reject/request_info |
| GET/POST | `/api/employee/attendance` | List / clock_in / clock_out / manual |
| GET/POST | `/api/hr/attendance` | List / correct / flag_missing_clockouts |
| POST | `/api/payroll/apply-attendance` | After paid run: mark OT applied, clear pending OT |

Permissions: `leave:review`, `attendance:manage`

---

## Files (high level)

- `src/lib/labor-rules.ts`, `src/lib/leave/*`, `src/lib/attendance/*`, `src/lib/payroll/apply-leave-attendance.ts`  
- `src/lib/notifications/types|templates|service|leave-attendance-notify`  
- Portal: `/portal/leave`, `/portal/attendance`  
- HR: `/hr/leave`, `/hr/attendance`  
- Payroll engine OT/holiday multipliers sourced from `LABOR_RULES`  
- Tests: `leave-attendance-v020.test.ts`, `leave-attendance-migration.test.ts`

---

## Tests executed

```
npm test       → 85 passed (11 files)
npm run typecheck → clean
npm run build  → (run as part of readiness)
```

Includes: OT split/threshold, leave transitions, unpaid leave → regular hours, OT → gross pay, templates, notification failure isolation, migration up/down shape.

---

## Smoke / regression checklist

- [ ] Apply `0014` on demo DB  
- [ ] Portal leave submit → HR approve/reject/info → emails logged  
- [ ] Unpaid leave reduces pending regular hours  
- [ ] Clock / manual hours → OT beyond 8h in pending OT → payroll start  
- [ ] Mark paid → OT marked applied  
- [ ] v0.1.0 portal PIN login + change requests still work  
- [ ] v0.1.1 payslip email + forgot password + email log still work  

---

## Production readiness

- No direct Resend calls in leave/attendance workflows  
- Workflows succeed if email fails  
- Typecheck clean; new unit tests green  
- Lint: pre-existing repo-wide issues remain; no new Resend coupling  

---

## Known limitations / risks for v0.3.0

- No leave **balance/accrual** engine (entitlements not confirmed)  
- No weekly OT aggregation / 5h OT cap enforcement  
- Missing clock-out reminders are **on-demand** (HR button), not a scheduled job  
- Paid leave does not auto-zero attendance days (exclusion from “missing” is date-status based only)  
- Company must have `companies.email` for HR leave-submitted notifications  

---

## Stop

**Do not begin v0.3.0.** Waiting for explicit approval.

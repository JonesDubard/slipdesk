# Release Report — v0.1.0 Employee Self-Service Portal (Password/PIN)

**Status:** Complete — awaiting approval before v0.2.0  
**Date:** 2026-08-04  
**Auth model:** HR-assigned password/PIN only (no SMS / WhatsApp / email OTP)

---

## Cost / third-party confirmation

**Zero paid messaging dependency in this release.**

- No SMS gateway  
- No WhatsApp Business API  
- No email OTP delivery for employees  
- Password hashing uses Node `crypto.scrypt` (local)  
- Sessions reuse existing Supabase Auth already in the stack (magic-link exchange after password verify — no new vendor)

`AuthMethod` abstraction is in place (`password` active; `otp` stub returns 501) so a future funded OTP track can plug in without restructuring.

---

## Features completed

1. **Employee auth via HR-assigned PIN/password** (phone as username only)  
2. **Forced password change on first login** (`must_change_password`)  
3. **Admin-triggered reset** — temporary PIN returned **once** to the admin UI/API response only; never stored plaintext; never written to audit logs  
4. **Payslip history** (read-only from `pay_run_lines`)  
5. **NASSCORP cumulative viewer** (USD-normalized + per-currency breakdown)  
6. **Offline cache** of last 3 payslips (IndexedDB + localStorage)  
7. **Change-request queue** with HR approve/reject + audit  
8. **Migrations** for portal identity, hardening, and credential store  

---

## Database changes (apply order)

1. `0010_employee_self_service.sql`  
2. `0011_portal_hardening.sql`  
3. `0012_employee_password_auth.sql` ← **password/PIN hashes** (`employee_credentials`, `employee_auth_events`)

OTP tables from 0010/0011 remain unused (reserved for a future funded track).

---

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/employee/auth/login` | Phone + password/PIN |
| POST | `/api/employee/auth/change-password` | First login / change |
| GET | `/api/employee/me` | Profile + `mustChangePassword` |
| GET | `/api/employee/payslips` · `/[id]` | Own payslips |
| GET | `/api/employee/nasscorp` | Own NASSCORP |
| GET/POST | `/api/employee/change-requests` | Own requests |
| GET/POST | `/api/hr/change-requests` · `/[id]` | HR queue |
| POST | `/api/hr/employees/[id]/portal-credentials` | assign / reset / disable (temp PIN to admin only) |

Removed active OTP endpoints: `request-otp`, `verify-otp`.

---

## Password security checks

| Check | Result |
|-------|--------|
| Storage format | `scrypt$N$r$p$salt$hash` — not plaintext, not reversible |
| Unit test: hash never contains PIN | Passed |
| Audit log on assign/reset | Records event **without** temporary password |
| Admin API response | Temporary PIN returned once to caller only |

---

## Tests executed

| Suite | Result |
|-------|--------|
| Full Vitest | **59/59 passed** |
| Password hash / policy / AuthMethod | Passed |
| Forced-change + integration contract | Passed |
| Cross-employee isolation (403) | **Passed** |
| Migration 0010–0012 contracts | Passed |
| Typecheck | Passed |
| Portal-scoped ESLint | Passed |
| Production build | Passed |

---

## How to smoke-test

1. Apply `0010` → `0011` → `0012` on your demo Supabase project.  
2. Employees → open employee → **Enable & assign PIN** → copy temporary PIN (shown once).  
3. `/portal/login` → phone + PIN → forced change password → portal home.  
4. View payslips / NASSCORP; submit a change request; approve in **Change Requests**.  
5. **Reset PIN** as HR and confirm new temp PIN appears only in the admin UI.

---

## Known limitations

- PIN relay is manual (by design — no messaging channel).  
- OTP/SMS deferred to a funded track.  
- Empty staging projects still need a base schema dump before migrations.

## Risks for v0.2.0

1. Optional company code on login if phone collisions across tenants become common  
2. Live RLS verification on applied DB  
3. When funded: implement `OtpAuth` against `AuthMethod` without rewriting portal routes  

---

## Stop

**Do not begin v0.2.0** until explicit approval.

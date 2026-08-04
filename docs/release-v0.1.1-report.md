# Release Report — v0.1.1 Email Notifications & Self-Service Account Recovery

**Status:** Complete — awaiting approval before v0.2.0  
**Date:** 2026-08-04  
**Channel scope:** Email only (Resend). No SMS / WhatsApp / push.

---

## Completed features

1. **NotificationService abstraction** — business logic never calls Resend; providers are pluggable  
2. **Resend EmailProvider** — production error handling; skips cleanly when `RESEND_API_KEY` missing  
3. **Employee email metadata** — `email_verified`, `last_email_at`, `last_email_status` (+ existing `email`)  
4. **Automatic payslip emails** on Mark as Paid — subject *Your Slipdesk Payslip is Ready*; no PDF attachments  
5. **Secure payslip links** — opaque single-use tokens, 24h TTL, hashed at rest, no employee IDs in URLs  
6. **Forgot password by email** — for employees with email; no enumeration; HR PIN reset remains for no-email  
7. **Notification preferences** — payslip emails toggleable; password reset required; WhatsApp/SMS placeholders disabled  
8. **Branded templates** — welcome, payslip ready, password reset, password changed  
9. **Universal notification logs** — recipient, template, provider, status, attempt, failure reason, message ID  
10. **Admin Email Log dashboard** — `/hr/notifications` with search, status filter, retry failed  

---

## Files modified / added (high level)

| Area | Paths |
|------|--------|
| Migration | `supabase/migrations/0013_email_notifications.sql`, `_down.sql` |
| Core | `src/lib/notifications/*` (types, service, tokens, templates, providers, preference-helpers, index) |
| APIs | forgot/reset password, payslip-access, notify-payslips, notification-preferences, hr/notifications (+ retry) |
| Portal | forgot-password, reset-password, preferences; login/layout/payslips updates |
| Admin | `(dashboard)/hr/notifications`, nav + layout Email Log |
| Payroll | Mark as Paid → `/api/payroll/notify-payslips` |
| Docs | `docs/env-email.md`, this report |
| Tests | `src/lib/__tests__/notifications-v011.test.ts` |

---

## Database changes

Apply on the existing demo/prod project (after 0010–0012):

1. `0013_email_notifications.sql`

Adds:

- `employees.email_verified`, `last_email_at`, `last_email_status`
- `notification_preferences` (channel × event; WhatsApp/SMS/push ready)
- `secure_tokens` (hashed only; password_reset / payslip_access / email_verify)
- `notification_logs` (channel-agnostic history)

Rollback: `0013_email_notifications_down.sql`

---

## Notification architecture

```
Business workflows (payroll paid, forgot password, password changed)
        │
        ▼
NotificationService (dispatch / prefs / logging / tokens)
        │
        ├── EmailProvider (Resend)     ← v0.1.1 active
        ├── WhatsAppProviderStub       ← unavailable
        ├── SmsProviderStub            ← unavailable
        └── PushProviderStub           ← unavailable
```

Message model (`NotificationMessage`) is channel-agnostic: recipient, subject/html/text, template key, meta (no secrets).

**How to add WhatsApp / SMS / Push later without changing business logic:**

1. Implement `NotificationProvider` (same `send(message)` contract).  
2. Register it in `providers` array in `service.ts`.  
3. Flip `available` / `enabled` on `notification_preferences` for that channel.  
4. Reuse the same templates as **message models** (render text/body for the new channel).  
5. Logs already store `channel` + `provider` — dashboard filters already accept non-email channels.

Payroll / portal / HR routes keep calling `notifyPayslipsReady`, `requestPasswordResetByEmail`, etc. — no Resend imports there.

---

## Resend integration

- Env: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_APP_URL` (see `docs/env-email.md`)  
- Isolated in `src/lib/notifications/providers/email.ts`  
- Failures logged; retries via admin dashboard  

---

## Email templates

| Key | Subject / purpose |
|-----|-------------------|
| `welcome` | Portal welcome |
| `payslip_ready` | *Your Slipdesk Payslip is Ready* + View Payslip CTA |
| `password_reset` | Secure reset link (1h) |
| `password_changed` | Confirmation alert |

Support company logo, primary/secondary colors, employee name, period, CTA, mobile viewport meta.

---

## Security review

| Check | Result |
|-------|--------|
| No email enumeration on forgot-password | Generic success always |
| Reset / payslip tokens hashed (SHA-256) | Yes — plaintext never stored |
| Expiry | Payslip 24h; reset 1h |
| Single-use | `used_at` set on consume |
| URLs forge-resistant | Opaque token; no employee IDs |
| Expired payslip link → login | Redirect `/portal/login` |
| Email validated | Regex + provider check |
| Logs contain no passwords/secrets | Meta sanitized helpers; tokens not logged |
| Preference: password_reset cannot disable | Enforced in API + service |

---

## Tests executed

```
npm test          → 72 passed (9 files), including 13 new v0.1.1 notification tests
npm run typecheck → clean
npm run build     → success (placeholder Supabase env)
```

Coverage includes: templates, token hash/expiry/single-use model, signed URL shape, provider stubs, preference opt-out rules, no-email skip logic, enumeration-safe reset acceptance, sanitize meta.

---

## Smoke tests (manual checklist)

- [ ] App starts (`npm run dev`)  
- [ ] Apply migration `0013` on demo DB  
- [ ] Mark payroll paid → payslip emails for employees with email  
- [ ] Employee without email → skipped in log, no send  
- [ ] Open View Payslip link → portal session + payslip  
- [ ] Expired/used link → login  
- [ ] Forgot password → email → reset → login  
- [ ] Employee without email → still uses HR PIN reset  
- [ ] `/hr/notifications` shows counts; retry failed  
- [ ] `/portal/preferences` toggles payslip email  

---

## Regression (v0.1.0)

- Phone + PIN login unchanged  
- HR assign/reset portal credentials unchanged  
- Employees without email still work  
- Portal payslips / NASSCORP / change requests unchanged  
- Payroll calculation engine untouched  
- Existing in-app notification center (`/notifications`) unchanged (separate from email log)

---

## Known limitations

- Delivery webhooks (Resend → `delivered`) not wired; status is typically `sent` / `failed` / `skipped`  
- Welcome email template exists but is not auto-sent on credential assign (can hook later)  
- Legacy company email helpers still call Resend directly in some admin/billing paths (out of employee notification scope)  
- Lint suite still reports many pre-existing errors elsewhere; new email routes are clean of those patterns where introduced  

---

## Risks

- Missing `NEXT_PUBLIC_APP_URL` in production → broken CTAs (localhost links)  
- Missing `RESEND_API_KEY` → emails skipped (safe degrade)  
- Single-use payslip link burned if session establishment fails after token consume  

---

## Future integration notes

Do **not** start v0.2.0 until this release is approved.

WhatsApp / SMS / Push: implement provider class → register → enable preferences → optional template renderer per channel. Notification logs and HR dashboard already multi-channel.

---

## Stop

v0.1.1 implementation complete. **Waiting for approval.** Do not begin v0.2.0.

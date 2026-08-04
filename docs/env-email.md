# Email / notification environment variables (v0.1.1)

Configure these on the server only. Never expose `RESEND_API_KEY` to the browser.

| Variable | Required | Purpose |
|----------|----------|---------|
| `RESEND_API_KEY` | Yes (production email) | Resend API key for transactional email |
| `RESEND_FROM_EMAIL` | Recommended | Verified sender, e.g. `Slipdesk <noreply@yourdomain.com>` |
| `NEXT_PUBLIC_APP_URL` | Yes | Public app origin used in secure payslip / reset links (no trailing slash) |
| `RESEND_PLAN_TIER` | Optional | Legacy batch payslip helper; not used by NotificationService |

## Architecture note

Business logic must call `@/lib/notifications` (`NotificationService`) only.
Do not instantiate Resend from payroll, portal, or HR routes.

## Local development

Without `RESEND_API_KEY`, email sends are **skipped** and logged as `skipped` (app continues).

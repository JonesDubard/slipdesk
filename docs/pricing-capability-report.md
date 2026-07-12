# Pricing Feature Capability Report

Generated from `src/lib/pricing/capability-matrix.ts` and executed E2E / contract tests.

## Summary

| Status | Count | Meaning |
|--------|------:|---------|
| implemented | see matrix | Real product surface |
| partial | 5 | Exists but overstated or ungated |
| missing | 4 | Claimed on pricing, no product |
| marketing-only | 5 | Support/service claims |

## Gaps (UI claim ≠ backend capability)

| Plan | Feature | Status | Action |
|------|---------|--------|--------|
| Starter | Email Support | marketing-only | Keep as service copy or move off feature list |
| Professional | Payroll Calendar | **missing** | Remove from pricing or build |
| Professional | Priority Support | marketing-only | Keep as service copy |
| Professional | Department / Branch Management | partial | Soften copy (“tags/fields”) or build CRUD |
| Professional | Bulk Payslips / Approval Workflow | ungated | Enforce `canUse` or leave as all-plan |
| Enterprise | Multi-branch Organizations | **missing** | Coming Soon |
| Enterprise | Compliance History | **missing** | Coming Soon |
| Enterprise | API Access | **missing** | Coming Soon |
| Enterprise | Custom Reports | **missing** | Coming Soon |
| Enterprise | Dedicated Onboarding / AM / Phone | marketing-only | Service copy |

## Payslip email (Task 2–3)

See chat recommendation: **ship with Resend on free/Pro tier** once domain verified — costs are low relative to plan revenue. Move to Coming Soon only if domain verification / attachment UX is not ready for this release.

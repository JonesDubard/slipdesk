import { resolveAppCompanyAccess } from "@/lib/auth/resolve-app-company";
import { can, type Role } from "@/lib/rbac";

export type PayRunStatus =
  | "draft"
  | "review"
  | "approved"
  | "locked"
  | "archived"
  | "paid";

/** Statuses where draft autosave is allowed. */
export const DRAFT_AUTOSAVE_STATUSES: PayRunStatus[] = ["draft", "review", "approved"];

/** Statuses that are finalized — never overwrite via draft save. */
export const FINALIZED_PAY_RUN_STATUSES: PayRunStatus[] = ["paid", "locked", "archived"];

export async function resolvePayrollAccess(
  userId: string,
  fallbackClient?: unknown,
) {
  return resolveAppCompanyAccess(userId, fallbackClient);
}

export function canViewPayroll(role: Role): boolean {
  return can(role, "payroll:view");
}

export function canEditPayrollDraft(role: Role): boolean {
  return can(role, "payroll:edit") || can(role, "payroll:create");
}

export function canFinalizePayroll(role: Role): boolean {
  return can(role, "payroll:release");
}

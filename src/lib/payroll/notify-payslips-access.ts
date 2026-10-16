import type { Role } from "@/lib/rbac";
import { canEditPayrollDraft, canFinalizePayroll } from "@/lib/payroll/resolve-payroll-access";

/** The person who can edit or release payroll may send that company's payslip links. */
export function canNotifyPayslips(role: Role): boolean {
  return canEditPayrollDraft(role) || canFinalizePayroll(role);
}

export type PayslipNotifyGate =
  | { proceed: true; companyId: string }
  | { proceed: false; status: 403 | 404; error: string };

/** Stop before any pay-run read or email when the caller has no single authorized company. */
export function payslipNotifyCallerGate(
  access: { companyId: string; role: Role } | null,
): PayslipNotifyGate {
  if (!access || !canNotifyPayslips(access.role)) {
    return { proceed: false, status: 403, error: "Forbidden" };
  }
  return { proceed: true, companyId: access.companyId };
}

export function paidRunInCompany(
  payRun: { companyId: string; status: string } | null,
  authorizedCompanyId: string,
): boolean {
  return Boolean(payRun && payRun.status === "paid" && payRun.companyId === authorizedCompanyId);
}

/** Every payslip recipient must be an employee of the authorized company. */
export function recipientsInCompany(
  employeeCompanyIds: readonly string[],
  expectedCount: number,
  authorizedCompanyId: string,
): boolean {
  return (
    employeeCompanyIds.length === expectedCount &&
    employeeCompanyIds.every((companyId) => companyId === authorizedCompanyId)
  );
}

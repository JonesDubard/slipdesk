import { can, type Role } from "@/lib/rbac";

/** Payroll editors and attendance managers may apply a paid run. Other roles may not. */
export function canApplyAttendance(role: Role): boolean {
  return can(role, "payroll:edit") || can(role, "attendance:manage");
}

export type AttendanceApplyGate =
  | { proceed: true; companyId: string }
  | { proceed: false; status: 403 | 404; error: string };

/**
 * Authorization before any pay-run read or write.
 * A missing or ambiguous company and a role without permission stop here.
 */
export function attendanceApplyCallerGate(
  access: { companyId: string; role: Role } | null,
): AttendanceApplyGate {
  if (!access || !canApplyAttendance(access.role)) {
    return { proceed: false, status: 403, error: "Forbidden" };
  }
  return { proceed: true, companyId: access.companyId };
}

/** A paid run is usable only when its company is the caller's resolved company. */
export function payRunInAuthorizedCompany(
  payRun: { companyId: string; status: string } | null,
  authorizedCompanyId: string,
): boolean {
  return Boolean(
    payRun &&
    payRun.status === "paid" &&
    payRun.companyId === authorizedCompanyId,
  );
}

/** Every employee on the run must belong to that same company. */
export function employeesInAuthorizedCompany(
  employeeCompanyIds: readonly string[],
  authorizedCompanyId: string,
): boolean {
  return employeeCompanyIds.every((companyId) => companyId === authorizedCompanyId);
}

/**
 * HR portal-credentials authorization helper (unit-testable).
 */
export function canManagePortalCredentials(role: string | null | undefined): boolean {
  return (
    role === "company_owner" ||
    role === "hr_manager" ||
    role === "super_admin" ||
    role === "payroll_officer" ||
    role === "admin" ||
    role === "owner"
  );
}

import { can, type Permission, type Role } from "@/lib/rbac";

export type CompanyRouteGate =
  | { proceed: true; companyId: string; role: Role }
  | { proceed: false; status: 403; error: string };

/**
 * Missing or ambiguous company access fails closed.
 * The permission is the same one the dashboard already requires for that screen.
 */
export function authorizeCompanyPermission(
  access: { companyId: string; role: Role } | null,
  permission: Permission,
  missingCompanyError = "No company",
): CompanyRouteGate {
  if (!access) return { proceed: false, status: 403, error: missingCompanyError };
  if (!can(access.role, permission)) return { proceed: false, status: 403, error: "Forbidden" };
  return { proceed: true, companyId: access.companyId, role: access.role };
}

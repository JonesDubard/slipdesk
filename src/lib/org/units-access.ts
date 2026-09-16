/**
 * Authorization for /api/org/units and /api/org/branch-summary.
 *
 * 401 = not signed in. 403 = signed in but no company membership.
 * Branch rows are always filtered to that company id — never another org.
 */

export type OrgUnitsAuthz =
  | { ok: true; companyId: string }
  | { ok: false; status: 401 | 403; error: string };

export function authorizeOrgUnitsAccess(input: {
  userId: string | null | undefined;
  companyId: string | null | undefined;
}): OrgUnitsAuthz {
  if (!input.userId) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  if (!input.companyId) {
    return { ok: false, status: 403, error: "Company not found" };
  }
  return { ok: true, companyId: input.companyId };
}

/** Query scope for GET /api/org/units?kind=branches — current org only. */
export function orgBranchListScope(companyId: string) {
  return { table: "branches" as const, companyId };
}

import type { Employee } from "@/context/AppContext";

export type BranchScope = { branchId: string | null; branchName: string | null };

/** Query param for org-wide runs (matches NULL branch_id in DB). */
export const ORG_WIDE_BRANCH_PARAM = "all";

export function parseBranchIdParam(raw: string | null): string | null | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  if (raw === ORG_WIDE_BRANCH_PARAM) return null;
  return raw;
}

export function branchScopeKey(branchId: string | null): string {
  return branchId ?? ORG_WIDE_BRANCH_PARAM;
}

export function employeeMatchesBranchName(employee: Employee, branchName: string): boolean {
  return (employee.branch ?? "").trim().toLowerCase() === branchName.trim().toLowerCase();
}

/** When branchName is null, returns all active employees (org-wide). */
export function filterEmployeesForBranchScope(
  employees: Employee[],
  branchName: string | null,
  opts: { activeOnly?: boolean } = { activeOnly: true },
): Employee[] {
  let list = employees;
  if (opts.activeOnly) list = list.filter((e) => e.isActive && !e.isArchived);
  if (!branchName) return list;
  return list.filter((e) => employeeMatchesBranchName(e, branchName));
}

export async function resolveBranchForCompany(
  admin: unknown,
  companyId: string,
  branchId: string | null,
): Promise<{ branchId: string | null; branchName: string | null } | { error: string }> {
  if (!branchId) return { branchId: null, branchName: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("branches")
    .select("id, name")
    .eq("id", branchId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Branch not found" };
  return { branchId: data.id as string, branchName: data.name as string };
}

export function applyBranchFilterToQuery(
  query: { is: (col: string, val: null) => unknown; eq: (col: string, val: string) => unknown },
  branchId: string | null | undefined,
) {
  if (branchId === undefined) return query;
  if (branchId === null) return query.is("branch_id", null);
  return query.eq("branch_id", branchId);
}

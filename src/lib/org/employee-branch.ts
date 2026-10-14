import { normalizeBranchKey } from "@/lib/csv/resolve-branch";

export const UNASSIGNED_BRANCH_FILTER = "__unassigned__";

export type OrgBranchRef = { id: string; name: string };

export type NamedCompanyBranch = {
  id: string;
  companyId: string;
  name: string;
};

export type EmployeeBranchFields = {
  branchId?: string | null;
  branch?: string | null;
};

/** Match employee.branch text to a branch in the same company (trim, case-insensitive). */
export function matchEmployeeBranchToOrg(
  employee: { companyId: string; branch?: string | null },
  branches: NamedCompanyBranch[],
): NamedCompanyBranch | null {
  const key = normalizeBranchKey(employee.branch);
  if (!key) return null;
  return (
    branches.find(
      (b) => b.companyId === employee.companyId && normalizeBranchKey(b.name) === key,
    ) ?? null
  );
}

/**
 * Distinct (company, name) values on employees that are not yet org units.
 * Never matches across companies.
 */
export function branchesMissingFromOrg(
  employees: Array<{ companyId: string; branch?: string | null }>,
  branches: Array<{ companyId: string; name: string }>,
): Array<{ companyId: string; name: string }> {
  const existing = new Set(
    branches.map((b) => `${b.companyId}::${normalizeBranchKey(b.name)}`),
  );
  const seen = new Set<string>();
  const missing: Array<{ companyId: string; name: string }> = [];
  for (const e of employees) {
    const trimmed = (e.branch ?? "").trim();
    if (!trimmed) continue;
    const key = `${e.companyId}::${normalizeBranchKey(trimmed)}`;
    if (seen.has(key) || existing.has(key)) continue;
    seen.add(key);
    missing.push({ companyId: e.companyId, name: trimmed });
  }
  return missing;
}

export function assignBranchFromOrg(
  employeeCompanyId: string,
  branchId: string | null | undefined,
  orgBranches: NamedCompanyBranch[],
): { ok: true; branchId: string | null; branch: string } | { ok: false; error: string } {
  if (!branchId) return { ok: true, branchId: null, branch: "" };
  const found = orgBranches.find((b) => b.id === branchId);
  if (!found) return { ok: false, error: "Branch not found" };
  if (found.companyId !== employeeCompanyId) {
    return { ok: false, error: "Branch belongs to another company" };
  }
  return { ok: true, branchId: found.id, branch: found.name };
}

/** Blank / Unassigned → null id and ''. Prefer id; fall back to same-company name match. */
export function syncBranchAssignment(
  input: EmployeeBranchFields,
  orgBranches: OrgBranchRef[],
): { branchId: string | null; branch: string } {
  if (input.branchId) {
    const found = orgBranches.find((b) => b.id === input.branchId);
    if (found) return { branchId: found.id, branch: found.name };
    const name = (input.branch ?? "").trim();
    return { branchId: input.branchId, branch: name };
  }
  const name = (input.branch ?? "").trim();
  if (!name) return { branchId: null, branch: "" };
  const found = orgBranches.find((b) => normalizeBranchKey(b.name) === normalizeBranchKey(name));
  if (found) return { branchId: found.id, branch: found.name };
  return { branchId: null, branch: name };
}

export function applyOrgBranchToEmployee<T extends EmployeeBranchFields>(
  data: T,
  orgBranches: OrgBranchRef[],
): T {
  const synced = syncBranchAssignment(data, orgBranches);
  return { ...data, branchId: synced.branchId, branch: synced.branch };
}

/**
 * Filter by org branch UUID. Unassigned = null id (and blank name).
 * During transition, employees with a missing id still match by canonical name.
 */
export function employeeMatchesBranchFilter(
  employee: EmployeeBranchFields,
  filter: string,
  orgBranches: OrgBranchRef[] = [],
): boolean {
  if (!filter || filter === "All") return true;
  if (filter === UNASSIGNED_BRANCH_FILTER) {
    if (employee.branchId) return false;
    return !normalizeBranchKey(employee.branch);
  }
  if (employee.branchId) return employee.branchId === filter;
  const org = orgBranches.find((b) => b.id === filter);
  if (!org) return false;
  return normalizeBranchKey(employee.branch) === normalizeBranchKey(org.name);
}

export type BranchSummaryEmployee = {
  branchId?: string | null;
  isActive?: boolean;
  isArchived?: boolean;
  basicSalary?: number | null;
  rate?: number | null;
};

/** Existing money semantics: basic_salary || rate. */
export function salaryMassForEmployee(e: {
  basicSalary?: number | null;
  rate?: number | null;
}): number {
  return Number(e.basicSalary) || Number(e.rate) || 0;
}

export function aggregateByBranchId(
  branches: Array<{ id: string; name: string; code?: string | null; isHq?: boolean }>,
  employees: BranchSummaryEmployee[],
): {
  branches: Array<{
    id: string;
    name: string;
    code: string | null;
    isHq: boolean;
    employees: number;
    salaryMass: number;
  }>;
  unassigned: number;
  unassignedSalaryMass: number;
  totalActive: number;
} {
  const active = employees.filter((e) => e.isActive !== false && !e.isArchived);
  const summary = branches.map((b) => {
    const members = active.filter((e) => e.branchId === b.id);
    return {
      id: b.id,
      name: b.name,
      code: b.code ?? null,
      isHq: Boolean(b.isHq),
      employees: members.length,
      salaryMass: members.reduce((s, e) => s + salaryMassForEmployee(e), 0),
    };
  });
  const unassignedMembers = active.filter((e) => !e.branchId);
  return {
    branches: summary,
    unassigned: unassignedMembers.length,
    unassignedSalaryMass: unassignedMembers.reduce((s, e) => s + salaryMassForEmployee(e), 0),
    totalActive: active.length,
  };
}

export type BranchLookup = {
  getById: (id: string) => Promise<NamedCompanyBranch | null>;
  listByCompany: (companyId: string) => Promise<NamedCompanyBranch[]>;
};

/**
 * App/API write path: verify branch_id belongs to this company, sync canonical name.
 * Blank / Unassigned → NULL id and ''.
 */
export async function resolveEmployeeBranchWrite(
  companyId: string,
  data: EmployeeBranchFields,
  lookup: BranchLookup,
): Promise<{ branch_id: string | null; branch: string } | Record<string, never>> {
  if (data.branchId === undefined && data.branch === undefined) return {};

  if (data.branchId) {
    const row = await lookup.getById(data.branchId);
    const assigned = assignBranchFromOrg(companyId, data.branchId, row ? [row] : []);
    if (!assigned.ok) throw new Error(assigned.error);
    return { branch_id: assigned.branchId, branch: assigned.branch };
  }

  const org = await lookup.listByCompany(companyId);
  const synced = syncBranchAssignment(
    { branchId: null, branch: data.branch },
    org.map((b) => ({ id: b.id, name: b.name })),
  );
  return { branch_id: synced.branchId, branch: synced.branch };
}

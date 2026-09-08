/**
 * Organization ↔ Branch ↔ Employee matching.
 *
 * Employees store a text `branch` value that must match a registered
 * `branches.name`. There is no employees.branch_id FK; lookups are by
 * trimmed, case-insensitive name so "Sinkor" and "sinkor" resolve to one branch.
 */

export const ALL_BRANCH_FILTER = "All";
export const UNASSIGNED_BRANCH_FILTER = "Unassigned";

export interface RegisteredBranch {
  id: string;
  name: string;
  code?: string | null;
  is_hq?: boolean;
  isHq?: boolean;
}

export function normalizeBranchKey(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function canonicalBranchName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function employeeMatchesBranchName(
  employee: { branch?: string | null },
  branchName: string,
): boolean {
  return normalizeBranchKey(employee.branch) === normalizeBranchKey(branchName);
}

export function matchRegisteredBranch<T extends { name: string }>(
  registered: T[],
  raw: string | null | undefined,
): T | null {
  const key = normalizeBranchKey(raw);
  if (!key) return null;
  return registered.find((b) => normalizeBranchKey(b.name) === key) ?? null;
}

export type ImportedBranchResolution =
  | { status: "unassigned"; branchName: "" }
  | { status: "matched"; branchName: string; branchId: string }
  | { status: "free_text"; branchName: string }
  | { status: "unknown"; branchName: ""; warning: string };

export function resolveImportedBranch(
  raw: string | null | undefined,
  registered: RegisteredBranch[],
): ImportedBranchResolution {
  const trimmed = canonicalBranchName(raw ?? "");
  if (!trimmed) return { status: "unassigned", branchName: "" };

  const match = matchRegisteredBranch(registered, trimmed);
  if (match) {
    return {
      status: "matched",
      branchName: canonicalBranchName(match.name),
      branchId: match.id,
    };
  }

  if (registered.length === 0) {
    return { status: "free_text", branchName: trimmed };
  }

  return {
    status: "unknown",
    branchName: "",
    warning: `Branch "${trimmed}" is not registered. Add it on Organization first, or leave Branch blank for Unassigned.`,
  };
}

export function isUnassignedEmployeeBranch(
  employeeBranch: string | null | undefined,
  registered: { name: string }[],
): boolean {
  const key = normalizeBranchKey(employeeBranch);
  if (!key) return true;
  if (registered.length === 0) return false;
  return !registered.some((b) => normalizeBranchKey(b.name) === key);
}

export function employeeMatchesBranchFilter(
  employeeBranch: string | null | undefined,
  filter: string,
  registered: { name: string }[],
): boolean {
  if (!filter || filter === ALL_BRANCH_FILTER) return true;
  if (filter === UNASSIGNED_BRANCH_FILTER) {
    return isUnassignedEmployeeBranch(employeeBranch, registered);
  }
  return employeeMatchesBranchName({ branch: employeeBranch }, filter);
}

export function branchFilterOptions(
  registered: { name: string }[],
  employees: { branch?: string | null }[],
): string[] {
  const display = new Map<string, string>();
  for (const b of registered) {
    const key = normalizeBranchKey(b.name);
    if (key) display.set(key, canonicalBranchName(b.name));
  }
  if (registered.length === 0) {
    for (const e of employees) {
      const key = normalizeBranchKey(e.branch);
      if (key && !display.has(key)) display.set(key, canonicalBranchName(e.branch ?? ""));
    }
  }
  const names = [...display.values()].sort((a, b) => a.localeCompare(b));
  return [ALL_BRANCH_FILTER, UNASSIGNED_BRANCH_FILTER, ...names];
}

/** Current employee compensation used as Organization "salary mass" (not a pay-run total). */
export function employeeSalaryMass(e: {
  rate?: number | null;
  basic_salary?: number | null;
}): number {
  return Number(e.basic_salary) || Number(e.rate) || 0;
}

export interface BranchSummaryRow {
  id: string;
  name: string;
  code: string | null;
  isHq: boolean;
  employees: number;
  salaryMass: number;
}

export interface BranchSummaryResult {
  branches: BranchSummaryRow[];
  unassigned: number;
  unassignedSalaryMass: number;
  totalActive: number;
}

export function summarizeRegisteredBranches(
  branches: RegisteredBranch[],
  employees: {
    branch?: string | null;
    is_active?: boolean;
    isActive?: boolean;
    is_archived?: boolean;
    isArchived?: boolean;
    rate?: number | null;
    basic_salary?: number | null;
  }[],
): BranchSummaryResult {
  const active = employees.filter((e) => {
    const isActive = e.isActive ?? e.is_active;
    const isArchived = e.isArchived ?? e.is_archived;
    return isActive !== false && !isArchived;
  });

  const summary = branches.map((b) => {
    const members = active.filter((e) => employeeMatchesBranchName(e, b.name));
    return {
      id: b.id,
      name: b.name,
      code: b.code ?? null,
      isHq: Boolean(b.isHq ?? b.is_hq),
      employees: members.length,
      salaryMass: members.reduce((s, e) => s + employeeSalaryMass(e), 0),
    };
  });

  const unassignedMembers = active.filter((e) => isUnassignedEmployeeBranch(e.branch, branches));

  return {
    branches: summary,
    unassigned: unassignedMembers.length,
    unassignedSalaryMass: unassignedMembers.reduce((s, e) => s + employeeSalaryMass(e), 0),
    totalActive: active.length,
  };
}

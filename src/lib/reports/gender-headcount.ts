import type { Employee } from "@/context/AppContext";
import type { Cell } from "@/lib/reporting";

/** Stored gender keys plus blank (unspecified). Do not change `employee-gender.ts`. */
export const GENDER_HEADCOUNT_KEYS = [
  "male",
  "female",
  "other",
  "prefer_not_to_say",
  "",
] as const;

export type GenderHeadcountKey = (typeof GENDER_HEADCOUNT_KEYS)[number];

export interface GenderHeadcountRow {
  key: GenderHeadcountKey;
  label: string;
  count: number;
  percent: number;
}

export interface GenderBranchHeadcount {
  branch: string;
  total: number;
  rows: GenderHeadcountRow[];
}

export function genderHeadcountLabel(key: string): string {
  switch (key) {
    case "male":
      return "Male";
    case "female":
      return "Female";
    case "other":
      return "Other";
    case "prefer_not_to_say":
      return "Prefer not to say";
    default:
      return "Unspecified";
  }
}

export function bucketGender(raw: string | null | undefined): GenderHeadcountKey {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "male" || v === "female" || v === "other" || v === "prefer_not_to_say") return v;
  return "";
}

export function summarizeGenderHeadcount(employees: Employee[]): GenderHeadcountRow[] {
  const counts = new Map<GenderHeadcountKey, number>(
    GENDER_HEADCOUNT_KEYS.map((k) => [k, 0]),
  );
  for (const e of employees) {
    const key = bucketGender(e.gender);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = employees.length;
  return GENDER_HEADCOUNT_KEYS.map((key) => {
    const count = counts.get(key) ?? 0;
    return {
      key,
      label: genderHeadcountLabel(key),
      count,
      percent: total === 0 ? 0 : Math.round((count / total) * 1000) / 10,
    };
  });
}

export function genderHeadcountByBranch(employees: Employee[]): GenderBranchHeadcount[] {
  const byBranch = new Map<string, Employee[]>();
  for (const e of employees) {
    const branch = (e.branch ?? "").trim() || "Unassigned";
    const list = byBranch.get(branch) ?? [];
    list.push(e);
    byBranch.set(branch, list);
  }
  return [...byBranch.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([branch, list]) => ({
      branch,
      total: list.length,
      rows: summarizeGenderHeadcount(list),
    }));
}

export function genderSummaryExportRows(rows: GenderHeadcountRow[], total: number): Cell[][] {
  return [
    ...rows.map((r) => [r.label, r.count, `${r.percent}%`]),
    ["Total", total, total === 0 ? "0%" : "100%"],
  ];
}

export function genderDetailExportRows(employees: Employee[]): Cell[][] {
  return [...employees]
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .map((e) => [
      e.employeeNumber || "—",
      e.fullName || [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" "),
      genderHeadcountLabel(bucketGender(e.gender)),
      (e.branch ?? "").trim() || "Unassigned",
      e.department || "—",
    ]);
}

export function genderByBranchExportRows(groups: GenderBranchHeadcount[]): Cell[][] {
  const out: Cell[][] = [];
  for (const g of groups) {
    for (const r of g.rows) {
      if (r.count === 0) continue;
      out.push([g.branch, r.label, r.count, `${r.percent}%`]);
    }
    out.push([g.branch, "Total", g.total, "100%"]);
  }
  return out;
}

export const GENDER_SUMMARY_HEADERS = ["Gender", "Count", "Share"];
export const GENDER_DETAIL_HEADERS = ["Employee #", "Name", "Gender", "Branch", "Department"];
export const GENDER_BY_BRANCH_HEADERS = ["Branch", "Gender", "Count", "Share"];

export type GenderExportScope = "view" | "all" | `branch:${string}`;

export function employeesForGenderExport(
  scope: string,
  viewed: Employee[],
  allActive: Employee[],
): Employee[] {
  if (scope === "all") return allActive;
  if (scope.startsWith("branch:")) {
    const name = scope.slice("branch:".length);
    return allActive.filter((e) => (e.branch ?? "") === name);
  }
  return viewed;
}

export function genderExportScopeLabel(scope: string, branchFilter: string): string {
  if (scope === "all") return "All branches (consolidated)";
  if (scope.startsWith("branch:")) return `Branch — ${scope.slice("branch:".length)}`;
  if (branchFilter === "All") return "Current view — all branches";
  return `Current view — ${branchFilter}`;
}

export function buildGenderHeadcountCsv(opts: {
  scopeLabel: string;
  employees: Employee[];
  includeByBranch: boolean;
}): { headers: string[]; rows: Cell[][] } {
  const summary = summarizeGenderHeadcount(opts.employees);
  const rows: Cell[][] = [
    ["Internal headcount export — not a certified labor filing format"],
    ["Scope", opts.scopeLabel],
    ["Employees", opts.employees.length],
    [],
    ["Counts by gender"],
    GENDER_SUMMARY_HEADERS,
    ...genderSummaryExportRows(summary, opts.employees.length),
    [],
    ["Employee list"],
    GENDER_DETAIL_HEADERS,
    ...genderDetailExportRows(opts.employees),
  ];
  if (opts.includeByBranch) {
    rows.push(
      [],
      ["By branch"],
      GENDER_BY_BRANCH_HEADERS,
      ...genderByBranchExportRows(genderHeadcountByBranch(opts.employees)),
    );
  }
  return { headers: ["Gender Headcount"], rows };
}

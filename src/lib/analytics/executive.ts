/**
 * Pure aggregations for the Enterprise executive analytics endpoint.
 */

export interface ExecEmployeeRow {
  id: string;
  department?: string | null;
  branch?: string | null;
  county?: string | null;
  is_active?: boolean | null;
  is_archived?: boolean | null;
  basic_salary?: number | null;
  currency?: string | null;
}

export interface ExecPayRunRow {
  id: string;
  status?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  created_at?: string | null;
  total_gross?: number | null;
  total_net?: number | null;
}

export interface ExecutiveMetrics {
  companyName: string;
  headcount: {
    total: number;
    active: number;
    departments: number;
    branches: number;
  };
  payroll: {
    latestGross: number;
    latestNet: number;
    runCount: number;
    approvedOrPaid: number;
  };
  byDepartment: { name: string; employees: number; salaryMass: number }[];
  byBranch: { name: string; employees: number }[];
  trend: { label: string; gross: number; headcount: number }[];
}

export function aggregateExecutiveMetrics(input: {
  companyName: string;
  employees: ExecEmployeeRow[];
  payRuns: ExecPayRunRow[];
}): ExecutiveMetrics {
  const active = input.employees.filter((e) => e.is_active !== false && !e.is_archived);
  const depts = new Map<string, { employees: number; salaryMass: number }>();
  const branches = new Map<string, number>();

  for (const e of active) {
    const d = (e.department || "Unassigned").trim() || "Unassigned";
    const prev = depts.get(d) ?? { employees: 0, salaryMass: 0 };
    prev.employees += 1;
    prev.salaryMass += Number(e.basic_salary) || 0;
    depts.set(d, prev);

    const b = (e.branch || e.county || "Unassigned").trim() || "Unassigned";
    branches.set(b, (branches.get(b) ?? 0) + 1);
  }

  const latest = input.payRuns[0];
  const approvedOrPaid = input.payRuns.filter((r) =>
    ["approved", "paid", "locked", "released"].includes(String(r.status ?? "")),
  ).length;

  const trend = input.payRuns
    .slice(0, 6)
    .reverse()
    .map((r, i) => ({
      label: r.period_end?.slice(0, 7) || r.created_at?.slice(0, 7) || `Run ${i + 1}`,
      gross: Number(r.total_gross) || 0,
      headcount: active.length,
    }));

  // If no historical runs, still return a single current snapshot point.
  if (!trend.length) {
    const salaryMass = active.reduce((s, e) => s + (Number(e.basic_salary) || 0), 0);
    trend.push({ label: "Current", gross: salaryMass, headcount: active.length });
  }

  return {
    companyName: input.companyName,
    headcount: {
      total: input.employees.length,
      active: active.length,
      departments: depts.size,
      branches: branches.size,
    },
    payroll: {
      latestGross: Number(latest?.total_gross) || 0,
      latestNet: Number(latest?.total_net) || 0,
      runCount: input.payRuns.length,
      approvedOrPaid,
    },
    byDepartment: [...depts.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.salaryMass - a.salaryMass),
    byBranch: [...branches.entries()]
      .map(([name, employees]) => ({ name, employees }))
      .sort((a, b) => b.employees - a.employees),
    trend,
  };
}

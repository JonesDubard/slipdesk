"use client";

import { useMemo, useState } from "react";
import {
  FileBarChart, Users, Building2, Landmark, ShieldCheck, TrendingUp,
  FileText, FileSpreadsheet, FileDown, Lock,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { getEffectiveTier, canUse, PLAN_LABELS } from "@/lib/plan-features";
import { can } from "@/lib/rbac";
import {
  computePayroll, sumTotals, groupByDepartment, fmtUSD, fmtMoney,
  downloadCSV, downloadExcel, type Cell, type EmployeePayroll, type PayrollTotals,
  CUSTOM_REPORT_COLUMNS, buildCustomReport, type CustomReportColumn,
} from "@/lib/reporting";
import { downloadReportPdf, type ReportSection } from "@/components/ReportPDF";
import {
  ModuleShell, ModuleHeader, Card, UpgradeNotice, btnGhost,
} from "@/components/module-ui";

type ExportKind = "pdf" | "excel" | "csv";

interface ReportDef {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  /** Requires departmentReports feature (Professional+). */
  proOnly?: boolean;
  build: (rows: EmployeePayroll[], totals: PayrollTotals) => {
    headers: string[];
    dataRows: Cell[][];
    total?: Cell[];
    sections: ReportSection[];
  };
}

export default function ReportsPage() {
  const { employees, company, role } = useApp();
  const effectiveTier = getEffectiveTier(company.subscriptionTier, company.billingBypass);
  const [busy, setBusy] = useState<string | null>(null);
  const [customCols, setCustomCols] = useState<CustomReportColumn[]>([
    "employeeNumber", "fullName", "department", "gross", "net",
  ]);
  const [customGroup, setCustomGroup] = useState<"department" | "branch" | "">("");

  const active = useMemo(() => employees.filter((e) => e.isActive && !e.isArchived), [employees]);
  const rows = useMemo(() => computePayroll(active), [active]);
  const totals = useMemo(() => sumTotals(rows), [rows]);

  const period = new Date().toLocaleString("default", { month: "long", year: "numeric" });
  const companyMeta = [
    { label: "Company", value: company.name || "—" },
    { label: "Period", value: period },
    { label: "Employees", value: String(active.length) },
    { label: "Gross (USD)", value: fmtUSD(totals.gross) },
  ];

  if (!can(role, "report:view")) {
    return (
      <UpgradeNotice title="Reporting Center" requiredPlan="an authorized"
        description="Your role does not have access to reports." />
    );
  }

  const canExport = can(role, "report:export");
  const hasDeptReports = canUse("departmentReports", effectiveTier);
  const hasCustom = canUse("customReports", effectiveTier);

  function toggleCol(id: CustomReportColumn) {
    setCustomCols((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  async function exportCustom(kind: ExportKind) {
    setBusy(`custom-${kind}`);
    try {
      const built = buildCustomReport(rows, customCols, customGroup || null);
      const fname = `Custom_Report_${period.replace(/\s+/g, "_")}`;
      if (kind === "csv") downloadCSV(fname, built.headers, built.dataRows);
      else if (kind === "excel") downloadExcel(fname, [{ name: "Custom", headers: built.headers, rows: built.dataRows }]);
      else {
        await downloadReportPdf({
          title: "Custom Payroll Report",
          subtitle: period,
          companyName: company.name,
          meta: companyMeta,
          sections: [{
            heading: customGroup ? `Grouped by ${customGroup}` : "Custom columns",
            columns: built.headers.map((h) => ({ header: h, width: 1.2 })),
            rows: built.dataRows.map((r) => r.map(String)),
          }],
        }, fname);
      }
    } finally {
      setBusy(null);
    }
  }

  const REPORTS: ReportDef[] = [
    {
      id: "payroll-register", title: "Payroll Register", icon: <Users size={16} />,
      description: "Every employee with gross, deductions and net pay.",
      build: (rws, tot) => {
        const headers = ["Emp #", "Name", "Dept", "CCY", "Gross", "Income Tax", "NASSCORP EE", "Net"];
        const dataRows: Cell[][] = rws.map((r) => [
          r.employee.employeeNumber, r.employee.fullName, r.employee.department || "—", r.employee.currency,
          fmtMoney(r.result.grossPay, r.employee.currency),
          fmtMoney(r.result.Paye.taxInBase, r.employee.currency),
          fmtMoney(r.result.nasscorp.employeeContribution, r.employee.currency),
          fmtMoney(r.result.netPay, r.employee.currency),
        ]);
        const total: Cell[] = ["", "TOTAL (USD)", "", "", fmtUSD(tot.gross), fmtUSD(tot.incomeTax), fmtUSD(tot.nasscorpEe), fmtUSD(tot.net)];
        return {
          headers, dataRows, total,
          sections: [{
            heading: "Payroll Register",
            columns: [
              { header: "Emp #", width: 0.9 }, { header: "Name", width: 1.8 }, { header: "Dept", width: 1.2 },
              { header: "CCY", width: 0.5 }, { header: "Gross", width: 1, align: "right" },
              { header: "Tax", width: 1, align: "right" }, { header: "NASSCORP", width: 1, align: "right" },
              { header: "Net", width: 1, align: "right" },
            ],
            rows: dataRows, totalRow: total,
          }],
        };
      },
    },
    {
      id: "department-report", title: "Department Payroll Report", icon: <Building2 size={16} />, proOnly: true,
      description: "Cost and headcount grouped by department.",
      build: (rws) => {
        const groups = groupByDepartment(rws);
        const headers = ["Department", "Employees", "Gross (USD)", "Net (USD)"];
        const dataRows: Cell[][] = groups.map((g) => [g.key, g.employees, fmtUSD(g.gross), fmtUSD(g.net)]);
        const total: Cell[] = ["TOTAL", groups.reduce((s, g) => s + g.employees, 0), fmtUSD(groups.reduce((s, g) => s + g.gross, 0)), fmtUSD(groups.reduce((s, g) => s + g.net, 0))];
        return {
          headers, dataRows, total,
          sections: [{
            heading: "Department Breakdown",
            columns: [{ header: "Department", width: 2 }, { header: "Employees", width: 1, align: "right" }, { header: "Gross", width: 1.2, align: "right" }, { header: "Net", width: 1.2, align: "right" }],
            rows: dataRows, totalRow: total,
          }],
        };
      },
    },
    {
      id: "earnings", title: "Employee Earnings Report", icon: <TrendingUp size={16} />,
      description: "Per-employee earnings breakdown (base, allowances, gross).",
      build: (rws) => {
        const headers = ["Emp #", "Name", "CCY", "Base", "Allowances", "Gross", "Net"];
        const dataRows: Cell[][] = rws.map((r) => [
          r.employee.employeeNumber, r.employee.fullName, r.employee.currency,
          fmtMoney(r.result.regularSalary, r.employee.currency),
          fmtMoney(r.result.additionalEarnings, r.employee.currency),
          fmtMoney(r.result.grossPay, r.employee.currency),
          fmtMoney(r.result.netPay, r.employee.currency),
        ]);
        return {
          headers, dataRows,
          sections: [{
            heading: "Employee Earnings",
            columns: [
              { header: "Emp #", width: 0.9 }, { header: "Name", width: 1.8 }, { header: "CCY", width: 0.5 },
              { header: "Base", width: 1, align: "right" }, { header: "Allow.", width: 1, align: "right" },
              { header: "Gross", width: 1, align: "right" }, { header: "Net", width: 1, align: "right" },
            ],
            rows: dataRows,
          }],
        };
      },
    },
    {
      id: "tax-summary", title: "Tax Summary", icon: <Landmark size={16} />,
      description: "LRA income tax withheld across the workforce.",
      build: (rws, tot) => {
        const headers = ["Emp #", "Name", "CCY", "Taxable (LRD)", "Effective %", "Income Tax"];
        const dataRows: Cell[][] = rws.map((r) => [
          r.employee.employeeNumber, r.employee.fullName, r.employee.currency,
          fmtMoney(r.result.Paye.grossInLRD, "LRD"),
          `${(r.result.Paye.effectiveRate * 100).toFixed(1)}%`,
          fmtMoney(r.result.Paye.taxInBase, r.employee.currency),
        ]);
        const total: Cell[] = ["", "TOTAL (USD)", "", "", "", fmtUSD(tot.incomeTax)];
        return {
          headers, dataRows, total,
          sections: [{
            heading: "LRA Tax Summary",
            columns: [
              { header: "Emp #", width: 0.9 }, { header: "Name", width: 2 }, { header: "CCY", width: 0.6 },
              { header: "Taxable (LRD)", width: 1.3, align: "right" }, { header: "Eff %", width: 0.8, align: "right" },
              { header: "Income Tax", width: 1.2, align: "right" },
            ],
            rows: dataRows, totalRow: total,
          }],
        };
      },
    },
    {
      id: "nasscorp-summary", title: "NASSCORP Summary", icon: <ShieldCheck size={16} />,
      description: "Employee (4%) and employer (6%) contributions.",
      build: (rws, tot) => {
        const headers = ["Emp #", "Name", "NASSCORP #", "Base", "EE 4%", "ER 6%", "Total"];
        const dataRows: Cell[][] = rws.map((r) => [
          r.employee.employeeNumber, r.employee.fullName, r.employee.nasscorpNumber || "MISSING",
          fmtMoney(r.result.nasscorp.base, r.employee.currency),
          fmtMoney(r.result.nasscorp.employeeContribution, r.employee.currency),
          fmtMoney(r.result.nasscorp.employerContribution, r.employee.currency),
          fmtMoney(r.result.nasscorp.employeeContribution + r.result.nasscorp.employerContribution, r.employee.currency),
        ]);
        const total: Cell[] = ["", "TOTAL (USD)", "", "", fmtUSD(tot.nasscorpEe), fmtUSD(tot.nasscorpEr), fmtUSD(tot.nasscorpEe + tot.nasscorpEr)];
        return {
          headers, dataRows, total,
          sections: [{
            heading: "NASSCORP Contributions",
            columns: [
              { header: "Emp #", width: 0.9 }, { header: "Name", width: 1.7 }, { header: "NASSCORP #", width: 1.3 },
              { header: "EE 4%", width: 1, align: "right" }, { header: "ER 6%", width: 1, align: "right" },
              { header: "Total", width: 1, align: "right" },
            ],
            rows: rws.map((r) => [
              r.employee.employeeNumber, r.employee.fullName, r.employee.nasscorpNumber || "MISSING",
              fmtMoney(r.result.nasscorp.employeeContribution, r.employee.currency),
              fmtMoney(r.result.nasscorp.employerContribution, r.employee.currency),
              fmtMoney(r.result.nasscorp.employeeContribution + r.result.nasscorp.employerContribution, r.employee.currency),
            ]),
            totalRow: ["", "TOTAL (USD)", "", fmtUSD(tot.nasscorpEe), fmtUSD(tot.nasscorpEr), fmtUSD(tot.nasscorpEe + tot.nasscorpEr)],
          }],
        };
      },
    },
  ];

  async function runExport(def: ReportDef, kind: ExportKind) {
    setBusy(`${def.id}-${kind}`);
    try {
      const built = def.build(rows, totals);
      const fname = `${def.title.replace(/\s+/g, "_")}_${period.replace(/\s+/g, "_")}`;
      if (kind === "csv") {
        downloadCSV(fname, built.headers, built.total ? [...built.dataRows, built.total] : built.dataRows);
      } else if (kind === "excel") {
        downloadExcel(fname, [{ name: def.title, headers: built.headers, rows: built.total ? [...built.dataRows, built.total] : built.dataRows }]);
      } else {
        await downloadReportPdf({ title: def.title, subtitle: period, companyName: company.name, meta: companyMeta, sections: built.sections }, fname);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <ModuleShell>
      <ModuleHeader title="Reporting Center" subtitle={`${period} · export to PDF, Excel or CSV`} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {REPORTS.map((def) => {
          const locked = def.proOnly && !hasDeptReports;
          return (
            <Card key={def.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                  background: "color-mix(in oklch, var(--primary) 15%, transparent)",
                  border: "1px solid color-mix(in oklch, var(--primary) 35%, transparent)",
                  display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)",
                }}>
                  {def.icon}
                </div>
                <div>
                  <p style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 14, margin: 0 }}>{def.title}</p>
                  <p style={{ color: "var(--muted-foreground)", fontSize: 11, margin: "2px 0 0" }}>{def.description}</p>
                </div>
              </div>

              {locked ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: "color-mix(in oklch, var(--primary) 8%, transparent)", border: "1px solid var(--border)" }}>
                  <Lock size={14} color="var(--muted-foreground)" />
                  <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Included in {PLAN_LABELS.standard}+</span>
                </div>
              ) : !canExport ? (
                <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>View only — your role cannot export.</span>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => runExport(def, "pdf")} disabled={!!busy} style={btnGhost()}><FileText size={14} /> PDF</button>
                  <button onClick={() => runExport(def, "excel")} disabled={!!busy} style={btnGhost()}><FileSpreadsheet size={14} /> Excel</button>
                  <button onClick={() => runExport(def, "csv")} disabled={!!busy} style={btnGhost()}><FileDown size={14} /> CSV</button>
                  {busy?.startsWith(def.id) && <span style={{ fontSize: 12, color: "var(--muted-foreground)", alignSelf: "center" }}>Generating…</span>}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card style={{ marginTop: 16 }} data-testid="custom-report-builder">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <FileBarChart size={16} color="var(--primary)" />
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Custom report builder</h3>
        </div>
        {!hasCustom ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: "color-mix(in oklch, var(--primary) 8%, transparent)", border: "1px solid var(--border)" }}>
            <Lock size={14} color="var(--muted-foreground)" />
            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Custom column reports are included in {PLAN_LABELS.premium}.</span>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "0 0 10px" }}>Pick columns and optional grouping, then export.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {CUSTOM_REPORT_COLUMNS.map((c) => (
                <label key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer" }}>
                  <input type="checkbox" checked={customCols.includes(c.id)} onChange={() => toggleCol(c.id)} />
                  {c.label}
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={customGroup}
                onChange={(e) => setCustomGroup(e.target.value as "" | "department" | "branch")}
                style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--background)", fontSize: 12 }}
              >
                <option value="">No grouping</option>
                <option value="department">Group by department</option>
                <option value="branch">Group by branch</option>
              </select>
              {canExport && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => exportCustom("pdf")} disabled={!!busy || customCols.length === 0} style={btnGhost()}><FileText size={14} /> PDF</button>
                  <button onClick={() => exportCustom("excel")} disabled={!!busy || customCols.length === 0} style={btnGhost()}><FileSpreadsheet size={14} /> Excel</button>
                  <button onClick={() => exportCustom("csv")} disabled={!!busy || customCols.length === 0} style={btnGhost()}><FileDown size={14} /> CSV</button>
                </div>
              )}
            </div>
          </>
        )}
      </Card>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, color: "var(--muted-foreground)" }}>
        <FileBarChart size={14} />
        <span style={{ fontSize: 12 }}>Reports are computed from your active employees for the current period. Historical period selection arrives with the payroll periods module.</span>
      </div>
    </ModuleShell>
  );
}

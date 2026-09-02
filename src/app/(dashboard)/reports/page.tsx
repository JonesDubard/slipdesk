"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FileBarChart, Users, Building2, Landmark, ShieldCheck, TrendingUp,
  FileText, FileSpreadsheet, FileDown, Lock, Wallet,
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
  disbursementReportHeaders,
  disbursementReportRows,
  bankDisbursementHeaders,
  bankDisbursementRows,
  mobileMoneyDisbursementHeaders,
  mobileMoneyDisbursementRows,
  rowsFromFinalizedPayroll,
} from "@/lib/reports/disbursement";
import {
  lraExportHeaders,
  lraExportRowsFromFinalized,
  nasscorpExportHeaders,
  nasscorpExportRowsFromFinalized,
  type FinalizedPayrollLine,
} from "@/lib/compliance/statutory-exports";
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
  /** Disbursement / statutory exports require a finalized pay run. */
  requiresFinalized?: boolean;
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
  const [paidRuns, setPaidRuns] = useState<Array<{
    id: string;
    period_label: string;
    branch_id?: string | null;
    branches?: { name: string } | { name: string }[] | null;
  }>>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [finalizedLines, setFinalizedLines] = useState<FinalizedPayrollLine[] | null>(null);

  useEffect(() => {
    void fetch("/api/payroll/runs?finalized=true")
      .then((r) => r.json())
      .then((d) => setPaidRuns(d.runs ?? []))
      .catch(() => setPaidRuns([]));
  }, []);

  const consolidatedPeriods = useMemo(() => {
    const byPeriod = new Map<string, number>();
    for (const run of paidRuns) {
      byPeriod.set(run.period_label, (byPeriod.get(run.period_label) ?? 0) + 1);
    }
    return [...byPeriod.entries()].filter(([, count]) => count > 1).map(([label]) => label);
  }, [paidRuns]);

  function runOptionLabel(run: (typeof paidRuns)[0]): string {
    const branchJoin = run.branches;
    const branchName = Array.isArray(branchJoin)
      ? branchJoin[0]?.name
      : branchJoin?.name;
    const scope = branchName ?? (run.branch_id ? "Branch" : "All branches");
    return `${run.period_label} — ${scope}`;
  }

  useEffect(() => {
    if (!selectedRunId) {
      setFinalizedLines(null);
      return;
    }
    if (selectedRunId.startsWith("consolidated:")) {
      const period = selectedRunId.slice("consolidated:".length);
      void fetch(`/api/payroll/runs/consolidated?periodLabel=${encodeURIComponent(period)}`)
        .then((r) => r.json())
        .then((d) => setFinalizedLines(d.finalizedLines ?? null))
        .catch(() => setFinalizedLines(null));
      return;
    }
    void fetch(`/api/payroll/runs/${selectedRunId}`)
      .then((r) => r.json())
      .then((d) => setFinalizedLines(d.run?.finalizedLines ?? null))
      .catch(() => setFinalizedLines(null));
  }, [selectedRunId]);

  const active = useMemo(() => employees.filter((e) => e.isActive && !e.isArchived), [employees]);
  const rows = useMemo(() => computePayroll(active), [active]);
  const totals = useMemo(() => sumTotals(rows), [rows]);

  const period = new Date().toLocaleString("default", { month: "long", year: "numeric" });
  const payrollPeriodLabel = selectedRunId.startsWith("consolidated:")
    ? selectedRunId.slice("consolidated:".length)
    : selectedRunId
      ? (paidRuns.find((r) => r.id === selectedRunId)?.period_label ?? period)
      : period;

  const finalizedDisbursementRows = useMemo(
    () => (finalizedLines?.length ? rowsFromFinalizedPayroll(finalizedLines) : []),
    [finalizedLines],
  );

  const companyMeta = [
    { label: "Company", value: company.name || "—" },
    { label: "Period", value: payrollPeriodLabel },
    { label: "Employees", value: String(active.length) },
    { label: "Gross (USD)", value: fmtUSD(totals.gross) },
  ];

  function finalizedNotice() {
    const headers = ["Notice"];
    const dataRows: Cell[][] = [["Select a finalized payroll period above to generate this export."]];
    return {
      headers,
      dataRows,
      sections: [{
        heading: "Finalized payroll required",
        columns: [{ header: "Notice", width: 3 }],
        rows: dataRows,
      }],
    };
  }

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
    {
      id: "disbursement-report", title: "Payroll Disbursement Report", icon: <Wallet size={16} />,
      requiresFinalized: true,
      description: "Human-readable payroll disbursement listing from a finalized pay run (not a validated bank upload file).",
      build: () => {
        if (!finalizedDisbursementRows.length) return finalizedNotice();
        const headers = disbursementReportHeaders();
        const dataRows: Cell[][] = disbursementReportRows(finalizedDisbursementRows);
        return {
          headers, dataRows,
          sections: [{
            heading: `Payroll Disbursement — ${payrollPeriodLabel}`,
            columns: headers.map((h) => ({ header: h, width: 1.1 })),
            rows: dataRows,
          }],
        };
      },
    },
    {
      id: "bank-disbursement", title: "Bank Disbursement File", icon: <Landmark size={16} />,
      requiresFinalized: true,
      description: "PLACEHOLDER bank payment export from finalized payroll — not validated for bank upload.",
      build: () => {
        if (!finalizedDisbursementRows.length) return finalizedNotice();
        const headers = bankDisbursementHeaders();
        const dataRows: Cell[][] = bankDisbursementRows(finalizedDisbursementRows);
        return {
          headers, dataRows,
          sections: [{
            heading: `Bank Disbursement (placeholder) — ${payrollPeriodLabel}`,
            columns: headers.map((h) => ({ header: h, width: 1.2 })),
            rows: dataRows,
          }],
        };
      },
    },
    {
      id: "momo-disbursement", title: "Mobile Money Disbursement File", icon: <Wallet size={16} />,
      requiresFinalized: true,
      description: "PLACEHOLDER MTN/Orange bulk file from finalized payroll — not validated against provider specs.",
      build: () => {
        if (!finalizedDisbursementRows.length) return finalizedNotice();
        const headers = mobileMoneyDisbursementHeaders();
        const dataRows: Cell[][] = mobileMoneyDisbursementRows(finalizedDisbursementRows);
        return {
          headers, dataRows,
          sections: [{
            heading: `Mobile Money Disbursement (placeholder) — ${payrollPeriodLabel}`,
            columns: headers.map((h) => ({ header: h, width: 1.2 })),
            rows: dataRows,
          }],
        };
      },
    },
    {
      id: "lra-statutory", title: "LRA Statutory Export", icon: <Landmark size={16} />,
      requiresFinalized: true,
      description: "Authority-specific LRA export from finalized payroll (placeholder until spec confirmed).",
      build: () => {
        if (!finalizedLines?.length) return finalizedNotice();
        const headers = lraExportHeaders();
        const employer = { companyName: company.name, tin: company.tin, periodLabel: payrollPeriodLabel };
        const dataRows: Cell[][] = lraExportRowsFromFinalized(employer, finalizedLines);
        return {
          headers, dataRows,
          sections: [{
            heading: `LRA Export (placeholder) — ${payrollPeriodLabel}`,
            columns: headers.map((h) => ({ header: h, width: 1.1 })),
            rows: dataRows,
          }],
        };
      },
    },
    {
      id: "nasscorp-statutory", title: "NASSCORP Statutory Export", icon: <ShieldCheck size={16} />,
      requiresFinalized: true,
      description: "Authority-specific NASSCORP export from finalized payroll (placeholder until spec confirmed).",
      build: () => {
        if (!finalizedLines?.length) return finalizedNotice();
        const headers = nasscorpExportHeaders();
        const employer = { companyName: company.name, nasscorpRegNo: company.nasscorpRegNo, periodLabel: payrollPeriodLabel };
        const dataRows: Cell[][] = nasscorpExportRowsFromFinalized(employer, finalizedLines);
        return {
          headers, dataRows,
          sections: [{
            heading: `NASSCORP Export (placeholder) — ${payrollPeriodLabel}`,
            columns: headers.map((h) => ({ header: h, width: 1.1 })),
            rows: dataRows,
          }],
        };
      },
    },
  ];

  async function runExport(def: ReportDef, kind: ExportKind) {
    setBusy(`${def.id}-${kind}`);
    try {
      const built = def.build(rows, totals);
      const fname = `${def.title.replace(/\s+/g, "_")}_${payrollPeriodLabel.replace(/\s+/g, "_")}`;
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
      <ModuleHeader title="Reporting Center" subtitle={`${payrollPeriodLabel} · export to PDF, Excel or CSV`} />

      <Card style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
          Payroll &amp; Disbursement period
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)" }}>
          Disbursement and statutory exports use finalized (paid) payroll runs only.
        </p>
        <select
          value={selectedRunId}
          onChange={(e) => setSelectedRunId(e.target.value)}
          style={{
            maxWidth: 360, padding: "9px 12px", borderRadius: 10,
            border: "1px solid var(--border)", background: "var(--background)", fontSize: 13,
          }}
        >
          <option value="">Select finalized payroll period…</option>
          {consolidatedPeriods.map((p) => (
            <option key={`c-${p}`} value={`consolidated:${p}`}>
              {p} — Consolidated (all branches)
            </option>
          ))}
          {paidRuns.map((r) => (
            <option key={r.id} value={r.id}>{runOptionLabel(r)}</option>
          ))}
        </select>
        {paidRuns.length === 0 && (
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            No finalized pay runs yet — complete a payroll run to unlock disbursement exports.
          </span>
        )}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {REPORTS.map((def) => {
          const locked = def.proOnly && !hasDeptReports;
          const needsRun = def.requiresFinalized && !selectedRunId;
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
              ) : needsRun ? (
                <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Select a finalized payroll period above.</span>
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
        <span style={{ fontSize: 12 }}>Standard reports use active employees for the current calendar month. Disbursement and statutory exports require a finalized pay run.</span>
      </div>
    </ModuleShell>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FileBarChart, Users,
  FileText, FileSpreadsheet, FileDown, Wallet,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { can } from "@/lib/rbac";
import { downloadCSV, downloadExcel, type Cell } from "@/lib/reporting";
import { downloadReportPdf, type ReportSection } from "@/components/ReportPDF";
import type { FinalizedPayrollLine } from "@/lib/compliance/statutory-exports";
import {
  FINALIZED_CUSTOM_COLUMNS,
  PAYROLL_DISBURSEMENT_HEADERS,
  PAYROLL_REGISTER_HEADERS,
  buildCustomReportFromFinalized,
  payrollDisbursementRows,
  payrollDisbursementTotalRows,
  payrollRegisterRows,
  payrollRegisterTotalRows,
  summarizeFinalizedPeriod,
  type FinalizedCustomColumn,
} from "@/lib/reports/finalized-period-reports";
import NasscorpStatutoryCard from "@/components/NasscorpStatutoryCard";
import LraStatutoryCard from "@/components/LraStatutoryCard";
import {
  ModuleShell, ModuleHeader, Card, UpgradeNotice, btnGhost,
} from "@/components/module-ui";

type ExportKind = "pdf" | "excel" | "csv";

function SectionLabel({ children }: { children: string }) {
  return (
    <p style={{
      margin: "20px 0 10px", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
      textTransform: "uppercase", color: "var(--muted-foreground)",
      fontFamily: "'DM Mono',monospace",
    }}>
      {children}
    </p>
  );
}

export default function ReportsPage() {
  const { company, role } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [paidRuns, setPaidRuns] = useState<Array<{
    id: string;
    period_label: string;
    branch_id?: string | null;
    branches?: { name: string } | { name: string }[] | null;
  }>>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [finalizedLines, setFinalizedLines] = useState<FinalizedPayrollLine[] | null>(null);
  const [customCols, setCustomCols] = useState<FinalizedCustomColumn[]>([
    "employeeNumber", "fullName", "gross", "net",
  ]);
  const [customGroup, setCustomGroup] = useState<"" | "department" | "branch">("");

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

  const period = new Date().toLocaleString("default", { month: "long", year: "numeric" });
  const payrollPeriodLabel = selectedRunId.startsWith("consolidated:")
    ? selectedRunId.slice("consolidated:".length)
    : selectedRunId
      ? (paidRuns.find((r) => r.id === selectedRunId)?.period_label ?? period)
      : period;

  const lines = finalizedLines ?? [];
  const summary = useMemo(() => summarizeFinalizedPeriod(lines), [lines]);
  const selected = !!selectedRunId;

  const companyMeta = [
    { label: "Company", value: company.name || "—" },
    { label: "Period", value: payrollPeriodLabel },
    { label: "Employees", value: selected ? String(summary.employees) : "—" },
  ];

  if (!can(role, "report:view")) {
    return (
      <UpgradeNotice title="Reporting Center" requiredPlan="an authorized"
        description="Your role does not have access to reports." />
    );
  }

  const canExport = can(role, "report:export");

  async function exportTable(
    id: string,
    title: string,
    headers: string[],
    dataRows: Cell[][],
    totalRows: Cell[][],
    columns: ReportSection["columns"],
    kind: ExportKind,
  ) {
    setBusy(`${id}-${kind}`);
    try {
      const allRows = [...dataRows, ...totalRows];
      const fname = `${title.replace(/\s+/g, "_")}_${payrollPeriodLabel.replace(/\s+/g, "_")}`;
      if (kind === "csv") downloadCSV(fname, headers, allRows);
      else if (kind === "excel") downloadExcel(fname, [{ name: title, headers, rows: allRows }]);
      else {
        await downloadReportPdf({
          title,
          subtitle: payrollPeriodLabel,
          companyName: company.name,
          meta: companyMeta,
          sections: [{ heading: title, columns, rows: dataRows.map((r) => r.map(String)), totalRow: totalRows[0] }],
        }, fname);
      }
    } finally {
      setBusy(null);
    }
  }

  function ExportButtons({
    id, disabled, onPdf, onExcel, onCsv,
  }: {
    id: string;
    disabled: boolean;
    onPdf?: () => void;
    onExcel: () => void;
    onCsv: () => void;
  }) {
    if (!canExport) {
      return <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>View only — your role cannot export.</span>;
    }
    if (!selected) {
      return <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Select a finalized payroll period above.</span>;
    }
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {onPdf && (
          <button onClick={onPdf} disabled={disabled || !!busy} style={btnGhost()}>
            <FileText size={14} /> PDF
          </button>
        )}
        <button onClick={onExcel} disabled={disabled || !!busy} style={btnGhost()}>
          <FileSpreadsheet size={14} /> Excel
        </button>
        <button onClick={onCsv} disabled={disabled || !!busy} style={btnGhost()}>
          <FileDown size={14} /> CSV
        </button>
        {busy?.startsWith(id) && (
          <span style={{ fontSize: 12, color: "var(--muted-foreground)", alignSelf: "center" }}>Generating…</span>
        )}
      </div>
    );
  }

  function ReportCard({
    icon, title, description, children,
  }: {
    icon: React.ReactNode;
    title: string;
    description: string;
    children: React.ReactNode;
  }) {
    return (
      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11, flexShrink: 0,
            background: "color-mix(in oklch, var(--primary) 15%, transparent)",
            border: "1px solid color-mix(in oklch, var(--primary) 35%, transparent)",
            display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)",
          }}>
            {icon}
          </div>
          <div>
            <p style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 14, margin: 0 }}>{title}</p>
            <p style={{ color: "var(--muted-foreground)", fontSize: 11, margin: "2px 0 0" }}>{description}</p>
          </div>
        </div>
        {children}
      </Card>
    );
  }

  return (
    <ModuleShell>
      <ModuleHeader title="Reports" subtitle="Select a finalized payroll period, then generate a report" />

      <Card style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
          Payroll period
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)" }}>
          All reports below use the same finalized pay run. Nothing is recalculated from live employee rates.
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
            No finalized pay runs yet — complete a payroll run to unlock reports.
          </span>
        )}
      </Card>

      <SectionLabel>Payroll</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        <ReportCard
          icon={<Users size={16} />}
          title="Payroll Register"
          description="What happened in this payroll — earnings, deductions, and net by employee."
        >
          <ExportButtons
            id="payroll-register"
            disabled={!lines.length}
            onPdf={() => void exportTable(
              "payroll-register", "Payroll Register",
              [...PAYROLL_REGISTER_HEADERS],
              payrollRegisterRows(lines),
              payrollRegisterTotalRows(lines),
              [
                { header: "Emp #", width: 0.9 }, { header: "Name", width: 1.5 }, { header: "Branch", width: 1 },
                { header: "Gross", width: 0.9, align: "right" }, { header: "LRA", width: 0.8, align: "right" },
                { header: "NASSCORP", width: 0.9, align: "right" }, { header: "Other", width: 0.7, align: "right" },
                { header: "Net", width: 0.9, align: "right" }, { header: "CCY", width: 0.5 }, { header: "Account", width: 1 },
              ],
              "pdf",
            )}
            onExcel={() => void exportTable(
              "payroll-register", "Payroll Register",
              [...PAYROLL_REGISTER_HEADERS],
              payrollRegisterRows(lines), payrollRegisterTotalRows(lines), [], "excel",
            )}
            onCsv={() => void exportTable(
              "payroll-register", "Payroll Register",
              [...PAYROLL_REGISTER_HEADERS],
              payrollRegisterRows(lines), payrollRegisterTotalRows(lines), [], "csv",
            )}
          />
        </ReportCard>

        <ReportCard
          icon={<Wallet size={16} />}
          title="Payroll Disbursement"
          description="Who needs to be paid, how much, and to which account."
        >
          <ExportButtons
            id="payroll-disbursement"
            disabled={!lines.length}
            onPdf={() => void exportTable(
              "payroll-disbursement", "Payroll Disbursement",
              [...PAYROLL_DISBURSEMENT_HEADERS],
              payrollDisbursementRows(lines),
              payrollDisbursementTotalRows(lines),
              [
                { header: "Emp #", width: 1 }, { header: "Name", width: 2 },
                { header: "Net", width: 1.2, align: "right" }, { header: "CCY", width: 0.6 }, { header: "Account", width: 1.4 },
              ],
              "pdf",
            )}
            onExcel={() => void exportTable(
              "payroll-disbursement", "Payroll Disbursement",
              [...PAYROLL_DISBURSEMENT_HEADERS],
              payrollDisbursementRows(lines), payrollDisbursementTotalRows(lines), [], "excel",
            )}
            onCsv={() => void exportTable(
              "payroll-disbursement", "Payroll Disbursement",
              [...PAYROLL_DISBURSEMENT_HEADERS],
              payrollDisbursementRows(lines), payrollDisbursementTotalRows(lines), [], "csv",
            )}
          />
        </ReportCard>
      </div>

      <Card data-testid="custom-report-builder" style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <p style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 14, margin: 0 }}>Custom Report Builder</p>
          <p style={{ color: "var(--muted-foreground)", fontSize: 11, margin: "2px 0 0" }}>
            Pick columns from the same finalized payroll used by the register and disbursement. Values are not recalculated.
          </p>
        </div>
        {!selected ? (
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Select a finalized payroll period above.</span>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {FINALIZED_CUSTOM_COLUMNS.map((c) => (
                <label key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={customCols.includes(c.id)}
                    onChange={() => setCustomCols((prev) =>
                      prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id],
                    )}
                  />
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
              <ExportButtons
                id="custom-report"
                disabled={!lines.length || customCols.length === 0}
                onPdf={() => {
                  const built = buildCustomReportFromFinalized(lines, customCols, customGroup || null);
                  void exportTable(
                    "custom-report", "Custom Report",
                    built.headers, built.dataRows, built.totalRows,
                    built.headers.map((h) => ({ header: h, width: 1.1 })),
                    "pdf",
                  );
                }}
                onExcel={() => {
                  const built = buildCustomReportFromFinalized(lines, customCols, customGroup || null);
                  void exportTable("custom-report", "Custom Report", built.headers, built.dataRows, built.totalRows, [], "excel");
                }}
                onCsv={() => {
                  const built = buildCustomReportFromFinalized(lines, customCols, customGroup || null);
                  void exportTable("custom-report", "Custom Report", built.headers, built.dataRows, built.totalRows, [], "csv");
                }}
              />
            </div>
          </>
        )}
      </Card>

      <SectionLabel>Compliance</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        <NasscorpStatutoryCard
          companyId={company.id}
          companyName={company.name}
          employerId={company.nasscorpRegNo}
          lines={finalizedLines}
          periodLabel={payrollPeriodLabel}
          selected={selected}
          canExport={canExport}
        />
        <LraStatutoryCard
          companyName={company.name}
          employerTin={company.tin}
          periodLabel={payrollPeriodLabel}
          lines={finalizedLines}
          selected={selected}
          canExport={canExport}
          busy={!!busy}
          onBusy={setBusy}
        />
      </div>

      <SectionLabel>Summary</SectionLabel>
      <Card data-testid="payroll-summary" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11, flexShrink: 0,
            background: "color-mix(in oklch, var(--primary) 15%, transparent)",
            border: "1px solid color-mix(in oklch, var(--primary) 35%, transparent)",
            display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)",
          }}>
            <FileBarChart size={16} />
          </div>
          <div>
            <p style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 14, margin: 0 }}>Summary Report</p>
            <p style={{ color: "var(--muted-foreground)", fontSize: 11, margin: "2px 0 0" }}>
              Totals from the same finalized lines. Total LRA = PAYE withheld (income_tax). Total NASSCORP = employee deduction (nasscorp_ee).
            </p>
          </div>
        </div>

        {!selected ? (
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Select a finalized payroll period above.</span>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              {([
                ["Employees", String(summary.employees)],
                ["Total Net Salary", moneyList(summary, "net")],
                ["Total LRA", moneyList(summary, "lra")],
                ["Total NASSCORP", moneyList(summary, "nasscorpEe")],
              ] as const).map(([label, value]) => (
                <div key={label} style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)" }}>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--muted-foreground)" }}>{label}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>{value}</p>
                </div>
              ))}
            </div>
            <ExportButtons
              id="payroll-summary"
              disabled={!lines.length}
              onExcel={() => {
                const headers = ["Metric", ...summary.byCurrency.map((c) => c.currency)];
                const rows: Cell[][] = [
                  ["Total Net Salary", ...summary.byCurrency.map((c) => c.net.toFixed(2))],
                  ["Total LRA (PAYE withheld)", ...summary.byCurrency.map((c) => c.lra.toFixed(2))],
                  ["Total NASSCORP (employee deduction)", ...summary.byCurrency.map((c) => c.nasscorpEe.toFixed(2))],
                  ["Employees", ...summary.byCurrency.map((c) => c.employees)],
                ];
                void exportTable("payroll-summary", "Payroll Summary", headers, rows, [], [], "excel");
              }}
              onCsv={() => {
                const headers = ["Metric", ...summary.byCurrency.map((c) => c.currency)];
                const rows: Cell[][] = [
                  ["Total Net Salary", ...summary.byCurrency.map((c) => c.net.toFixed(2))],
                  ["Total LRA (PAYE withheld)", ...summary.byCurrency.map((c) => c.lra.toFixed(2))],
                  ["Total NASSCORP (employee deduction)", ...summary.byCurrency.map((c) => c.nasscorpEe.toFixed(2))],
                  ["Employees", ...summary.byCurrency.map((c) => c.employees)],
                ];
                void exportTable("payroll-summary", "Payroll Summary", headers, rows, [], [], "csv");
              }}
            />
          </>
        )}
      </Card>
    </ModuleShell>
  );
}

function moneyList(
  summary: ReturnType<typeof summarizeFinalizedPeriod>,
  key: "net" | "lra" | "nasscorpEe",
): string {
  if (!summary.byCurrency.length) return "—";
  return summary.byCurrency
    .map((c) => `${c.currency} ${c[key].toFixed(2)}`)
    .join(" · ");
}

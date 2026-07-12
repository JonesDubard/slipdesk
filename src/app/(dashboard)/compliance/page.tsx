"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle, FileDown,
  FileSpreadsheet, FileText, Landmark, Save, Loader,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { getEffectiveTier, canUse, PLAN_LABELS } from "@/lib/plan-features";
import { can } from "@/lib/rbac";
import {
  runComplianceChecks, computePayroll, sumTotals, fmtUSD, fmtMoney,
  downloadCSV, downloadExcel, type Cell,
} from "@/lib/reporting";
import { downloadReportPdf } from "@/components/ReportPDF";
import {
  ModuleShell, ModuleHeader, Card, UpgradeNotice, btnGhost,
} from "@/components/module-ui";

interface SnapshotRow {
  id: string;
  period_label: string;
  score: number;
  critical_count: number;
  warning_count: number;
  payroll_ready: boolean;
  lra_ready: boolean;
  nasscorp_ready: boolean;
  created_at: string;
}

export default function CompliancePage() {
  const { employees, company, role } = useApp();
  const effectiveTier = getEffectiveTier(company.subscriptionTier, company.billingBypass);
  const [busy, setBusy] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [savingSnap, setSavingSnap] = useState(false);
  const canHistory = canUse("complianceHistory", effectiveTier);

  const report = useMemo(() => runComplianceChecks(employees, company), [employees, company]);
  const active = useMemo(() => employees.filter((e) => e.isActive && !e.isArchived), [employees]);
  const rows = useMemo(() => computePayroll(active), [active]);
  const totals = useMemo(() => sumTotals(rows), [rows]);

  useEffect(() => {
    if (!canHistory) return;
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      try {
        const res = await fetch("/api/compliance/snapshots");
        const data = await res.json();
        if (!cancelled && res.ok) setSnapshots(data.snapshots ?? []);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [canHistory, company.id]);

  if (!canUse("complianceDashboard", effectiveTier)) {
    return (
      <UpgradeNotice
        title="Compliance Center"
        requiredPlan={PLAN_LABELS.standard}
        description="The Compliance Center — validation checks, compliance scoring, and LRA/NASSCORP report generation — is available on the Professional plan and above."
      />
    );
  }

  if (!can(role, "compliance:view")) {
    return (
      <UpgradeNotice title="Compliance Center" requiredPlan="an authorized"
        description="Your role does not have access to the Compliance Center." />
    );
  }

  const period = new Date().toLocaleString("default", { month: "long", year: "numeric" });
  const companyMeta = [
    { label: "Company", value: company.name || "—" },
    { label: "LRA TIN", value: company.tin || "MISSING" },
    { label: "NASSCORP Reg", value: company.nasscorpRegNo || "MISSING" },
    { label: "Period", value: period },
    { label: "Employees", value: String(active.length) },
  ];

  async function saveSnapshot() {
    setSavingSnap(true);
    try {
      const res = await fetch("/api/compliance/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodLabel: period,
          score: report.score,
          criticalCount: report.criticalCount,
          warningCount: report.warningCount,
          payrollReady: report.payrollReady,
          lraReady: report.lraReady,
          nasscorpReady: report.nasscorpReady,
          details: { issues: report.issues.slice(0, 50) },
        }),
      });
      const data = await res.json();
      if (res.ok && data.snapshot) {
        setSnapshots((prev) => [data.snapshot, ...prev]);
      }
    } finally {
      setSavingSnap(false);
    }
  }

  // ── LRA reports ──
  async function lraEmployerSummary(kind: "pdf" | "excel" | "csv") {
    setBusy(`lra-emp-${kind}`);
    try {
      const headers = ["Employee #", "Name", "Department", "Currency", "Gross", "Taxable", "Income Tax"];
      const dataRows: Cell[][] = rows.map((r) => [
        r.employee.employeeNumber, r.employee.fullName, r.employee.department || "—",
        r.employee.currency,
        fmtMoney(r.result.grossPay, r.employee.currency),
        fmtMoney(r.result.Paye.grossInLRD, "LRD"),
        fmtMoney(r.result.Paye.taxInBase, r.employee.currency),
      ]);
      const total: Cell[] = ["", "TOTAL", "", "", fmtUSD(totals.gross), "", fmtUSD(totals.incomeTax)];
      if (kind === "csv") downloadCSV(`LRA_Employer_Summary_${period}`, headers, [...dataRows, total]);
      else if (kind === "excel") downloadExcel(`LRA_Employer_Summary_${period}`, [{ name: "Employer Summary", headers, rows: [...dataRows, total] }]);
      else await downloadReportPdf({
        title: "LRA Monthly Employer Summary", subtitle: period, companyName: company.name, meta: companyMeta,
        sections: [{
          heading: "Income Tax Withheld by Employee",
          columns: [
            { header: "Emp #", width: 1 }, { header: "Name", width: 2 }, { header: "Dept", width: 1.4 },
            { header: "CCY", width: 0.6 }, { header: "Gross", width: 1.2, align: "right" },
            { header: "Income Tax", width: 1.2, align: "right" },
          ],
          rows: rows.map((r) => [
            r.employee.employeeNumber, r.employee.fullName, r.employee.department || "—",
            r.employee.currency, fmtMoney(r.result.grossPay, r.employee.currency),
            fmtMoney(r.result.Paye.taxInBase, r.employee.currency),
          ]),
          totalRow: ["", "TOTAL (USD equiv.)", "", "", fmtUSD(totals.gross), fmtUSD(totals.incomeTax)],
        }],
      }, `LRA_Employer_Summary_${period}`);
    } finally { setBusy(null); }
  }

  async function nasscorpReport(kind: "pdf" | "excel" | "csv") {
    setBusy(`nass-${kind}`);
    try {
      const headers = ["Employee #", "Name", "NASSCORP #", "Base Salary", "Employee 4%", "Employer 6%", "Total 10%"];
      const dataRows: Cell[][] = rows.map((r) => [
        r.employee.employeeNumber, r.employee.fullName, r.employee.nasscorpNumber || "MISSING",
        fmtMoney(r.result.nasscorp.base, r.employee.currency),
        fmtMoney(r.result.nasscorp.employeeContribution, r.employee.currency),
        fmtMoney(r.result.nasscorp.employerContribution, r.employee.currency),
        fmtMoney(r.result.nasscorp.employeeContribution + r.result.nasscorp.employerContribution, r.employee.currency),
      ]);
      const total: Cell[] = ["", "TOTAL (USD)", "", "", fmtUSD(totals.nasscorpEe), fmtUSD(totals.nasscorpEr), fmtUSD(totals.nasscorpEe + totals.nasscorpEr)];
      if (kind === "csv") downloadCSV(`NASSCORP_Contribution_Report_${period}`, headers, [...dataRows, total]);
      else if (kind === "excel") downloadExcel(`NASSCORP_Contribution_Report_${period}`, [{ name: "NASSCORP", headers, rows: [...dataRows, total] }]);
      else await downloadReportPdf({
        title: "NASSCORP Contribution Report", subtitle: period, companyName: company.name, meta: companyMeta,
        sections: [{
          heading: "Employee & Employer Contributions",
          columns: [
            { header: "Emp #", width: 1 }, { header: "Name", width: 1.8 }, { header: "NASSCORP #", width: 1.4 },
            { header: "EE 4%", width: 1, align: "right" }, { header: "ER 6%", width: 1, align: "right" },
            { header: "Total", width: 1, align: "right" },
          ],
          rows: rows.map((r) => [
            r.employee.employeeNumber, r.employee.fullName, r.employee.nasscorpNumber || "MISSING",
            fmtMoney(r.result.nasscorp.employeeContribution, r.employee.currency),
            fmtMoney(r.result.nasscorp.employerContribution, r.employee.currency),
            fmtMoney(r.result.nasscorp.employeeContribution + r.result.nasscorp.employerContribution, r.employee.currency),
          ]),
          totalRow: ["", "TOTAL (USD equiv.)", "", fmtUSD(totals.nasscorpEe), fmtUSD(totals.nasscorpEr), fmtUSD(totals.nasscorpEe + totals.nasscorpEr)],
        }],
      }, `NASSCORP_Contribution_Report_${period}`);
    } finally { setBusy(null); }
  }

  return (
    <ModuleShell>
      <ModuleHeader title="Compliance Center" subtitle={`Built for Liberian payroll compliance · ${period}`} />

      {canHistory && (
        <Card style={{ marginBottom: 16 }} data-testid="compliance-history">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Compliance history</h3>
            <button
              type="button"
              onClick={() => void saveSnapshot()}
              disabled={savingSnap}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 12px", borderRadius: 9, border: "none",
                background: "var(--primary)", color: "var(--primary-foreground)",
                fontWeight: 700, fontSize: 12, cursor: "pointer",
              }}
            >
              {savingSnap ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
              Save snapshot
            </button>
          </div>
          {historyLoading ? (
            <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Loading history…</p>
          ) : snapshots.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>No snapshots yet. Save the current scorecard to start a history trail.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["Date", "Period", "Score", "Critical", "Warnings", "LRA", "NASSCORP"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id}>
                    <td style={{ padding: "8px 6px", borderBottom: "1px solid var(--border)", fontFamily: "'DM Mono',monospace", fontSize: 11 }}>
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "8px 6px", borderBottom: "1px solid var(--border)" }}>{s.period_label}</td>
                    <td style={{ padding: "8px 6px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>{s.score}</td>
                    <td style={{ padding: "8px 6px", borderBottom: "1px solid var(--border)" }}>{s.critical_count}</td>
                    <td style={{ padding: "8px 6px", borderBottom: "1px solid var(--border)" }}>{s.warning_count}</td>
                    <td style={{ padding: "8px 6px", borderBottom: "1px solid var(--border)" }}>{s.lra_ready ? "Ready" : "—"}</td>
                    <td style={{ padding: "8px 6px", borderBottom: "1px solid var(--border)" }}>{s.nasscorp_ready ? "Ready" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Score + readiness */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) 2fr", gap: 16, marginBottom: 16 }}>
        <Card style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center" }}>
          <ScoreRing score={report.score} />
          <p style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 15, margin: 0 }}>Overall Compliance Score</p>
          <p style={{ color: "var(--muted-foreground)", fontSize: 12, margin: 0 }}>
            {report.criticalCount} critical · {report.warningCount} warnings
          </p>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          <ReadyCard label="Payroll Ready" ok={report.payrollReady} />
          <ReadyCard label="LRA Ready" ok={report.lraReady} />
          <ReadyCard label="NASSCORP Ready" ok={report.nasscorpReady} />
          <Card style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={16} color="var(--warning)" />
              <span style={{ fontWeight: 700, fontSize: 22, fontFamily: "'DM Mono',monospace", color: "var(--warning)" }}>{report.warningCount}</span>
            </div>
            <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "'DM Mono',monospace" }}>Warnings</span>
          </Card>
          <Card style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <XCircle size={16} color="var(--destructive)" />
              <span style={{ fontWeight: 700, fontSize: 22, fontFamily: "'DM Mono',monospace", color: "var(--destructive)" }}>{report.criticalCount}</span>
            </div>
            <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "'DM Mono',monospace" }}>Critical Issues</span>
          </Card>
        </div>
      </div>

      {/* Report generators */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 16 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Landmark size={16} color="var(--primary)" />
            <span style={{ fontWeight: 700, fontSize: 15, color: "var(--foreground)" }}>LRA Reports</span>
          </div>
          <p style={{ color: "var(--muted-foreground)", fontSize: 12, marginBottom: 14 }}>
            Monthly Employer Summary · Employee Tax Register · Tax Liability
          </p>
          <ExportRow busyKey="lra-emp" busy={busy} onPdf={() => lraEmployerSummary("pdf")} onExcel={() => lraEmployerSummary("excel")} onCsv={() => lraEmployerSummary("csv")} />
        </Card>

        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <ShieldCheck size={16} color="var(--primary)" />
            <span style={{ fontWeight: 700, fontSize: 15, color: "var(--foreground)" }}>NASSCORP Reports</span>
          </div>
          <p style={{ color: "var(--muted-foreground)", fontSize: 12, marginBottom: 14 }}>
            Employer & Employee Contribution · Monthly Submission
          </p>
          <ExportRow busyKey="nass" busy={busy} onPdf={() => nasscorpReport("pdf")} onExcel={() => nasscorpReport("excel")} onCsv={() => nasscorpReport("csv")} />
        </Card>
      </div>

      {/* Validation issues */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <AlertTriangle size={15} color="var(--warning)" />
          <span style={{ fontWeight: 700, fontSize: 15, color: "var(--foreground)" }}>Validation Findings</span>
        </div>
        {report.issues.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "24px 0", justifyContent: "center", color: "var(--primary)" }}>
            <CheckCircle2 size={18} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>All checks passed. Payroll is compliant.</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {report.issues.map((issue) => (
              <div key={issue.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 10,
                background: issue.severity === "critical" ? "color-mix(in oklch, var(--destructive) 10%, transparent)" : "color-mix(in oklch, var(--warning) 10%, transparent)",
                border: `1px solid ${issue.severity === "critical" ? "color-mix(in oklch, var(--destructive) 30%, transparent)" : "color-mix(in oklch, var(--warning) 30%, transparent)"}`,
              }}>
                {issue.severity === "critical"
                  ? <XCircle size={15} color="var(--destructive)" style={{ flexShrink: 0 }} />
                  : <AlertTriangle size={15} color="var(--warning)" style={{ flexShrink: 0 }} />}
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "'DM Mono',monospace", color: "var(--muted-foreground)", width: 78, flexShrink: 0 }}>{issue.category}</span>
                <span style={{ fontSize: 13, color: "var(--foreground)" }}>{issue.message}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </ModuleShell>
  );
}

function ExportRow({ busyKey, busy, onPdf, onExcel, onCsv }: {
  busyKey: string; busy: string | null; onPdf: () => void; onExcel: () => void; onCsv: () => void;
}) {
  const isBusy = busy?.startsWith(busyKey);
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button onClick={onPdf} disabled={!!busy} style={btnGhost()}><FileText size={14} /> PDF</button>
      <button onClick={onExcel} disabled={!!busy} style={btnGhost()}><FileSpreadsheet size={14} /> Excel</button>
      <button onClick={onCsv} disabled={!!busy} style={btnGhost()}><FileDown size={14} /> CSV</button>
      {isBusy && <span style={{ fontSize: 12, color: "var(--muted-foreground)", alignSelf: "center" }}>Generating…</span>}
    </div>
  );
}

function ReadyCard({ label, ok }: { label: string; ok: boolean }) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
      {ok ? <CheckCircle2 size={20} color="var(--primary)" /> : <XCircle size={20} color="var(--destructive)" />}
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>{label}</span>
      <span style={{ fontSize: 11, color: ok ? "var(--primary)" : "var(--destructive)", fontFamily: "'DM Mono',monospace" }}>
        {ok ? "Ready" : "Action needed"}
      </span>
    </Card>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 85 ? "var(--primary)" : score >= 60 ? "var(--warning)" : "var(--destructive)";
  const deg = (score / 100) * 360;
  return (
    <div style={{
      width: 120, height: 120, borderRadius: "50%",
      background: `conic-gradient(${color} ${deg}deg, var(--border) ${deg}deg)`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: 92, height: 92, borderRadius: "50%", background: "var(--card)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 30, fontWeight: 800, color, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 10, color: "var(--muted-foreground)", fontFamily: "'DM Mono',monospace" }}>/ 100</span>
      </div>
    </div>
  );
}

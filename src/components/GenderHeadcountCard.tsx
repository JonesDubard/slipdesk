"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Download, FileText, Users } from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
} from "recharts";
import type { Employee } from "@/context/AppContext";
import { downloadCSV } from "@/lib/reporting";
import { downloadReportPdf } from "@/components/ReportPDF";
import {
  buildGenderHeadcountCsv,
  employeesForGenderExport,
  genderByBranchExportRows,
  genderDetailExportRows,
  genderExportScopeLabel,
  genderHeadcountByBranch,
  genderSummaryExportRows,
  summarizeGenderHeadcount,
} from "@/lib/reports/gender-headcount";

const CHART_COLORS = ["#50C878", "#002147", "#3B82F6", "#8B5CF6", "#F59E0B"];

interface Props {
  viewed: Employee[];
  allActive: Employee[];
  branchFilter: string;
  branchOptions: string[];
  genderFilterActive?: boolean;
  companyName: string;
  onBlocked?: () => boolean;
}

export default function GenderHeadcountCard({
  viewed,
  allActive,
  branchFilter,
  branchOptions,
  genderFilterActive,
  companyName,
  onBlocked,
}: Props) {
  const [scope, setScope] = useState("view");
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);

  const scoped = useMemo(
    () => employeesForGenderExport(scope, viewed, allActive),
    [scope, viewed, allActive],
  );
  const rows = useMemo(() => summarizeGenderHeadcount(scoped), [scoped]);
  const total = scoped.length;
  const byBranch = useMemo(() => genderHeadcountByBranch(scoped), [scoped]);
  const includeByBranch = scope === "all" || (scope === "view" && branchFilter === "All");
  const scopeLabel = genderExportScopeLabel(scope, branchFilter);
  const chartData = rows.filter((r) => r.count > 0).map((r) => ({ name: r.label, value: r.count }));
  const namedBranches = branchOptions.filter((b) => b !== "All");

  async function exportKind(kind: "csv" | "pdf") {
    if (onBlocked && !onBlocked()) return;
    setBusy(kind);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const slug = scope === "all"
        ? "Consolidated"
        : scope.startsWith("branch:")
          ? scope.slice("branch:".length).replace(/\s+/g, "_")
          : branchFilter === "All"
            ? "CurrentView"
            : branchFilter.replace(/\s+/g, "_");
      const fname = `Gender_Headcount_${slug}_${stamp}`;

      if (kind === "csv") {
        const csv = buildGenderHeadcountCsv({
          scopeLabel,
          employees: scoped,
          includeByBranch,
        });
        downloadCSV(fname, csv.headers, csv.rows);
        return;
      }

      const summaryRows = genderSummaryExportRows(rows, total);
      const detailRows = genderDetailExportRows(scoped);
      const branchRows = genderByBranchExportRows(byBranch);
      await downloadReportPdf({
        title: "Gender Headcount",
        subtitle: "Internal labor-compliance headcount — not a certified filing format",
        companyName,
        meta: [
          { label: "Scope", value: scopeLabel },
          { label: "Employees", value: String(total) },
          { label: "Date", value: stamp },
        ],
        sections: [
          {
            heading: "Counts by gender",
            columns: [
              { header: "Gender", width: 2 },
              { header: "Count", width: 1, align: "right" },
              { header: "Share", width: 1, align: "right" },
            ],
            rows: summaryRows.map((r) => r.map(String)),
          },
          ...(includeByBranch && byBranch.length > 1
            ? [{
                heading: "By branch",
                columns: [
                  { header: "Branch", width: 1.6 },
                  { header: "Gender", width: 1.6 },
                  { header: "Count", width: 0.8, align: "right" as const },
                  { header: "Share", width: 0.8, align: "right" as const },
                ],
                rows: branchRows.map((r) => r.map(String)),
              }]
            : []),
          {
            heading: "Employee list",
            columns: [
              { header: "Emp #", width: 1 },
              { header: "Name", width: 2 },
              { header: "Gender", width: 1.4 },
              { header: "Branch", width: 1.3 },
              { header: "Dept", width: 1.2 },
            ],
            rows: detailRows.map((r) => r.map(String)),
          },
        ],
      }, fname);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      data-testid="gender-headcount"
      style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 16, padding: "18px 20px", marginBottom: 18,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Users size={15} color="var(--primary)" />
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "var(--foreground)" }}>
              Gender headcount
            </h2>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted-foreground)" }}>
            {scopeLabel} · {total} employee{total !== 1 ? "s" : ""}. Internal export only — not a certified labor filing format.
          </p>
          {genderFilterActive && scope === "view" && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted-foreground)" }}>
              Table is filtered by gender; these counts still include every gender in the current branch/search view.
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            aria-label="Gender headcount export scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            style={{
              padding: "8px 10px", borderRadius: 9, border: "1px solid var(--border)",
              background: "var(--background)", fontSize: 12, color: "var(--foreground)",
            }}
          >
            <option value="view">Current view{branchFilter !== "All" ? ` (${branchFilter})` : ""}</option>
            <option value="all">All branches (consolidated)</option>
            {namedBranches.map((b) => (
              <option key={b} value={`branch:${b}`}>{b} only</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!!busy || total === 0}
            onClick={() => void exportKind("csv")}
            style={exportBtn}
          >
            <Download size={13} /> {busy === "csv" ? "Exporting…" : "CSV"}
          </button>
          <button
            type="button"
            disabled={!!busy || total === 0}
            onClick={() => void exportKind("pdf")}
            style={exportBtn}
          >
            <FileText size={13} /> {busy === "pdf" ? "Exporting…" : "PDF"}
          </button>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 16,
        alignItems: "center",
      }}>
        <div>
          {rows.map((r) => (
            <div
              key={r.key || "unspecified"}
              style={{
                display: "flex", justifyContent: "space-between", gap: 12,
                padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13,
              }}
            >
              <span style={{ color: "var(--foreground)" }}>{r.label}</span>
              <span style={{ fontFamily: "'DM Mono',monospace", color: "var(--muted-foreground)" }}>
                {r.count} · {r.percent}%
              </span>
            </div>
          ))}
        </div>
        <div style={{ height: 200 }}>
          {chartData.length === 0 ? (
            <p style={{ color: "var(--muted-foreground)", fontSize: 12, textAlign: "center", paddingTop: 72 }}>
              No employees in this scope.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

const exportBtn: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "8px 12px", borderRadius: 9, cursor: "pointer",
  background: "transparent", border: "1px solid var(--border)",
  color: "var(--muted-foreground)", fontSize: 12, fontWeight: 600,
};

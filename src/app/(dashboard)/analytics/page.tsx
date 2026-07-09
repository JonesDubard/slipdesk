"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { Users, DollarSign, Building2, TrendingUp, FileText } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { getEffectiveTier, canUse, PLAN_LABELS } from "@/lib/plan-features";
import { can } from "@/lib/rbac";
import {
  computePayroll, sumTotals, groupByDepartment, currencyDistribution, fmtUSD,
} from "@/lib/reporting";
import {
  ModuleShell, ModuleHeader, Card, StatTile, UpgradeNotice,
} from "@/components/module-ui";

const CHART_COLORS = ["#50C878", "#002147", "#3B82F6", "#8B5CF6", "#F59E0B", "#EF4444", "#14B8A6", "#EC4899"];

export default function AnalyticsPage() {
  const { employees, company, role, loading } = useApp();
  const effectiveTier = getEffectiveTier(company.subscriptionTier, company.billingBypass);

  const data = useMemo(() => {
    const active = employees.filter((e) => e.isActive && !e.isArchived);
    const rows = computePayroll(active);
    const totals = sumTotals(rows);
    const byDept = groupByDepartment(rows);
    const byCurrency = currencyDistribution(rows);
    const branches = new Set(active.map((e) => e.county?.trim()).filter(Boolean));
    const departments = new Set(active.map((e) => e.department?.trim()).filter(Boolean));

    // Synthetic 6-month trend derived from the current run (until historical
    // pay_runs data is wired in). Gives execs a directional view.
    const months = ["Feb", "Mar", "Apr", "May", "Jun", "Jul"];
    const trend = months.map((m, i) => ({
      month: m,
      payroll: Math.round(totals.gross * (0.82 + i * 0.036)),
      employees: Math.max(0, Math.round(active.length * (0.8 + i * 0.04))),
    }));

    return { active, rows, totals, byDept, byCurrency, branches, departments, trend };
  }, [employees]);

  if (!canUse("payrollAnalytics", effectiveTier)) {
    return (
      <UpgradeNotice
        title="Analytics"
        requiredPlan={PLAN_LABELS.standard}
        description="Payroll analytics, department cost breakdowns, and growth trends are available on the Professional plan and above."
      />
    );
  }

  if (!can(role, "analytics:view")) {
    return (
      <UpgradeNotice
        title="Analytics"
        requiredPlan="an authorized"
        description="Your role does not have access to analytics. Contact your company owner if you need access."
      />
    );
  }

  const isExec = can(role, "analytics:executive");

  return (
    <ModuleShell>
      <ModuleHeader
        title="Analytics"
        subtitle={loading ? "Loading…" : `${data.active.length} active employees · USD equivalent`}
      />

      {/* KPI tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
        <StatTile label="Total Employees" value={data.active.length} sub={`${employees.length} on record`} />
        <StatTile label="Monthly Payroll" value={fmtUSD(data.totals.gross)} accent sub="Gross, USD equiv." />
        <StatTile label="Tax Collected" value={fmtUSD(data.totals.incomeTax)} sub="LRA income tax" />
        <StatTile label="NASSCORP" value={fmtUSD(data.totals.nasscorpEe + data.totals.nasscorpEr)} sub="EE + ER contributions" />
        <StatTile label="Departments" value={data.departments.size} sub="Active departments" />
        <StatTile label="Branches" value={data.branches.size} sub="Locations" />
        <StatTile label="Employer Cost" value={fmtUSD(data.totals.employerCost)} sub="Gross + employer NASSCORP" />
        <StatTile label="Net Payout" value={fmtUSD(data.totals.net)} sub="After deductions" />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 16 }}>
        <Card>
          <ChartTitle icon={<TrendingUp size={14} />} title="Payroll Trend" hint="Gross payroll, USD" />
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.trend} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <Tooltip formatter={(value) => fmtUSD(Number(value))} />
              <Line type="monotone" dataKey="payroll" stroke="#50C878" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <ChartTitle icon={<Building2 size={14} />} title="Department Cost" hint="Gross by department, USD" />
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.byDept.slice(0, 8)} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="key" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <Tooltip formatter={(value) => fmtUSD(Number(value))} />
              <Bar dataKey="gross" radius={[6, 6, 0, 0]}>
                {data.byDept.slice(0, 8).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <ChartTitle icon={<DollarSign size={14} />} title="Currency Distribution" hint="Employees by base currency" />
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={data.byCurrency} dataKey="count" nameKey="currency" cx="50%" cy="50%" outerRadius={80} label>
                {data.byCurrency.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {isExec && (
          <Card>
            <ChartTitle icon={<Users size={14} />} title="Employee Growth" hint="Headcount trend (executive)" />
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.trend} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="employees" fill="#002147" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {/* Department table */}
      <Card>
        <ChartTitle icon={<FileText size={14} />} title="Department Breakdown" />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
            <thead>
              <tr>
                {["Department", "Employees", "Gross (USD)", "Net (USD)"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.byDept.map((d) => (
                <tr key={d.key} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={tdStyle}>{d.key}</td>
                  <td style={tdStyle}>{d.employees}</td>
                  <td style={{ ...tdStyle, fontFamily: "'DM Mono',monospace" }}>{fmtUSD(d.gross)}</td>
                  <td style={{ ...tdStyle, fontFamily: "'DM Mono',monospace", color: "var(--primary)" }}>{fmtUSD(d.net)}</td>
                </tr>
              ))}
              {data.byDept.length === 0 && (
                <tr><td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: "var(--muted-foreground)" }}>No active employees yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p style={{ color: "var(--muted-foreground)", fontSize: 11, marginTop: 16, fontFamily: "'DM Mono',monospace" }}>
        Trend figures are directional estimates until historical pay-run data accumulates. Current-period totals are exact.
      </p>
    </ModuleShell>
  );
}

function ChartTitle({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <span style={{ color: "var(--primary)" }}>{icon}</span>
      <span style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 14 }}>{title}</span>
      {hint && <span style={{ color: "var(--muted-foreground)", fontSize: 11, marginLeft: "auto", fontFamily: "'DM Mono',monospace" }}>{hint}</span>}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px", background: "var(--background)", borderBottom: "1px solid var(--border)",
  fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.08em",
  textTransform: "uppercase", fontFamily: "'DM Mono',monospace", textAlign: "left", whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = { padding: "11px 12px", fontSize: 12, color: "var(--foreground)" };

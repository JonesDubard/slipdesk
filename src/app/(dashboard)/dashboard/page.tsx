"use client";

import {
  Users,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  FileText,
  ChevronRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
} from "lucide-react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { MOCK_DASHBOARD_STATS, MOCK_PAY_RUNS, MOCK_EMPLOYEES } from "@/lib/mock-data";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function usd(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_STYLES = {
  draft:    "bg-slate-100 text-slate-600",
  review:   "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  paid:     "bg-emerald-100 text-emerald-700",
};

const STATUS_ICONS = {
  draft:    Clock,
  review:   AlertTriangle,
  approved: CheckCircle2,
  paid:     CheckCircle2,
};

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = false,
  warning = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-5 border ${
      accent
        ? "bg-[#002147] border-[#002147] text-white"
        : warning
        ? "bg-amber-50 border-amber-200"
        : "bg-white border-slate-200"
    }`}>
      <div className="flex items-start justify-between mb-4">
        <p className={`text-xs font-mono uppercase tracking-widest ${
          accent ? "text-white/50" : warning ? "text-amber-600" : "text-slate-400"
        }`}>
          {label}
        </p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          accent ? "bg-white/10" : warning ? "bg-amber-100" : "bg-slate-50"
        }`}>
          <Icon className={`w-4 h-4 ${
            accent ? "text-[#50C878]" : warning ? "text-amber-500" : "text-slate-400"
          }`} />
        </div>
      </div>
      <p className={`text-2xl font-bold font-mono ${
        accent ? "text-white" : warning ? "text-amber-700" : "text-slate-800"
      }`}>
        {value}
      </p>
      {sub && (
        <p className={`text-xs mt-1 ${
          accent ? "text-white/50" : warning ? "text-amber-500" : "text-slate-400"
        }`}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3">
        <p className="text-xs text-slate-400 font-mono mb-1">{label} 2025</p>
        <p className="text-slate-800 font-bold font-mono">{usd(payload[0].value)}</p>
      </div>
    );
  }
  return null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const s = MOCK_DASHBOARD_STATS;

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">June 2025 · Pay run in progress</p>
        </div>
        <Link
          href="/payroll"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                     text-[#002147] bg-[#50C878] hover:bg-[#3aa85f] transition-colors"
        >
          Run Payroll
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Employees"
          value={String(s.activeEmployees)}
          sub={`${s.totalEmployees} total`}
          icon={Users}
          accent
        />
        <StatCard
          label="Current Gross"
          value={usd(s.currentMonthGross)}
          sub="June 2025 (draft)"
          icon={DollarSign}
        />
        <StatCard
          label="PAYE to Remit"
          value={usd(s.currentMonthPaye)}
          sub="LRA — this month"
          icon={TrendingUp}
        />
        {s.warningCount > 0 ? (
          <StatCard
            label="Warnings"
            value={String(s.warningCount)}
            sub="Below minimum wage"
            icon={AlertTriangle}
            warning
          />
        ) : (
          <StatCard
            label="NASSCORP"
            value={usd(s.currentMonthNasscorp)}
            sub="Employee contributions"
            icon={CheckCircle2}
          />
        )}
      </div>

      {/* Chart + Pay runs */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Gross payroll trend */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-semibold text-slate-800">Gross Payroll Trend</h2>
              <p className="text-slate-400 text-xs mt-0.5">2025 year-to-date (USD)</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={s.monthlyTrend} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "#94a3b8", fontFamily: "DM Mono" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8", fontFamily: "DM Mono" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f8fafc" }} />
              <Bar dataKey="gross" fill="#50C878" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent pay runs */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-800">Pay Runs</h2>
            <Link
              href="/payroll"
              className="text-xs text-[#50C878] hover:underline flex items-center gap-1"
            >
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {MOCK_PAY_RUNS.slice(0, 4).map((run) => {
              const StatusIcon = STATUS_ICONS[run.status];
              return (
                <div
                  key={run.id}
                  className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <StatusIcon className={`w-4 h-4 flex-shrink-0 ${
                      run.status === "paid" ? "text-emerald-500" :
                      run.status === "draft" ? "text-slate-400" : "text-amber-500"
                    }`} />
                    <div>
                      <p className="text-sm font-medium text-slate-700">{run.periodLabel}</p>
                      <p className="text-xs text-slate-400 font-mono">{usd(run.totalGross)}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full ${STATUS_STYLES[run.status]}`}>
                    {run.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Employee snapshot */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-slate-800">Employee Snapshot</h2>
          <Link
            href="/employees"
            className="text-xs text-[#50C878] hover:underline flex items-center gap-1"
          >
            Manage employees <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {["Employee", "Department", "Type", "Currency", "Rate", "Status"].map((h) => (
                  <th key={h} className="text-left pb-3 pr-4 text-xs font-mono text-slate-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_EMPLOYEES.slice(0, 5).map((emp) => (
                <tr key={emp.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#002147]/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-[#002147] text-[10px] font-bold">
                          {emp.firstName[0]}{emp.lastName[0]}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-700">{emp.fullName}</p>
                        <p className="text-xs text-slate-400">{emp.employeeNumber}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-slate-500 text-sm">{emp.department}</td>
                  <td className="py-3 pr-4">
                    <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">
                      {emp.employmentType.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      emp.currency === "USD" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {emp.currency}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-slate-700 text-sm">
                    {emp.currency === "USD" ? "$" : "L$"}{emp.rate.toFixed(2)}/hr
                  </td>
                  <td className="py-3">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                      emp.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}>
                      {emp.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Billing notice */}
      <div className="flex items-center justify-between bg-[#002147]/5 border border-[#002147]/10 rounded-2xl px-5 py-4">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-[#002147]/50 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-[#002147]">
              Platform fee this month: {usd(s.platformFeeUSD)}
            </p>
            <p className="text-xs text-slate-400">
              {s.activeEmployees} active employees × $1.50 PEPM
            </p>
          </div>
        </div>
        <span className="text-xs font-mono text-[#50C878] bg-emerald-50 px-3 py-1 rounded-full">
          Billed end of month
        </span>
      </div>
    </div>
  );
}
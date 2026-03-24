"use client";

/**
 * Slipdesk — Dashboard Page
 * Place at: src/app/(dashboard)/dashboard/page.tsx
 */

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import {
  Users, TrendingUp, AlertTriangle, CheckCircle2,
  ArrowRight, Play, FileText, Building2, X, Sparkles,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { calculatePayroll } from "@/lib/slipdesk-payroll-engine";

// ─── Constants ────────────────────────────────────────────────────────────────

const EXCHANGE_RATE     = 185.44;
const RATE_PER_EMPLOYEE = 0.75;  // ✅ updated from 0.50

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, sym = "$") =>
  `${sym}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ✅ No minimum floor — pure PEPM
function calcFee(count: number) {
  return Math.round(count * RATE_PER_EMPLOYEE * 100) / 100;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent = false, warning = false,
}: {
  label: string; value: string | number; sub?: string; accent?: boolean; warning?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-2
      ${accent
        ? "bg-[#002147] border-[#002147]"
        : warning
          ? "bg-amber-50 border-amber-200"
          : "bg-white border-slate-200"}`}>
      <p className={`text-xs font-mono uppercase tracking-wider
        ${accent ? "text-white/40" : warning ? "text-amber-500" : "text-slate-400"}`}>
        {label}
      </p>
      <p className={`text-2xl font-bold font-mono leading-none
        ${accent ? "text-[#50C878]" : warning ? "text-amber-700" : "text-slate-800"}`}>
        {value}
      </p>
      {sub && (
        <p className={`text-xs ${accent ? "text-white/30" : warning ? "text-amber-500" : "text-slate-400"} font-mono`}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { employees, company, loading } = useApp();

  // ── Onboarding checklist dismissed state ──────────────────────────────
  const [checklistDismissed, setChecklistDismissed] = useState(false);
  useEffect(() => {
    try {
      setChecklistDismissed(localStorage.getItem("slipdesk_checklist_dismissed") === "1");
    } catch { /* private browsing */ }
  }, []);
  function dismissChecklist() {
    try { localStorage.setItem("slipdesk_checklist_dismissed", "1"); } catch { /* ignore */ }
    setChecklistDismissed(true);
  }

  const monthLabel = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  // Payroll preview for all active employees
  const preview = useMemo(() => {
    const active = employees.filter((e) => e.isActive);
    const results = active.map((emp) =>
      calculatePayroll({
        employeeId:         emp.id,
        currency:           emp.currency,
        rate:               emp.rate,
        regularHours:       emp.standardHours,
        overtimeHours:      0,
        holidayHours:       0,
        exchangeRate:       EXCHANGE_RATE,
        additionalEarnings: emp.allowances ?? 0,
      }),
    );

    const toUSD = (n: number, ccy: string) => ccy === "USD" ? n : n / EXCHANGE_RATE;
    let gross = 0, net = 0, incomeTax = 0, nasscorp = 0, warnings = 0;
    results.forEach((r, i) => {
      const ccy = active[i].currency;
      gross     += toUSD(r.grossPay, ccy);
      net       += toUSD(r.netPay, ccy);
      incomeTax += toUSD(r.Paye.taxInBase, ccy);
      nasscorp  += toUSD(r.nasscorp.employeeContribution, ccy);
      if (r.warnings.length > 0) warnings++;
    });

    return { results, active, gross, net, incomeTax, nasscorp, warnings };
  }, [employees]);

  const platformFee      = calcFee(preview.active.length);
  const isSetupIncomplete = !company?.name || !company?.tin;

  // ── Setup nudge ────────────────────────────────────────────────────────────
  if (!loading && employees.length === 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">{monthLabel}</p>
        </div>

        <div className="bg-[#002147] rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[#50C878]/20 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-[#50C878]" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            Welcome to Slipdesk{company?.name ? `, ${company.name}` : ""}
          </h2>
          <p className="text-white/50 text-sm mb-8 max-w-sm mx-auto">
            You're all set up. Add your first employee to start running payroll.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/employees"
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl
                         bg-[#50C878] text-[#002147] font-semibold text-sm hover:bg-[#3aa85f]">
              <Users className="w-4 h-4" /> Add Employees
            </Link>
            {isSetupIncomplete && (
              <Link href="/settings"
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl
                           border border-white/20 text-white text-sm hover:bg-white/5">
                <Building2 className="w-4 h-4" /> Complete Company Profile
              </Link>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Getting started</h3>
          <div className="space-y-3">
            {[
              { done: !!company?.name,      label: "Set up company profile",  href: "/settings"  },
              { done: !!company?.tin,        label: "Add LRA Tax ID (TIN)",    href: "/settings"  },
              { done: employees.length > 0,  label: "Add your first employee", href: "/employees" },
              { done: false,                 label: "Run your first payroll",  href: "/payroll"   },
            ].map((step) => (
              <Link key={step.label} href={step.href}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
                {step.done
                  ? <CheckCircle2 className="w-5 h-5 text-[#50C878] flex-shrink-0" />
                  : <div className="w-5 h-5 rounded-full border-2 border-slate-300 flex-shrink-0" />}
                <span className={`text-sm ${step.done ? "text-slate-400 line-through" : "text-slate-700"}`}>
                  {step.label}
                </span>
                {!step.done && (
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-[#50C878] ml-auto transition-colors" />
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Main dashboard ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">{monthLabel} · Payroll preview</p>
        </div>
        <Link href="/payroll"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                     bg-[#50C878] text-[#002147] hover:bg-[#3aa85f] transition-colors">
          <Play className="w-4 h-4" /> Start Pay Run
        </Link>
      </div>

      {/* Company profile nudge */}
      {isSetupIncomplete && !loading && (
        <Link href="/settings"
          className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 hover:bg-blue-100 transition-colors">
          <Building2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-800">Complete your company profile</p>
            <p className="text-xs text-blue-500 mt-0.5">Add your TIN and NASSCORP number to appear on payslips</p>
          </div>
          <ArrowRight className="w-4 h-4 text-blue-400" />
        </Link>
      )}

      {/* Warning banner */}
      {preview.warnings > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700">
            <strong>{preview.warnings} employee{preview.warnings > 1 ? "s" : ""}</strong> have gross pay below the $150 minimum wage threshold.
          </p>
          <Link href="/payroll" className="ml-auto text-xs font-semibold text-amber-600 hover:text-amber-800 whitespace-nowrap">
            Review →
          </Link>
        </div>
      )}

      {/* Onboarding checklist banner */}
      {!checklistDismissed && !loading && (
        <div className="bg-white border border-[#50C878]/40 rounded-2xl p-5 relative">
          <button
            onClick={dismissChecklist}
            aria-label="Dismiss checklist"
            className="absolute top-4 right-4 text-slate-300 hover:text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#50C878]" /> Getting started
          </h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              { done: !!company?.name && !!company?.tin, label: "Complete company profile", href: "/settings"  },
              { done: employees.length > 0,              label: "Add your first employee",  href: "/employees" },
              { done: employees.some((e) => e.isActive), label: "Activate an employee",     href: "/employees" },
              { done: false,                             label: "Run your first payroll",   href: "/payroll"   },
            ].map((step) => (
              <a key={step.label} href={step.href}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors group
                  ${step.done
                    ? "border-emerald-100 bg-emerald-50/50 pointer-events-none"
                    : "border-slate-100 hover:border-[#50C878]/40 hover:bg-emerald-50/30"}`}>
                {step.done
                  ? <CheckCircle2 className="w-4 h-4 text-[#50C878] flex-shrink-0" />
                  : <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0 group-hover:border-[#50C878] transition-colors" />}
                <span className={`text-sm ${step.done ? "text-slate-400 line-through" : "text-slate-700"}`}>
                  {step.label}
                </span>
                {!step.done && <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#50C878] ml-auto transition-colors" />}
              </a>
            ))}
          </div>
          {[!!company?.name && !!company?.tin, employees.length > 0, employees.some(e => e.isActive), false].filter(Boolean).length === 3 && (
            <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-[#50C878]" /> Almost there — run your first pay run to complete setup.
            </p>
          )}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Active Employees"
          value={preview.active.length}
          sub={`${employees.length} total`}
        />
        <StatCard
          label="Est. Gross Payroll"
          value={fmt(preview.gross)}
          sub="USD equivalent"
          accent
        />
        <StatCard
          label="Income Tax (LRA)"
          value={fmt(preview.incomeTax)}
          sub="Employee deduction"
        />
        <StatCard
          label="NASSCORP (EE)"
          value={fmt(preview.nasscorp)}
          sub="4% of base salary"
        />
        <StatCard
          label="Est. Net Payroll"
          value={fmt(preview.net)}
          sub="After all deductions"
        />
        <StatCard
          label="NASSCORP (ER)"
          value="6%"
          sub="Employer contribution"
        />
        <StatCard
          label="Compliance Warnings"
          value={preview.warnings}
          sub={preview.warnings === 0 ? "All clear" : "Below minimum wage"}
          warning={preview.warnings > 0}
        />
        {/* ✅ Updated: $0.75 rate, no minimum, correct sub-label */}
        <StatCard
          label="Platform Fee"
          value={platformFee > 0 ? fmt(platformFee) : "$0.00"}
          sub={preview.active.length > 0
            ? `${preview.active.length} emp × $${RATE_PER_EMPLOYEE.toFixed(2)}`
            : "No active employees"}
        />
      </div>

      {/* Employee snapshot table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" /> Employee Snapshot
          </h2>
          <Link href="/employees"
            className="text-xs text-[#50C878] font-semibold hover:text-[#3aa85f] flex items-center gap-1">
            All employees <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {preview.results.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-slate-400 text-sm">No active employees</p>
            <Link href="/employees"
              className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-xs font-semibold rounded-xl
                         bg-[#50C878] text-[#002147] hover:bg-[#3aa85f]">
              <Users className="w-3.5 h-3.5" /> Add Employees
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Employee", "Dept", "CCY", "Rate/hr", "Gross", "Income Tax", "NASSCORP", "Net Pay", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-mono text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.results.slice(0, 8).map((result, i) => {
                  const emp        = preview.active[i];
                  const sym        = emp.currency === "USD" ? "$" : "L$";
                  const hasWarning = result.warnings.length > 0;
                  return (
                    <tr key={result.employeeId}
                      className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors
                        ${hasWarning ? "border-l-2 border-l-amber-400" : "border-l-2 border-l-transparent"}`}>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#002147]/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-[#002147] text-[10px] font-bold">
                              {emp.firstName[0]}{emp.lastName[0]}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-slate-700 text-xs leading-tight">{emp.fullName}</p>
                            <p className="text-[10px] text-slate-400">{emp.employeeNumber}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">{emp.department}</td>
                      <td className="px-4 py-3.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                          ${emp.currency === "USD" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                          {emp.currency}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-600">{sym}{emp.rate.toFixed(2)}</td>
                      <td className="px-4 py-3.5 font-mono text-xs font-semibold text-slate-700">{sym}{result.grossPay.toFixed(2)}</td>
                      <td className="px-4 py-3.5 font-mono text-xs text-red-500">{sym}{result.Paye.taxInBase.toFixed(2)}</td>
                      <td className="px-4 py-3.5 font-mono text-xs text-orange-500">{sym}{result.nasscorp.employeeContribution.toFixed(2)}</td>
                      <td className="px-4 py-3.5 font-mono text-xs font-bold text-emerald-600">{sym}{result.netPay.toFixed(2)}</td>
                      <td className="px-4 py-3.5">
                        {hasWarning
                          ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          : <CheckCircle2  className="w-3.5 h-3.5 text-emerald-400" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {preview.results.length > 8 && (
          <div className="px-5 py-3 border-t border-slate-100 text-center">
            <Link href="/payroll" className="text-xs text-slate-400 hover:text-[#50C878] font-mono">
              + {preview.results.length - 8} more employees — view full payroll →
            </Link>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { href: "/payroll",   icon: Play,      label: "Start Pay Run",    sub: "Process this month's payroll"           },
          { href: "/employees", icon: Users,      label: "Manage Employees", sub: `${employees.length} total employees`   },
          { href: "/billing",   icon: TrendingUp, label: "View Billing",     sub: `${fmt(platformFee)}/month · $0.75/emp` },
        ].map((action) => (
          <Link key={action.href} href={action.href}
            className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-[#50C878]
                       hover:shadow-sm transition-all group flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-[#50C878]/10
                            flex items-center justify-center flex-shrink-0 transition-colors">
              <action.icon className="w-5 h-5 text-slate-400 group-hover:text-[#50C878] transition-colors" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">{action.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{action.sub}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-200 group-hover:text-[#50C878] ml-auto transition-colors" />
          </Link>
        ))}
      </div>

    </div>
  );
}
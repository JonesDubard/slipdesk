"use client";

/**
 * Slipdesk — Dashboard Page (Dark Theme)
 * Place at: src/app/(dashboard)/dashboard/page.tsx
 */

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import {
  Users, TrendingUp, AlertTriangle, CheckCircle2,
  ArrowRight, Play, FileText, Building2, X, Sparkles,
  DollarSign, ShieldCheck, Zap,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { calculatePayroll } from "@/lib/slipdesk-payroll-engine";

// ─── Constants ────────────────────────────────────────────────────────────────

const EXCHANGE_RATE     = 185.44;
const RATE_PER_EMPLOYEE = 0.75;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function calcFee(count: number) {
  return Math.round(count * RATE_PER_EMPLOYEE * 100) / 100;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent = false, warning = false, icon,
}: {
  label: string; value: string | number; sub?: string;
  accent?: boolean; warning?: boolean; icon?: React.ReactNode;
}) {
  return (
    <div style={{
      background: accent ? "#002147" : warning ? "#fb923c12" : "#0d1f35",
      border: `1px solid ${accent ? "#1e3a5f" : warning ? "#fb923c40" : "#1e3a5f"}`,
      borderRadius: 16, padding: "20px",
      display: "flex", flexDirection: "column", gap: 12,
      transition: "border-color 0.2s",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{
          fontSize: 10, fontWeight: 600, color: accent ? "#ffffff40" : warning ? "#fb923c" : "#334155",
          letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'DM Mono',monospace",
        }}>
          {label}
        </p>
        {icon && (
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: accent ? "#ffffff10" : warning ? "#fb923c20" : "#50C87815",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {icon}
          </div>
        )}
      </div>
      <p style={{
        fontSize: 22, fontWeight: 800, fontFamily: "'DM Mono',monospace", lineHeight: 1,
        color: accent ? "#50C878" : warning ? "#fb923c" : "#f1f5f9",
      }}>
        {value}
      </p>
      {sub && (
        <p style={{
          fontSize: 11, color: accent ? "#ffffff30" : warning ? "#fb923c80" : "#334155",
          fontFamily: "'DM Mono',monospace",
        }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { employees, company, loading } = useApp();

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

  const platformFee       = calcFee(preview.active.length);
  const isSetupIncomplete = !company?.name || !company?.tin;

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!loading && employees.length === 0) {
    return (
      <div style={{ padding: "32px", minHeight: "100vh", background: "#071525", fontFamily: "'DM Sans',sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;600&display=swap');`}</style>

        <div style={{ marginBottom: 28 }}>
          <h1 style={{ color: "#f1f5f9", fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Dashboard</h1>
          <p style={{ color: "#334155", fontSize: 13, marginTop: 5, fontFamily: "'DM Mono',monospace" }}>{monthLabel}</p>
        </div>

        <div style={{
          background: "#0d1f35", border: "1px solid #1e3a5f", borderRadius: 20,
          padding: "60px 40px", textAlign: "center", maxWidth: 520,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: "#50C87820", border: "1px solid #50C87840",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
          }}>
            <Building2 size={28} color="#50C878"/>
          </div>
          <h2 style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>
            Welcome to Slipdesk{company?.name ? `, ${company.name}` : ""}
          </h2>
          <p style={{ color: "#334155", fontSize: 13, marginBottom: 28 }}>
            Add your first employee to start running payroll.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/employees" style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "11px 20px", borderRadius: 11, background: "#50C878",
              color: "#002147", fontWeight: 700, fontSize: 13, textDecoration: "none",
            }}>
              <Users size={15}/> Add Employees
            </Link>
            {isSetupIncomplete && (
              <Link href="/settings" style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "11px 20px", borderRadius: 11,
                border: "1px solid #1e3a5f", color: "#94a3b8",
                fontSize: 13, fontWeight: 600, textDecoration: "none",
              }}>
                <Building2 size={15}/> Complete Profile
              </Link>
            )}
          </div>
        </div>

        {/* Getting started checklist */}
        <div style={{ background: "#0d1f35", border: "1px solid #1e3a5f", borderRadius: 16, padding: "24px", marginTop: 16, maxWidth: 520 }}>
          <h3 style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={14} color="#50C878"/> Getting started
          </h3>
          {[
            { done: !!company?.name && !!company?.tin, label: "Complete company profile", href: "/settings"  },
            { done: employees.length > 0,              label: "Add your first employee",  href: "/employees" },
            { done: false,                             label: "Run your first payroll",   href: "/payroll"   },
          ].map((step) => (
            <Link key={step.label} href={step.href} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
              borderRadius: 10, marginBottom: 6, textDecoration: "none",
              background: step.done ? "#50C87808" : "transparent",
              border: `1px solid ${step.done ? "#50C87825" : "#1e3a5f"}`,
            }}>
              {step.done
                ? <CheckCircle2 size={16} color="#50C878"/>
                : <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #334155", flexShrink: 0 }}/>
              }
              <span style={{ color: step.done ? "#334155" : "#94a3b8", fontSize: 13, textDecoration: step.done ? "line-through" : "none", flex: 1 }}>
                {step.label}
              </span>
              {!step.done && <ArrowRight size={14} color="#334155"/>}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // ── Main dashboard ─────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "32px", minHeight: "100vh", background: "#071525", fontFamily: "'DM Sans',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;600&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .dash-link:hover { border-color: #50C87850 !important; }
        .dash-link:hover .dash-link-icon { background: #50C87820 !important; }
        .dash-link:hover .dash-link-arrow { color: #50C878 !important; }
        .emp-row:hover td { background: #0d213750 !important; }
        .checklist-item:hover { border-color: #50C87840 !important; background: #50C8780A !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12, animation: "fadeUp 0.3s ease" }}>
        <div>
          <h1 style={{ color: "#f1f5f9", fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Dashboard</h1>
          <p style={{ color: "#334155", fontSize: 13, marginTop: 5, fontFamily: "'DM Mono',monospace" }}>
            {monthLabel} · payroll preview
          </p>
        </div>
        <Link href="/payroll" style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "10px 18px", borderRadius: 11, background: "#50C878",
          color: "#002147", fontWeight: 700, fontSize: 13, textDecoration: "none",
          transition: "opacity 0.15s",
        }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = "0.88"}
          onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
        >
          <Play size={14}/> Start Pay Run
        </Link>
      </div>

      {/* Alerts */}
      {isSetupIncomplete && !loading && (
        <Link href="/settings" style={{
          display: "flex", alignItems: "center", gap: 12,
          background: "#38bdf815", border: "1px solid #38bdf830",
          borderRadius: 12, padding: "13px 18px", marginBottom: 14,
          textDecoration: "none", transition: "border-color 0.2s",
          animation: "fadeUp 0.3s ease",
        }}>
          <Building2 size={14} color="#38bdf8"/>
          <div style={{ flex: 1 }}>
            <p style={{ color: "#38bdf8", fontWeight: 600, fontSize: 13, margin: 0 }}>Complete your company profile</p>
            <p style={{ color: "#38bdf880", fontSize: 11, margin: "2px 0 0" }}>Add your TIN and NASSCORP number to appear on payslips</p>
          </div>
          <ArrowRight size={14} color="#38bdf8"/>
        </Link>
      )}

      {preview.warnings > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          background: "#fb923c12", border: "1px solid #fb923c30",
          borderRadius: 12, padding: "13px 18px", marginBottom: 14,
          animation: "fadeUp 0.3s ease",
        }}>
          <AlertTriangle size={14} color="#fb923c"/>
          <p style={{ color: "#fb923c", fontSize: 13, margin: 0, flex: 1 }}>
            <strong>{preview.warnings} employee{preview.warnings > 1 ? "s" : ""}</strong> have gross pay below the $150 minimum wage threshold.
          </p>
          <Link href="/payroll" style={{ color: "#fb923c", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>Review →</Link>
        </div>
      )}

      {/* Onboarding checklist */}
      {!checklistDismissed && !loading && (
        <div style={{
          background: "#0d1f35", border: "1px solid #1e3a5f", borderRadius: 16,
          padding: "20px 22px", marginBottom: 20, position: "relative",
          animation: "fadeUp 0.35s ease 0.05s both",
        }}>
          <button onClick={dismissChecklist} style={{
            position: "absolute", top: 16, right: 16, width: 26, height: 26,
            borderRadius: 7, border: "none", background: "#ffffff10",
            color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <X size={12}/>
          </button>
          <h3 style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14, margin: "0 0 14px", display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={14} color="#50C878"/> Getting started
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { done: !!company?.name && !!company?.tin, label: "Complete company profile", href: "/settings"  },
              { done: employees.length > 0,              label: "Add your first employee",  href: "/employees" },
              { done: employees.some((e) => e.isActive), label: "Activate an employee",     href: "/employees" },
              { done: false,                             label: "Run your first payroll",   href: "/payroll"   },
            ].map((step) => (
              <Link key={step.label} href={step.href} className="checklist-item" style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderRadius: 10, border: `1px solid ${step.done ? "#50C87825" : "#1e3a5f"}`,
                background: step.done ? "#50C87808" : "transparent",
                textDecoration: "none", transition: "all 0.15s",
                pointerEvents: step.done ? "none" : "auto",
              }}>
                {step.done
                  ? <CheckCircle2 size={14} color="#50C878"/>
                  : <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid #334155", flexShrink: 0 }}/>
                }
                <span style={{ color: step.done ? "#334155" : "#94a3b8", fontSize: 12, textDecoration: step.done ? "line-through" : "none", flex: 1 }}>
                  {step.label}
                </span>
                {!step.done && <ArrowRight size={12} color="#334155"/>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20, animation: "fadeUp 0.4s ease 0.1s both" }}>
        <StatCard label="Active Employees" value={preview.active.length} sub={`${employees.length} total`} icon={<Users size={13} color="#50C878"/>}/>
        <StatCard label="Est. Gross Payroll" value={fmt(preview.gross)} sub="USD equivalent" accent icon={<DollarSign size={13} color="#50C878"/>}/>
        <StatCard label="Income Tax (LRA)" value={fmt(preview.incomeTax)} sub="Employee deduction" icon={<FileText size={13} color="#334155"/>}/>
        <StatCard label="NASSCORP (EE)" value={fmt(preview.nasscorp)} sub="4% of base salary" icon={<ShieldCheck size={13} color="#334155"/>}/>
        <StatCard label="Est. Net Payroll" value={fmt(preview.net)} sub="After all deductions" icon={<TrendingUp size={13} color="#50C878"/>}/>
        <StatCard label="NASSCORP (ER)" value="6%" sub="Employer contribution" icon={<ShieldCheck size={13} color="#334155"/>}/>
        <StatCard
          label="Compliance Warnings"
          value={preview.warnings}
          sub={preview.warnings === 0 ? "All clear ✓" : "Below minimum wage"}
          warning={preview.warnings > 0}
          icon={preview.warnings > 0 ? <AlertTriangle size={13} color="#fb923c"/> : <CheckCircle2 size={13} color="#50C878"/>}
        />
        <StatCard
          label="Platform Fee"
          value={platformFee > 0 ? fmt(platformFee) : "$0.00"}
          sub={preview.active.length > 0 ? `${preview.active.length} emp × $${RATE_PER_EMPLOYEE.toFixed(2)}` : "No active employees"}
          icon={<Zap size={13} color="#334155"/>}
        />
      </div>

      {/* Employee snapshot */}
      <div style={{ background: "#0d1f35", border: "1px solid #1e3a5f", borderRadius: 16, overflow: "hidden", marginBottom: 20, animation: "fadeUp 0.45s ease 0.15s both" }}>
        <div style={{
          background: "#002147", padding: "14px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <FileText size={14} color="rgba(255,255,255,0.3)"/> Employee Snapshot
          </span>
          <Link href="/employees" style={{
            display: "flex", alignItems: "center", gap: 5,
            color: "#50C878", fontSize: 12, fontWeight: 600, textDecoration: "none",
            fontFamily: "'DM Mono',monospace",
          }}>
            All employees <ArrowRight size={12}/>
          </Link>
        </div>

        {preview.results.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <Users size={28} color="#1e3a5f" style={{ margin: "0 auto 12px", display: "block" }}/>
            <p style={{ color: "#334155", fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>No active employees</p>
            <Link href="/employees" style={{
              display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14,
              padding: "9px 16px", borderRadius: 10, background: "#50C878",
              color: "#002147", fontSize: 12, fontWeight: 700, textDecoration: "none",
            }}>
              <Users size={13}/> Add Employees
            </Link>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
              <thead>
                <tr>
                  {["Employee","Dept","CCY","Rate/hr","Gross","Tax","NASSCORP","Net Pay",""].map((h) => (
                    <th key={h} style={{
                      padding: "10px 14px", background: "#071525",
                      borderBottom: "1px solid #1e3a5f",
                      fontSize: 10, fontWeight: 700, color: "#334155",
                      letterSpacing: "0.08em", textTransform: "uppercase",
                      fontFamily: "'DM Mono',monospace", textAlign: "left", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.results.slice(0, 8).map((result, i) => {
                  const emp     = preview.active[i];
                  const sym     = emp.currency === "USD" ? "$" : "L$";
                  const hasWarn = result.warnings.length > 0;
                  return (
                    <tr key={result.employeeId} className="emp-row" style={{
                      borderLeft: `3px solid ${hasWarn ? "#fb923c" : "transparent"}`,
                      borderBottom: "1px solid #0d2137",
                    }}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: "50%",
                            background: "#50C87820", border: "1px solid #50C87840",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, fontWeight: 700, color: "#50C878",
                            fontFamily: "'DM Mono',monospace", flexShrink: 0,
                          }}>
                            {emp.firstName[0]}{emp.lastName[0]}
                          </div>
                          <div>
                            <p style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 12, margin: 0 }}>{emp.fullName}</p>
                            <p style={{ color: "#334155", fontSize: 10, margin: 0, fontFamily: "'DM Mono',monospace" }}>{emp.employeeNumber}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", color: "#475569", fontSize: 11 }}>{emp.department}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10,
                          background: emp.currency === "USD" ? "#1e3a5f" : "#2a2a1a",
                          color: emp.currency === "USD" ? "#38bdf8" : "#f59e0b",
                        }}>
                          {emp.currency}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#94a3b8" }}>{sym}{emp.rate.toFixed(2)}</td>
                      <td style={{ padding: "12px 14px", fontFamily: "'DM Mono',monospace", fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{sym}{result.grossPay.toFixed(2)}</td>
                      <td style={{ padding: "12px 14px", fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#f87171" }}>{sym}{result.Paye.taxInBase.toFixed(2)}</td>
                      <td style={{ padding: "12px 14px", fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#fb923c" }}>{sym}{result.nasscorp.employeeContribution.toFixed(2)}</td>
                      <td style={{ padding: "12px 14px", fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 800, color: "#50C878" }}>{sym}{result.netPay.toFixed(2)}</td>
                      <td style={{ padding: "12px 14px" }}>
                        {hasWarn
                          ? <AlertTriangle size={13} color="#fb923c" style={{ display: "block", margin: "0 auto" }}/>
                          : <CheckCircle2  size={13} color="#50C87860" style={{ display: "block", margin: "0 auto" }}/>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {preview.results.length > 8 && (
          <div style={{ padding: "12px", textAlign: "center", borderTop: "1px solid #0d2137" }}>
            <Link href="/payroll" style={{ color: "#334155", fontSize: 11, fontFamily: "'DM Mono',monospace", textDecoration: "none" }}>
              + {preview.results.length - 8} more employees — view full payroll →
            </Link>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, animation: "fadeUp 0.5s ease 0.2s both" }}>
        {[
          { href: "/payroll",   icon: <Play size={18} color="#334155"/>,      label: "Start Pay Run",    sub: "Process this month's payroll"         },
          { href: "/employees", icon: <Users size={18} color="#334155"/>,     label: "Manage Employees", sub: `${employees.length} total employees`   },
          { href: "/billing",   icon: <TrendingUp size={18} color="#334155"/>, label: "View Billing",    sub: `${fmt(platformFee)}/month · $0.75/emp` },
        ].map((action) => (
          <Link key={action.href} href={action.href} className="dash-link" style={{
            display: "flex", alignItems: "center", gap: 14, padding: "18px 20px",
            background: "#0d1f35", border: "1px solid #1e3a5f", borderRadius: 16,
            textDecoration: "none", transition: "border-color 0.2s",
          }}>
            <div className="dash-link-icon" style={{
              width: 40, height: 40, borderRadius: 11,
              background: "#071525", border: "1px solid #1e3a5f",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "background 0.2s",
            }}>
              {action.icon}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 13, margin: 0 }}>{action.label}</p>
              <p style={{ color: "#334155", fontSize: 11, margin: "3px 0 0" }}>{action.sub}</p>
            </div>
            <ArrowRight size={14} color="#334155" className="dash-link-arrow" style={{ transition: "color 0.2s" }}/>
          </Link>
        ))}
      </div>
    </div>
  );
}
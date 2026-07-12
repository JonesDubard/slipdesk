"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Loader } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { canUse, getEffectiveTier, PLAN_LABELS } from "@/lib/plan-features";
import { can } from "@/lib/rbac";
import type { CalendarMonth } from "@/lib/payroll/periods";
import { ModuleShell, ModuleHeader, Card, UpgradeNotice } from "@/components/module-ui";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function PayrollCalendarPage() {
  const { company, role } = useApp();
  const tier = getEffectiveTier(company.subscriptionTier, company.billingBypass);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [calendar, setCalendar] = useState<CalendarMonth | null>(null);
  const [runs, setRuns] = useState<{ id: string; status?: string; periodLabel?: string; payDate?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payroll/calendar?year=${year}&month=${month}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setCalendar(data.calendar);
      setRuns(data.runs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { void load(); }, [load]);

  if (!canUse("payrollCalendar", tier)) {
    return (
      <UpgradeNotice
        title="Payroll Calendar"
        requiredPlan={PLAN_LABELS.standard}
        description="See pay periods, payday highlights, and past payroll runs on a monthly calendar — available on Professional and above."
      />
    );
  }

  if (!can(role, "payroll:view")) {
    return (
      <UpgradeNotice title="Payroll Calendar" requiredPlan="an authorized"
        description="Your role does not have access to payroll." />
    );
  }

  function shift(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  return (
    <ModuleShell>
      <ModuleHeader
        title="Payroll Calendar"
        subtitle="Pay periods, payday, and run history"
      />

      <Card data-testid="payroll-calendar">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CalendarDays size={16} color="var(--primary)" />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{calendar?.label ?? "…"}</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => shift(-1)} style={navBtn} aria-label="Previous month"><ChevronLeft size={16} /></button>
            <button type="button" onClick={() => { const n = new Date(); setYear(n.getFullYear()); setMonth(n.getMonth() + 1); }} style={navBtn}>Today</button>
            <button type="button" onClick={() => shift(1)} style={navBtn} aria-label="Next month"><ChevronRight size={16} /></button>
          </div>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted-foreground)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <Loader size={14} className="animate-spin" /> Loading…
          </p>
        ) : error ? (
          <p style={{ color: "var(--destructive)", fontSize: 13 }}>{error}</p>
        ) : calendar ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
              {WEEKDAYS.map((d) => (
                <div key={d} style={{ textAlign: "center", fontSize: 11, fontFamily: "'DM Mono',monospace", color: "var(--muted-foreground)", padding: 6 }}>{d}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {calendar.weeks.flat().map((day) => (
                <div
                  key={day.date}
                  style={{
                    minHeight: 64, borderRadius: 10, padding: 8,
                    border: day.isToday ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: day.isPayDate
                      ? "color-mix(in oklch, var(--primary) 14%, transparent)"
                      : day.inMonth ? "var(--card)" : "transparent",
                    opacity: day.inMonth ? 1 : 0.4,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: day.isPayDate ? 700 : 500, color: "var(--foreground)" }}>
                    {Number(day.date.slice(8, 10))}
                  </div>
                  {day.isPayDate && <div style={{ fontSize: 9, color: "var(--primary)", marginTop: 2 }}>Payday</div>}
                  {day.runIds.length > 0 && (
                    <div style={{ display: "flex", gap: 3, marginTop: 6, flexWrap: "wrap" }}>
                      {day.runIds.slice(0, 3).map((id) => (
                        <span key={id} style={{ width: 7, height: 7, borderRadius: 99, background: "var(--primary)" }} title={id} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p style={{ marginTop: 14, fontSize: 11, color: "var(--muted-foreground)", fontFamily: "'DM Mono',monospace" }}>
              Period {calendar.currentPeriod.start} → {calendar.currentPeriod.end} · Payday {calendar.currentPeriod.payDate}
            </p>
          </>
        ) : null}
      </Card>

      <Card style={{ marginTop: 16 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Recent pay runs</h3>
        {runs.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>No pay runs yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {runs.slice(0, 12).map((r) => (
              <li key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}>
                <span>{r.periodLabel || r.payDate || r.id.slice(0, 8)}</span>
                <span style={{ fontFamily: "'DM Mono',monospace", color: "var(--muted-foreground)", fontSize: 11 }}>{r.status || "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </ModuleShell>
  );
}

const navBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  padding: "7px 10px", borderRadius: 9, border: "1px solid var(--border)",
  background: "var(--background)", color: "var(--foreground)", cursor: "pointer", fontSize: 12, fontWeight: 600,
};

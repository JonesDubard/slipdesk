"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { can } from "@/lib/rbac";

type Row = {
  id: string;
  employee_id: string;
  work_date: string;
  hours_worked: number;
  status: string;
  source: string;
  employees?: { full_name?: string; employee_number?: string };
};

export default function HrAttendancePage() {
  const { role } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dailyHours, setDailyHours] = useState(8);
  const [busy, setBusy] = useState(false);
  const [dailyOt, setDailyOt] = useState(true);
  const [weeklyOt, setWeeklyOt] = useState(false);
  const [schedulerHour, setSchedulerHour] = useState(2);

  const allowed = can(role, "attendance:manage");

  const load = useCallback(async () => {
    const [attRes, cfgRes] = await Promise.all([
      fetch("/api/hr/attendance"),
      fetch("/api/hr/attendance-config"),
    ]);
    const data = await attRes.json();
    if (!attRes.ok) throw new Error(data.error ?? "Failed to load");
    setRows(data.records ?? []);
    if (data.laborRules?.standardDailyHours) setDailyHours(data.laborRules.standardDailyHours);
    if (cfgRes.ok) {
      const cfg = await cfgRes.json();
      if (cfg.config) {
        setDailyOt(Boolean(cfg.config.dailyOtEnabled));
        setWeeklyOt(Boolean(cfg.config.weeklyOtEnabled));
        setSchedulerHour(Number(cfg.config.schedulerHourLocal ?? 2));
        setDailyHours(Number(cfg.config.dailyHoursThreshold ?? 8));
      }
    }
  }, []);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [allowed, load]);

  async function flagMissing() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flag_missing_clockouts" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function correct(row: Row) {
    const hoursStr = window.prompt("Corrected hours for this day:", String(row.hours_worked));
    if (hoursStr == null) return;
    const hours = Number(hoursStr);
    setBusy(true);
    try {
      const res = await fetch("/api/hr/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "correct",
          employeeId: row.employee_id,
          workDate: String(row.work_date).slice(0, 10),
          hours,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Correction failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Correction failed");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <div className="p-8">
        <p className="text-sm text-slate-500">You do not have permission to manage attendance.</p>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#002147]">Time & attendance</h1>
          <p className="text-sm text-slate-500 mt-1">
            OT auto-calculated beyond {dailyHours} hrs/day at 1.5× (configurable labor rules).
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void flagMissing()}
          className="text-sm px-3 py-2 rounded-xl border border-slate-200 bg-white disabled:opacity-50"
        >
          Flag missing clock-outs
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap gap-4 items-end text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={dailyOt}
            onChange={(e) => setDailyOt(e.target.checked)}
          />
          Daily OT
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={weeklyOt}
            onChange={(e) => setWeeklyOt(e.target.checked)}
          />
          Weekly OT
        </label>
        <label className="text-slate-600">
          Scheduler hour (local)
          <input
            type="number"
            min={0}
            max={23}
            value={schedulerHour}
            onChange={(e) => setSchedulerHour(Number(e.target.value))}
            className="ml-2 w-16 rounded-lg border border-slate-200 px-2 py-1"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          className="text-sm px-3 py-1.5 rounded-lg bg-[#002147] text-white disabled:opacity-50"
          onClick={async () => {
            setBusy(true);
            try {
              await fetch("/api/hr/attendance-config", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  config: {
                    dailyOtEnabled: dailyOt,
                    weeklyOtEnabled: weeklyOt,
                    schedulerHourLocal: schedulerHour,
                  },
                }),
              });
              await load();
            } finally {
              setBusy(false);
            }
          }}
        >
          Save OT / schedule settings
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="text-sm text-slate-400 flex items-center gap-2">
          <Loader className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Employee</th>
                <th className="px-3 py-2.5">Hours</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Source</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2.5 font-mono text-xs">{String(r.work_date).slice(0, 10)}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{r.employees?.full_name ?? "—"}</div>
                    <div className="text-xs text-slate-400 font-mono">{r.employees?.employee_number}</div>
                  </td>
                  <td className="px-3 py-2.5 font-mono">{Number(r.hours_worked).toFixed(2)}</td>
                  <td className="px-3 py-2.5 capitalize text-xs">{r.status.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2.5 text-xs">{r.source}</td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void correct(r)}
                      className="text-xs font-medium text-[#002147] hover:underline"
                    >
                      Correct
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

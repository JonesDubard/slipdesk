"use client";

import { useEffect, useState } from "react";
import { Loader, AlertCircle } from "lucide-react";
import type { AttendanceRecord } from "@/lib/attendance/attendance";

export default function PortalAttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [dailyHours, setDailyHours] = useState(8);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualDate, setManualDate] = useState("");
  const [manualHours, setManualHours] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/employee/attendance");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setRecords(data.records ?? []);
      if (data.laborRules?.standardDailyHours) setDailyHours(data.laborRules.standardDailyHours);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/employee/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#002147]">Time & attendance</h1>
        <p className="text-sm text-slate-500 mt-1">
          Clock in/out or enter hours. Hours beyond {dailyHours}/day become overtime at 1.5× for payroll.
        </p>
      </div>

      {error && (
        <div className="flex gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void post({ action: "clock_in" })}
          className="rounded-xl bg-[#002147] text-white py-3 text-sm font-semibold disabled:opacity-50"
        >
          Clock in
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void post({ action: "clock_out" })}
          className="rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold disabled:opacity-50"
        >
          Clock out
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <p className="text-sm font-medium text-slate-700">Manual hours</p>
        <div className="grid grid-cols-2 gap-3">
          <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <input type="number" step="0.25" min="0" max="24" placeholder="Hours" value={manualHours} onChange={(e) => setManualHours(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        </div>
        <button
          type="button"
          disabled={busy || !manualDate || !manualHours}
          onClick={() => void post({ action: "manual", workDate: manualDate, hours: Number(manualHours) })}
          className="w-full rounded-xl bg-slate-800 text-white py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          Save hours
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 flex items-center gap-2">
          <Loader className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <ul className="space-y-2">
          {records.map((r) => (
            <li key={r.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm flex justify-between gap-3">
              <div>
                <p className="font-medium">{r.workDate}</p>
                <p className="text-xs text-slate-400 capitalize">{r.source} · {r.status.replace(/_/g, " ")}</p>
              </div>
              <p className="font-mono text-[#002147]">{r.hoursWorked.toFixed(2)}h</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

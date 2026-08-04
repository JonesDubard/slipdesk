"use client";

import { useEffect, useState } from "react";
import { Loader, AlertCircle } from "lucide-react";
import type { LeaveRequestRecord, LeaveType } from "@/lib/leave/leave";

type Balance = {
  leaveType: string;
  allocated: number;
  used: number;
  pending: number;
  remaining: number;
};

export default function PortalLeavePage() {
  const [requests, setRequests] = useState<LeaveRequestRecord[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [isUnpaid, setIsUnpaid] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [leaveRes, balRes] = await Promise.all([
        fetch("/api/employee/leave"),
        fetch("/api/employee/leave-balances"),
      ]);
      const leaveData = await leaveRes.json();
      const balData = await balRes.json();
      if (!leaveRes.ok) throw new Error(leaveData.error ?? "Failed to load");
      setRequests(leaveData.requests ?? []);
      setBalances(balData.balances ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/employee/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveType, startDate, endDate, reason, isUnpaid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submit failed");
      setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#002147]">Leave requests</h1>
        <p className="text-sm text-slate-500 mt-1">
          Submit leave for HR approval. Unpaid leave adjusts payroll hours when approved.
        </p>
      </div>

      {error && (
        <div className="flex gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {balances.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {balances.map((b) => (
            <div key={b.leaveType} className="bg-white border border-slate-200 rounded-xl px-3 py-2">
              <p className="text-[11px] text-slate-400 uppercase capitalize">{b.leaveType}</p>
              <p className="text-sm font-semibold text-[#002147] mt-0.5">{b.remaining} left</p>
              <p className="text-[10px] text-slate-400">
                {b.used} used · {b.pending} pending · {b.allocated} allocated
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          Leave type
          <select
            value={leaveType}
            onChange={(e) => {
              const t = e.target.value as LeaveType;
              setLeaveType(t);
              if (t === "unpaid") setIsUnpaid(true);
            }}
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          >
            <option value="annual">Annual</option>
            <option value="sick">Sick</option>
            <option value="maternity">Maternity</option>
            <option value="unpaid">Unpaid</option>
            <option value="compassionate">Compassionate</option>
            <option value="other">Other</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-slate-700">
            Start
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            End
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
          </label>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Reason
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          />
        </label>
        {leaveType !== "unpaid" && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={isUnpaid} onChange={(e) => setIsUnpaid(e.target.checked)} />
            Treat as unpaid (deduct hours from payroll)
          </label>
        )}
        <button
          type="button"
          disabled={submitting || !startDate || !endDate}
          onClick={() => void submit()}
          className="w-full rounded-xl bg-[#002147] text-white py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit leave request"}
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 flex items-center gap-2">
          <Loader className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => (
            <li key={r.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-medium capitalize">{r.leaveType}</span>
                <span className="text-xs capitalize text-slate-500">{r.status.replace("_", " ")}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {r.startDate} → {r.endDate} · {r.days} day(s)
              </p>
              {r.hrNote && <p className="text-xs text-amber-700 mt-1">HR: {r.hrNote}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

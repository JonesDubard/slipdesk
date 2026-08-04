"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader, CheckCircle2, XCircle, MessageSquare } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { can } from "@/lib/rbac";
import type { LeaveRequestRecord } from "@/lib/leave/leave";

export default function HrLeavePage() {
  const { role } = useApp();
  const [items, setItems] = useState<LeaveRequestRecord[]>([]);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const allowed = can(role, "leave:review");

  const load = useCallback(async () => {
    const res = await fetch(`/api/hr/leave?status=${encodeURIComponent(status)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load");
    setItems(data.requests ?? []);
  }, [status]);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [allowed, load]);

  async function act(id: string, action: "approve" | "reject" | "request_info") {
    setBusyId(id);
    setError(null);
    try {
      let note: string | undefined;
      if (action === "reject") {
        note = window.prompt("Rejection reason (optional):") ?? undefined;
      }
      if (action === "request_info") {
        note = window.prompt("What information do you need?") ?? undefined;
        if (!note?.trim()) {
          setError("Please describe what information is needed.");
          return;
        }
      }
      const res = await fetch("/api/hr/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  if (!allowed) {
    return (
      <div className="p-8">
        <p className="text-sm text-slate-500">You do not have permission to review leave requests.</p>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#002147]">Leave requests</h1>
          <p className="text-sm text-slate-500 mt-1">Approve, reject, or request more information.</p>
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="pending">Pending</option>
          <option value="info_requested">Info requested</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="text-sm text-slate-400 flex items-center gap-2">
          <Loader className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">No leave requests in this filter.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800">{r.employeeName ?? "Employee"}</p>
                  <p className="text-xs text-slate-400 font-mono">{r.employeeNumber}</p>
                  <p className="text-sm text-slate-600 mt-2 capitalize">
                    {r.leaveType} · {r.startDate} → {r.endDate} · {r.days} day(s)
                    {r.isUnpaid ? " · unpaid" : ""}
                  </p>
                  {r.reason && <p className="text-xs text-slate-500 mt-1">{r.reason}</p>}
                </div>
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-slate-100 h-fit capitalize">{r.status.replace("_", " ")}</span>
              </div>
              {(r.status === "pending" || r.status === "info_requested") && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void act(r.id, "approve")}
                    className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void act(r.id, "reject")}
                    className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-100 disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void act(r.id, "request_info")}
                    className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 disabled:opacity-50"
                  >
                    <MessageSquare className="w-4 h-4" /> Request info
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader, CheckCircle2, XCircle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { can } from "@/lib/rbac";

type QueueItem = {
  id: string;
  employeeId: string;
  employeeName: string | null;
  employeeNumber: string | null;
  fieldType: string;
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  status: string;
  createdAt: string;
};

export default function HrChangeRequestsPage() {
  const { role } = useApp();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const allowed = can(role, "portal:review_changes");

  const load = useCallback(async () => {
    const res = await fetch("/api/hr/change-requests?status=pending");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load");
    setItems(data.requests ?? []);
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

  async function decide(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      let rejectionReason: string | undefined;
      if (action === "reject") {
        rejectionReason = window.prompt("Rejection reason (optional):") ?? "Rejected by HR";
      }
      const res = await fetch(`/api/hr/change-requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectionReason }),
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
        <p className="text-sm text-slate-500">You do not have permission to review employee change requests.</p>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#002147]">Employee change requests</h1>
        <p className="text-sm text-slate-500 mt-1">
          Approve or reject self-service updates. Nothing applies until you approve.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader className="w-4 h-4 animate-spin" /> Loading queue…
        </div>
      ) : !items.length ? (
        <p className="text-sm text-slate-500">No pending requests.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">
                    {item.employeeName ?? "Employee"}{" "}
                    <span className="text-slate-400 font-mono text-xs">{item.employeeNumber}</span>
                  </p>
                  <p className="text-sm text-slate-500 capitalize mt-0.5">
                    {item.fieldType.replace("_", " ")} · {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => decide(item.id, "approve")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#50C878] text-white text-sm font-medium disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => decide(item.id, "reject")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-sm font-medium disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              </div>
              <div className="mt-4 grid sm:grid-cols-2 gap-3 text-xs">
                <pre className="bg-slate-50 rounded-xl p-3 overflow-auto text-slate-600">
                  {JSON.stringify(item.oldValue, null, 2)}
                </pre>
                <pre className="bg-emerald-50/50 rounded-xl p-3 overflow-auto text-slate-600">
                  {JSON.stringify(item.newValue, null, 2)}
                </pre>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

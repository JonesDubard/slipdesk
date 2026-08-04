"use client";

import { useEffect, useState } from "react";
import { Loader } from "lucide-react";
import type { NasscorpContributionSummary } from "@/lib/employee-portal/nasscorp";

export default function PortalNasscorpPage() {
  const [summary, setSummary] = useState<NasscorpContributionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/employee/nasscorp")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        setSummary(data.nasscorp);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm">
        <Loader className="w-4 h-4 animate-spin" /> Loading NASSCORP…
      </div>
    );
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!summary) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[#002147]">NASSCORP contributions</h1>
        <p className="text-sm text-slate-500 mt-1">
          Cumulative employer + employee contributions from paid payslips (read-only).
          Rollups are in USD; LRD lines are converted using each payslip&apos;s exchange rate.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Employee (4%) USD" value={summary.employeeContributionTotal} />
        <Stat label="Employer (6%) USD" value={summary.employerContributionTotal} />
        <Stat label="Combined to date (USD)" value={summary.combinedTotal} emphasize />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 text-sm space-y-1">
        <p className="text-slate-500">NASSCORP number</p>
        <p className="font-mono text-slate-800">{summary.nasscorpNumber || "—"}</p>
        <p className="text-xs text-slate-400 pt-2">
          {summary.periodsCounted} paid period{summary.periodsCounted === 1 ? "" : "s"} · {summary.currencyNote}
        </p>
      </div>

      {summary.byCurrency?.length > 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">By currency (native)</p>
          <div className="space-y-2">
            {summary.byCurrency.map((c) => (
              <div key={c.currency} className="flex justify-between text-sm gap-3">
                <span className="font-mono text-slate-700">{c.currency} · {c.periods} period{c.periods === 1 ? "" : "s"}</span>
                <span className="font-mono text-slate-500">
                  EE {c.employeeContribution.toFixed(2)} · ER {c.employerContribution.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.lines.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Period</th>
                <th className="px-4 py-2.5 font-medium text-right">EE</th>
                <th className="px-4 py-2.5 font-medium text-right">ER</th>
                <th className="px-4 py-2.5 font-medium text-right">USD</th>
              </tr>
            </thead>
            <tbody>
              {summary.lines.map((line) => (
                <tr key={line.payslipId} className="border-t border-slate-100">
                  <td className="px-4 py-2.5">
                    <p className="text-slate-800">{line.periodLabel}</p>
                    <p className="text-[11px] text-slate-400">{line.payDate} · {line.currency}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">{line.employeeContribution.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{line.employerContribution.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-500">
                    {(line.employeeContributionUsd + line.employerContributionUsd).toFixed(2)}
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

function Stat({ label, value, emphasize }: { label: string; value: number; emphasize?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${emphasize ? "bg-[#002147] border-[#002147] text-white" : "bg-white border-slate-200"}`}>
      <p className={`text-xs ${emphasize ? "text-white/60" : "text-slate-400"}`}>{label}</p>
      <p className={`font-mono text-lg mt-1 ${emphasize ? "text-[#50C878]" : "text-slate-800"}`}>
        {value.toFixed(2)}
      </p>
    </div>
  );
}

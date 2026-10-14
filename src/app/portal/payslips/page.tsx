"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader, WifiOff } from "lucide-react";
import type { EmployeePayslip } from "@/lib/employee-portal/payslips";
import {
  buildPayslipManualDeductionRows,
  formatPayslipCurrencyLine,
  payslipUsedExchangeRate,
} from "@/lib/payslip-content";
import {
  cacheViewedPayslipAsync,
  loadCachedPayslipsAsync,
} from "@/lib/employee-portal/offline-cache";

export default function PortalPayslipsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-400 flex items-center gap-2"><Loader className="w-4 h-4 animate-spin" /> Loading…</div>}>
      <PayslipsInner />
    </Suspense>
  );
}

function PayslipsInner() {
  const searchParams = useSearchParams();
  const openId = searchParams.get("open");

  const [payslips, setPayslips] = useState<EmployeePayslip[]>([]);
  const [selected, setSelected] = useState<EmployeePayslip | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let eid: string | undefined;
      try {
        const me = await fetch("/api/employee/me").then((r) => r.json());
        eid = me.employee?.id as string | undefined;
        if (!eid) {
          setError("Session required.");
          setLoading(false);
          return;
        }
        if (cancelled) return;
        setEmployeeId(eid);

        const res = await fetch("/api/employee/payslips");
        if (!res.ok) {
          const cached = await loadCachedPayslipsAsync(eid);
          if (cached.payslips.length) {
            setPayslips(cached.payslips);
            setOffline(true);
          } else {
            setError("Could not load payslips.");
          }
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const list = (data.payslips ?? []) as EmployeePayslip[];
        setPayslips(list);
        setOffline(false);

        if (openId) {
          const match = list.find((p) => p.id === openId);
          if (match) {
            setSelected(match);
            await cacheViewedPayslipAsync(eid, match);
          }
        }
      } catch {
        if (eid) {
          const cached = await loadCachedPayslipsAsync(eid);
          if (!cancelled) {
            setPayslips(cached.payslips);
            setOffline(true);
            if (!cached.payslips.length) setError("Network unavailable and no cached payslips.");
          }
        } else if (!cancelled) {
          setError("Network unavailable and no cached payslips.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [openId]);

  async function openPayslip(p: EmployeePayslip) {
    setSelected(p);
    if (employeeId) await cacheViewedPayslipAsync(employeeId, p);

    try {
      const res = await fetch(`/api/employee/payslips/${p.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.payslip && employeeId) {
          setSelected(data.payslip);
          await cacheViewedPayslipAsync(employeeId, data.payslip);
        }
      }
    } catch {
      // Keep selected from list / cache
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm">
        <Loader className="w-4 h-4 animate-spin" /> Loading payslips…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[#002147]">Payslip history</h1>
        <p className="text-sm text-slate-500 mt-1">
          Read-only view from paid payroll runs. Last 3 viewed slips stay available offline.
        </p>
      </div>

      {offline && (
        <div className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          <WifiOff className="w-4 h-4" />
          Showing cached payslips (offline).
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!payslips.length && !error ? (
        <p className="text-sm text-slate-500">No paid payslips yet.</p>
      ) : (
        <ul className="space-y-2">
          {payslips.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => openPayslip(p)}
                className="w-full text-left bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-[#50C878]/50 transition-colors"
              >
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-800">{p.periodLabel}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Paid {p.payDate}</p>
                  </div>
                  <p className="font-mono text-sm text-[#002147]">
                    {p.currency} {Number(p.netPay).toFixed(2)}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="font-semibold text-[#002147]">{selected.periodLabel}</h2>
              <p className="text-xs text-slate-400">{selected.fullName} · {selected.employeeNumber}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Close
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-slate-400 text-xs">Gross</dt><dd className="font-mono">{selected.currency} {selected.grossPay.toFixed(2)}</dd></div>
            <div><dt className="text-slate-400 text-xs">Net</dt><dd className="font-mono font-semibold">{selected.currency} {selected.netPay.toFixed(2)}</dd></div>
            <div>
              <dt className="text-slate-400 text-xs">Income Tax (LRA)</dt>
              <dd className="font-mono">{selected.currency} {selected.incomeTax.toFixed(2)}</dd>
            </div>
            <div><dt className="text-slate-400 text-xs">NASSCORP (Employee 4%)</dt><dd className="font-mono">{selected.currency} {selected.nasscorpEe.toFixed(2)}</dd></div>
            <div><dt className="text-slate-400 text-xs">NASSCORP (Employer 6%)</dt><dd className="font-mono">{selected.currency} {selected.nasscorpEr.toFixed(2)}</dd></div>
            <div><dt className="text-slate-400 text-xs">Hours</dt><dd className="font-mono">{selected.regularHours} reg / {selected.overtimeHours} OT</dd></div>
            {payslipUsedExchangeRate(selected.currency) && (
              <div>
                <dt className="text-slate-400 text-xs">Exchange rate used</dt>
                <dd className="font-mono">{formatPayslipCurrencyLine(selected.currency, selected.exchangeRate)}</dd>
              </div>
            )}
          </dl>
          <PortalDeductionList payslip={selected} />
          <p className="text-[11px] text-slate-400">
            Cached for offline viewing.{" "}
            <Link href="/portal/nasscorp" className="text-[#002147] underline">View NASSCORP totals</Link>
          </p>
        </div>
      )}
    </div>
  );
}

function PortalDeductionList({ payslip }: { payslip: EmployeePayslip }) {
  const rows = buildPayslipManualDeductionRows(payslip);
  if (!rows.length) return null;
  return (
    <div>
      <p className="text-slate-400 text-xs mb-1">Deductions</p>
      <ul className="text-sm space-y-1">
        {rows.map((row, i) => (
          <li key={`${row.label}-${i}`} className="flex justify-between gap-3">
            <span>{row.label || row.note}</span>
            <span className="font-mono">{payslip.currency} {row.amount.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

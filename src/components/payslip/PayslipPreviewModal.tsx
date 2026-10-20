"use client";

import { createPortal } from "react-dom";
import type { PayRunLine } from "@/lib/mock-data";
import { buildPayslipDeductionRows } from "@/lib/payslip-content";

function money(amount: number, currency: string): string {
  const sym = currency === "USD" ? "$" : "L$";
  return `${sym}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PayslipPreviewModal({
  open,
  line,
  periodLabel,
  onClose,
  onDownloadPdf,
  downloading = false,
}: {
  open: boolean;
  line: PayRunLine | null;
  periodLabel: string;
  onClose: () => void;
  onDownloadPdf: () => void;
  downloading?: boolean;
}) {
  const calc = line?.calc ?? null;
  if (!open || !line || !calc) return null;

  const symCurrency = line.currency;
  const deductions = buildPayslipDeductionRows(line, calc);

  const dialog = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close preview"
        onClick={onClose}
        className="absolute inset-0 bg-[#002147]/45"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payslip-preview-title"
        className="relative flex w-full max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="shrink-0 p-4 pb-0 sm:p-6 sm:pb-0">
          <p className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            This is a preview. The PDF download is the official record.
          </p>

          <h2 id="payslip-preview-title" className="mt-4 text-sm font-semibold text-[#002147]">
            Payslip preview
          </h2>

          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Employee Name</dt>
              <dd className="text-sm font-medium text-[#002147]">{line.fullName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Pay Period</dt>
              <dd className="text-sm text-slate-800">{periodLabel}</dd>
            </div>
          </dl>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
          <table className="mt-4 w-full text-sm">
            <tbody>
              <tr className="border-t border-slate-100">
                <th scope="row" className="py-2 text-left text-xs font-medium text-slate-500">Gross Pay</th>
                <td className="py-2 text-right text-sm text-slate-800">{money(calc.grossPay, symCurrency)}</td>
              </tr>
              {deductions.map((row) => (
                <tr key={row.label} className="border-t border-slate-100">
                  <th scope="row" className="py-2 text-left text-xs font-medium text-slate-500">{row.label}</th>
                  <td className="py-2 text-right text-sm text-red-600">{money(row.amount, symCurrency)}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-100">
                <th scope="row" className="py-2 text-left text-xs font-medium text-slate-500">Total Deductions</th>
                <td className="py-2 text-right text-sm text-red-600">{money(calc.totalDeductions, symCurrency)}</td>
              </tr>
              <tr className="border-t border-slate-200">
                <th scope="row" className="py-2 text-left text-xs font-semibold text-[#002147]">Net Pay</th>
                <td
                  className="py-2 text-right text-sm font-semibold text-[#50C878]"
                  data-net-pay={calc.netPay.toFixed(2)}
                >
                  {money(calc.netPay, symCurrency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="shrink-0 flex flex-col-reverse gap-2 border-t border-slate-200 p-4 sm:flex-row sm:justify-end sm:p-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onDownloadPdf}
            disabled={downloading}
            className="rounded-xl bg-[#002147] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {downloading ? "Preparing PDF…" : "Download PDF"}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
}

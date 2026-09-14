"use client";

/**
 * Slipdesk — BulkUpload Component
 * Place at: src/components/BulkUpload.tsx
 *
 * Deduction columns: any CSV column prefixed with "ded_" is auto-detected
 * as an itemized deduction. e.g. ded_pay_advance, ded_food, ded_transportation.
 * The prefix is stripped and the remainder is title-cased as the label.
 * The sum of all ded_* columns becomes the total `deductions` on the PayRunLine.
 * Each item is also stored in `deductionItems` for itemized display on payslips.
 *
 * A plain `deductions` column is still supported as a fallback (single "Other
 * Deductions" line) for backwards-compatible CSVs.
 */

import { Fragment, useRef, useState } from "react";
import { Upload, Download, AlertCircle, CheckCircle2, X, Info, ChevronDown, Trash2 } from "lucide-react";
import { parsePayrollCSV, type BulkRow } from "@/lib/csv/parse-payroll-csv";
import { deleteAtIndexes } from "@/lib/csv/record-ops";

export type { BulkRow };

interface Props {
  onImport: (rows: BulkRow[]) => void;
  onClose:  () => void;
}

// ─── CSV template ─────────────────────────────────────────────────────────────

// Core columns that always appear in the template
const CORE_COLUMNS = [
  "employee_number", "first_name", "middle_name", "last_name", "gender", "job_title", "department", "branch",
  "email", "phone", "county", "start_date",
  "employment_type", "currency", "rate", "standard_hours", "allowances",
  "nasscorp_number",
  "payment_method", "bank_name", "account_number", "momo_number",
  "regular_hours", "overtime_hours", "holiday_hours",
  // Itemized deduction columns — add as many ded_* columns as you need.
  // The prefix is stripped and the name is used as the label on the payslip.
  "ded_pay_advance",
  "ded_food",
  "ded_transportation",
  "ded_loan_repayment",
  "ded_other",
] as const;

const EXAMPLE_ROWS = [
  [
    "EMP-001","Moses","James","Kollie","male","Accountant","Finance","Monrovia HQ",
    "moses@company.lr","+231770000001","Montserrado","2023-01-15",
    "full_time","USD","15.00","173.33","50.00",
    "NASC-001",
    "bank_transfer","Ecobank Liberia","1234567890","",
    "173.33","8","0",
    "100","30","20","0","0",
  ],
  [
    "EMP-002","Grace","","Tamba","female","HR Officer","Human Resources","Monrovia HQ",
    "grace@company.lr","+231770000002","Margibi","2023-03-01",
    "full_time","LRD","2500","173.33","0",
    "NASC-002",
    "mtn_momo","","","0771234567",
    "160","0","8",
    "500","0","0","250","0",
  ],
  [
    "EMP-003","James","","Freeman","","Driver","Operations","Bangli",
    "james@company.lr","+231770000003","Bong","2024-06-01",
    "casual","USD","8.50","0","0",
    "",
    "cash","","","",
    "120","16","0",
    "0","0","0","0","0",
  ],
];

function buildCSV() {
  const header = CORE_COLUMNS.join(",");
  const rows   = EXAMPLE_ROWS.map((r) => r.map((v) => `"${v}"`).join(","));
  return [header, ...rows].join("\n");
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BulkUpload({ onImport, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging,        setDragging]        = useState(false);
  const [preview,         setPreview]         = useState<BulkRow[] | null>(null);
  const [errors,          setErrors]          = useState<string[]>([]);
  const [fileName,        setFileName]        = useState<string>("");
  const [expandedRow,     setExpandedRow]     = useState<number | null>(null);

  function downloadTemplate() {
    const blob = new Blob([buildCSV()], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "slipdesk_employee_template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function processFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string).replace(/^\uFEFF/, ""); // strip BOM
      const { rows, errors: errs } = parsePayrollCSV(text);
      setPreview(rows);
      setErrors(errs);
      setExpandedRow(null);
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleImport() {
    if (preview && preview.length > 0) onImport(preview);
  }

  function removePreviewRow(index: number) {
    if (!preview) return;
    const { remaining } = deleteAtIndexes(preview, [index]);
    setPreview(remaining.length ? remaining : null);
    setExpandedRow((prev) => {
      if (prev === null) return null;
      if (prev === index) return null;
      return prev > index ? prev - 1 : prev;
    });
  }

  const hasErrors  = errors.length > 0;
  const hasPreview = preview && preview.length > 0;

  // Detect if any row has itemized deductions (affects table columns shown)
  const hasItemized = preview?.some((r) => r.deductionItems.length > 0) ?? false;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800">Bulk Upload Employees</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Upload a CSV to add or update employees for this pay period
            </p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5"/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Info banner */}
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5"/>
            <div className="flex-1">
              <p className="text-sm text-blue-700 font-medium mb-1">
                Itemized deductions via <code className="font-mono bg-blue-100 px-1 rounded">ded_*</code> columns
              </p>
              <p className="text-xs text-blue-500 mb-2">
                Add one column per deduction type, prefixed with{" "}
                <code className="font-mono bg-blue-100 px-1 rounded">ded_</code>.
                Each becomes a named line on the payslip.
                Examples:{" "}
                <code className="font-mono bg-blue-100 px-1 rounded">ded_pay_advance</code>,{" "}
                <code className="font-mono bg-blue-100 px-1 rounded">ded_food</code>,{" "}
                <code className="font-mono bg-blue-100 px-1 rounded">ded_transportation</code>,{" "}
                <code className="font-mono bg-blue-100 px-1 rounded">ded_loan_repayment</code>.
                Leave blank or <code className="font-mono bg-blue-100 px-1 rounded">0</code> if none.
              </p>
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5"/> Download Template (with ded_* columns)
              </button>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
              ${dragging
                ? "border-[#50C878] bg-[#50C878]/5"
                : "border-slate-200 hover:border-[#50C878] hover:bg-slate-50"
              }`}
          >
            <Upload className={`w-8 h-8 mx-auto mb-3 ${dragging ? "text-[#50C878]" : "text-slate-300"}`}/>
            <p className="text-sm font-medium text-slate-600">
              {fileName || "Drop your CSV here or click to browse"}
            </p>
            <p className="text-xs text-slate-400 mt-1">CSV files only · supports ded_* itemized deduction columns</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile}/>
          </div>

          {/* Parse errors */}
          {hasErrors && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-red-400"/>
                <p className="text-sm font-semibold text-red-600">
                  {errors.length} parsing error{errors.length > 1 ? "s" : ""}
                </p>
              </div>
              {errors.slice(0, 5).map((e, i) => (
                <p key={i} className="text-xs text-red-500 font-mono">{e}</p>
              ))}
              {errors.length > 5 && (
                <p className="text-xs text-red-400">…and {errors.length - 5} more</p>
              )}
            </div>
          )}

          {/* Preview table */}
          {hasPreview && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500"/>
                <p className="text-sm font-semibold text-slate-700">
                  {preview.length} employee{preview.length > 1 ? "s" : ""} ready to import
                </p>
                {hasItemized && (
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                    itemized deductions detected
                  </span>
                )}
              </div>
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                      <tr>
                        {["Name","Dept","CCY","Rate","Reg","OT","Hol","Allowances","Deductions","Pay Method",""].map((h, hi) => (
                          <th key={h || `col-${hi}`} className="text-left px-3 py-2 font-mono text-slate-400 uppercase tracking-wider whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => {
                        const isExpanded = expandedRow === i;
                        const hasItems   = r.deductionItems.length > 0;
                        return (
                          <Fragment key={r.employee.employeeNumber || `${r.employee.firstName}-${i}`}>
                            <tr
                              className={`border-b border-slate-50 ${hasItems ? "cursor-pointer hover:bg-slate-50" : ""}`}
                              onClick={() => hasItems && setExpandedRow(isExpanded ? null : i)}
                            >
                              <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">
                                {r.employee.firstName} {r.employee.lastName}
                                {r.employee.employeeNumber && (
                                  <span className="ml-1 text-slate-400">({r.employee.employeeNumber})</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-500">{r.employee.department || "—"}</td>
                              <td className="px-3 py-2">
                                <span className={`font-bold px-1.5 py-0.5 rounded-full text-[10px] ${
                                  r.employee.currency === "USD"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}>
                                  {r.employee.currency}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-mono text-slate-600">{r.employee.rate.toFixed(2)}</td>
                              <td className="px-3 py-2 font-mono text-slate-600">{r.regularHours}</td>
                              <td className={`px-3 py-2 font-mono ${r.overtimeHours > 0 ? "text-amber-600 font-semibold" : "text-slate-400"}`}>
                                {r.overtimeHours}
                              </td>
                              <td className={`px-3 py-2 font-mono ${r.holidayHours > 0 ? "text-purple-600 font-semibold" : "text-slate-400"}`}>
                                {r.holidayHours}
                              </td>
                              <td className="px-3 py-2 font-mono text-slate-500">
                                {r.employee.allowances || "—"}
                              </td>
                              <td className="px-3 py-2">
                                {r.deductions > 0 ? (
                                  <div className="flex items-center gap-1">
                                    <span className="font-mono text-red-600 font-semibold">
                                      -{r.deductions.toFixed(2)}
                                    </span>
                                    {hasItems && (
                                      <ChevronDown
                                        className={`w-3 h-3 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                      />
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-500 capitalize">
                                {r.employee.paymentMethod.replace(/_/g, " ")}
                              </td>
                              <td className="px-2 py-2">
                                <button
                                  type="button"
                                  title="Remove from import"
                                  onClick={(e) => { e.stopPropagation(); removePreviewRow(i); }}
                                  className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5"/>
                                </button>
                              </td>
                            </tr>

                            {/* Expanded deduction breakdown */}
                            {isExpanded && hasItems && (
                              <tr className="bg-orange-50 border-b border-orange-100">
                                <td colSpan={11} className="px-6 py-2">
                                  <p className="text-[10px] font-semibold text-orange-700 uppercase tracking-wider mb-1.5">
                                    Deduction Breakdown
                                  </p>
                                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                                    {r.deductionItems.map((item, j) => (
                                      <div key={j} className="flex items-center gap-2">
                                        <span className="text-xs text-slate-600">{item.label}</span>
                                        <span className="text-xs font-mono font-semibold text-red-600">
                                          -{item.amount.toFixed(2)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {hasItemized && (
                <p className="text-xs text-slate-400">
                  ↑ Click any row with deductions to see the itemized breakdown. Each item will appear as a separate line on the payslip.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!hasPreview}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-[#50C878] text-[#002147] hover:bg-[#3aa85f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Upload className="w-4 h-4"/>
            Import {hasPreview ? `${preview.length} Employee${preview.length > 1 ? "s" : ""}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
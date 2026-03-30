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

import { useRef, useState } from "react";
import { Upload, Download, AlertCircle, CheckCircle2, X, Info, ChevronDown } from "lucide-react";
import type { Employee, EmploymentType, Currency, PaymentMethod } from "@/context/AppContext";
import type { DeductionItem } from "@/lib/mock-data";

function parseDateToISO(dateStr: string | undefined): string {
  if (!dateStr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    if (year.length === 4 && month.length === 2 && day.length === 2)
      return `${year}-${month}-${day}`;
  }
  const dashParts = dateStr.split("-");
  if (dashParts.length === 3 && dashParts[2].length === 4) {
    const [day, month, year] = dashParts;
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

// ─── Extended parsed row ──────────────────────────────────────────────────────

export interface BulkRow {
  employee:       Omit<Employee, "id" | "fullName">;
  regularHours:   number;
  overtimeHours:  number;
  holidayHours:   number;
  /** Sum of all ded_* columns (or the plain deductions column). Used for payroll math. */
  deductions:     number;
  /** Itemized breakdown — one entry per ded_* column that had a non-zero value.
   *  Empty array when only a plain `deductions` column was used. */
  deductionItems: DeductionItem[];
}

interface Props {
  onImport: (rows: BulkRow[]) => void;
  onClose:  () => void;
}

// ─── CSV template ─────────────────────────────────────────────────────────────

// Core columns that always appear in the template
const CORE_COLUMNS = [
  "employee_number", "first_name", "last_name", "job_title", "department",
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
    "EMP-001","Moses","Kollie","Accountant","Finance",
    "moses@company.lr","+231770000001","Montserrado","2023-01-15",
    "full_time","USD","15.00","173.33","50.00",
    "NASC-001",
    "bank_transfer","Ecobank Liberia","1234567890","",
    "173.33","8","0",
    "100","30","20","0","0",
  ],
  [
    "EMP-002","Grace","Tamba","HR Officer","Human Resources",
    "grace@company.lr","+231770000002","Margibi","2023-03-01",
    "full_time","LRD","2500","173.33","0",
    "NASC-002",
    "mtn_momo","","","0771234567",
    "160","0","8",
    "500","0","0","250","0",
  ],
  [
    "EMP-003","James","Freeman","Driver","Operations",
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

// ─── Parser helpers ───────────────────────────────────────────────────────────

const VALID_EMP_TYPES:       EmploymentType[] = ["full_time","part_time","contractor","casual"];
const VALID_CURRENCIES:      Currency[]        = ["USD","LRD"];
const VALID_PAYMENT_METHODS: PaymentMethod[]   = ["bank_transfer","mtn_momo","orange_money","cash"];

function parseNum(v: string, fallback = 0): number {
  const n = parseFloat(v?.trim() || "");
  return isNaN(n) ? fallback : n;
}

/** Title-cases a snake_case string: "pay_advance" → "Pay Advance" */
function titleCase(snake: string): string {
  return snake
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuote = false; }
      } else {
        cur += ch;
      }
    } else {
      if      (ch === '"') { inQuote = true; }
      else if (ch === ",") { values.push(cur.trim()); cur = ""; }
      else                 { cur += ch; }
    }
  }
  values.push(cur.trim());
  return values;
}

/**
 * Parse a single data row.
 * `dedColumns` is the list of header names that start with "ded_" (excluding
 * the plain "deductions" fallback column, if present).
 */
function parseRow(
  raw: Record<string, string>,
  lineNum: number,
  dedColumns: string[],
): { row: BulkRow | null; error: string | null } {
  const firstName = raw.first_name?.trim();
  const lastName  = raw.last_name?.trim();
  if (!firstName || !lastName)
    return { row: null, error: `Line ${lineNum}: first_name and last_name are required.` };

  const empType = (raw.employment_type?.trim().toLowerCase() ?? "full_time") as EmploymentType;
  if (!VALID_EMP_TYPES.includes(empType))
    return { row: null, error: `Line ${lineNum}: invalid employment_type "${raw.employment_type}".` };

  const currency = (raw.currency?.trim().toUpperCase() ?? "USD") as Currency;
  if (!VALID_CURRENCIES.includes(currency))
    return { row: null, error: `Line ${lineNum}: invalid currency "${raw.currency}". Use USD or LRD.` };

  const payMethod = (raw.payment_method?.trim().toLowerCase() ?? "cash") as PaymentMethod;
  if (!VALID_PAYMENT_METHODS.includes(payMethod))
    return { row: null, error: `Line ${lineNum}: invalid payment_method "${raw.payment_method}".` };

  const standardHours = parseNum(raw.standard_hours, 173.33);

  const employee: Omit<Employee, "id" | "fullName"> = {
    employeeNumber: raw.employee_number?.trim() || "",
    firstName,
    lastName,
    jobTitle:       raw.job_title?.trim()   || "",
    department:     raw.department?.trim()  || "",
    email:          raw.email?.trim()       || "",
    phone:          raw.phone?.trim()       || "",
    county:         raw.county?.trim()      || "",
    startDate:      parseDateToISO(raw.start_date),
    employmentType: empType,
    currency,
    rate:           parseNum(raw.rate, 0),
    standardHours,
    allowances:     parseNum(raw.allowances, 0),
    nasscorpNumber: raw.nasscorp_number?.trim() || "",
    paymentMethod:  payMethod,
    bankName:       raw.bank_name?.trim()      || "",
    accountNumber:  raw.account_number?.trim() || "",
    momoNumber:     raw.momo_number?.trim()    || "",
    isActive:       true,
    isArchived:     false,
  };

  const regularRaw  = (raw.regular_hours  ?? "").trim();
  const overtimeRaw = (raw.overtime_hours ?? "").trim();
  const holidayRaw  = (raw.holiday_hours  ?? "").trim();

  const regularHours  = regularRaw  ? parseNum(regularRaw,  standardHours) : standardHours;
  const overtimeHours = overtimeRaw ? parseNum(overtimeRaw, 0)             : 0;
  const holidayHours  = holidayRaw  ? parseNum(holidayRaw,  0)             : 0;

  // ── Itemized deductions (ded_* columns) ────────────────────────────────────
  let deductions     = 0;
  const deductionItems: DeductionItem[] = [];

  if (dedColumns.length > 0) {
    // Use the ded_* columns — each becomes a named DeductionItem
    for (const col of dedColumns) {
      const amount = parseNum((raw[col] ?? "").trim(), 0);
      if (amount > 0) {
        // Strip the "ded_" prefix and title-case: "ded_pay_advance" → "Pay Advance"
        const label = titleCase(col.replace(/^ded_/, ""));
        deductionItems.push({ label, amount });
        deductions += amount;
      }
    }
  } else {
    // Fallback: plain `deductions` column (backwards-compatible)
    const deductRaw = (raw.deductions ?? "").trim();
    deductions = deductRaw ? parseNum(deductRaw, 0) : 0;
    // No deductionItems — payslip will show "Other Deductions" as before
  }

  return {
    row: { employee, regularHours, overtimeHours, holidayHours, deductions, deductionItems },
    error: null,
  };
}

function parseCSV(text: string): { rows: BulkRow[]; errors: string[] } {
  const lines = text.trim().split(/\r\n|\r|\n/);
  if (lines.length < 2)
    return { rows: [], errors: ["CSV must have a header row and at least one data row."] };

  const headers = parseCSVLine(lines[0]).map((h) =>
    h.toLowerCase().trim().replace(/^"+|"+$/g, "").replace(/\s+/g, "_")
  );

  // Collect all ded_* column names in order (excluding plain "deductions")
  const dedColumns = headers.filter((h) => h.startsWith("ded_"));

  const rows:   BulkRow[] = [];
  const errors: string[]  = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => { raw[h] = values[idx] ?? ""; });

    const { row, error } = parseRow(raw, i + 1, dedColumns);
    if (error) errors.push(error);
    else if (row) rows.push(row);
  }

  return { rows, errors };
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
      const { rows, errors: errs } = parseCSV(text);
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
                        {["Name","Dept","CCY","Rate","Reg","OT","Hol","Allowances","Deductions","Pay Method"].map((h) => (
                          <th key={h} className="text-left px-3 py-2 font-mono text-slate-400 uppercase tracking-wider whitespace-nowrap">
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
                          <>
                            <tr
                              key={i}
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
                            </tr>

                            {/* Expanded deduction breakdown */}
                            {isExpanded && hasItems && (
                              <tr key={`${i}-expanded`} className="bg-orange-50 border-b border-orange-100">
                                <td colSpan={10} className="px-6 py-2">
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
                          </>
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
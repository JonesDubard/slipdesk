// "use client";

// /**
//  * Slipdesk — BulkUpload Component
//  * Place at: src/components/BulkUpload.tsx
//  *
//  * CSV template now includes overtime_hours and holiday_hours.
//  * After upload, the payroll page pre-fills those hours in the run editor
//  * so admins can review and adjust before finalising.
//  */

// import { useRef, useState } from "react";
// import { Upload, Download, AlertCircle, CheckCircle2, X, Info } from "lucide-react";
// import type { Employee, EmploymentType, Currency, PaymentMethod } from "@/context/AppContext";

// // ─── Extended parsed row (employee + this-period hours) ──────────────────────

// export interface BulkRow {
//   employee:      Omit<Employee, "id" | "fullName">;
//   regularHours:  number;
//   overtimeHours: number;
//   holidayHours:  number;
// }

// interface Props {
//   onImport: (rows: BulkRow[]) => void;
//   onClose:  () => void;
// }

// // ─── CSV template columns ─────────────────────────────────────────────────────

// const COLUMNS = [
//   // Identity
//   "employee_number", "first_name", "last_name", "job_title", "department",
//   "email", "phone", "county", "start_date",
//   // Employment
//   "employment_type", "currency", "rate", "standard_hours", "allowances",
//   // Compliance
//   "nasscorp_number",
//   // Payment
//   "payment_method", "bank_name", "account_number", "momo_number",
//   // This-period hours (can be blank — defaults to standard_hours / 0 / 0)
//   "regular_hours", "overtime_hours", "holiday_hours",
// ] as const;

// const EXAMPLE_ROWS = [
//   [
//     "EMP-001","Moses","Kollie","Accountant","Finance",
//     "moses@company.lr","+231770000001","Montserrado","2023-01-15",
//     "full_time","USD","15.00","173.33","50.00",
//     "NASC-001",
//     "bank_transfer","Ecobank Liberia","1234567890","",
//     "173.33","8","0",
//   ],
//   [
//     "EMP-002","Grace","Tamba","HR Officer","HR",
//     "grace@company.lr","+231770000002","Margibi","2023-03-01",
//     "full_time","LRD","2500","173.33","0",
//     "NASC-002",
//     "mtn_momo","","","0771234567",
//     "160","0","8",
//   ],
//   [
//     "EMP-003","James","Freeman","Driver","Operations",
//     "james@company.lr","+231770000003","Bong","2024-06-01",
//     "casual","USD","8.50","0","0",
//     "",
//     "cash","","","",
//     "120","16","0",
//   ],
// ];

// function buildCSV() {
//   const header = COLUMNS.join(",");
//   const rows   = EXAMPLE_ROWS.map((r) => r.map((v) => `"${v}"`).join(","));
//   return [header, ...rows].join("\n");
// }

// // ─── Parser helpers ───────────────────────────────────────────────────────────

// const VALID_EMP_TYPES:      EmploymentType[] = ["full_time","part_time","contractor","casual"];
// const VALID_CURRENCIES:     Currency[]        = ["USD","LRD"];
// const VALID_PAYMENT_METHODS: PaymentMethod[]  = ["bank_transfer","mtn_momo","orange_money","cash"];

// function parseNum(v: string, fallback = 0): number {
//   const n = parseFloat(v?.trim() || "");
//   return isNaN(n) ? fallback : n;
// }

// function parseRow(raw: Record<string, string>, lineNum: number): { row: BulkRow | null; error: string | null } {
//   const firstName = raw.first_name?.trim();
//   const lastName  = raw.last_name?.trim();
//   if (!firstName || !lastName) return { row: null, error: `Line ${lineNum}: first_name and last_name are required.` };

//   const empType = (raw.employment_type?.trim().toLowerCase() ?? "full_time") as EmploymentType;
//   if (!VALID_EMP_TYPES.includes(empType))
//     return { row: null, error: `Line ${lineNum}: invalid employment_type "${raw.employment_type}". Use: ${VALID_EMP_TYPES.join(", ")}.` };

//   const currency = (raw.currency?.trim().toUpperCase() ?? "USD") as Currency;
//   if (!VALID_CURRENCIES.includes(currency))
//     return { row: null, error: `Line ${lineNum}: invalid currency "${raw.currency}". Use USD or LRD.` };

//   const payMethod = (raw.payment_method?.trim().toLowerCase() ?? "cash") as PaymentMethod;
//   if (!VALID_PAYMENT_METHODS.includes(payMethod))
//     return { row: null, error: `Line ${lineNum}: invalid payment_method "${raw.payment_method}". Use: ${VALID_PAYMENT_METHODS.join(", ")}.` };

//   const standardHours = parseNum(raw.standard_hours, 173.33);

//   const employee: Omit<Employee, "id" | "fullName"> = {
//     employeeNumber: raw.employee_number?.trim() || "",
//     firstName,
//     lastName,
//     jobTitle:       raw.job_title?.trim()   || "",
//     department:     raw.department?.trim()  || "",
//     email:          raw.email?.trim()       || "",
//     phone:          raw.phone?.trim()       || "",
//     county:         raw.county?.trim()      || "",
//     startDate:      raw.start_date?.trim()  || "",
//     employmentType: empType,
//     currency,
//     rate:           parseNum(raw.rate, 0),
//     standardHours,
//     allowances:     parseNum(raw.allowances, 0),
//     nasscorpNumber: raw.nasscorp_number?.trim() || "",
//     paymentMethod:  payMethod,
//     bankName:       raw.bank_name?.trim()      || "",
//     accountNumber:  raw.account_number?.trim() || "",
//     momoNumber:     raw.momo_number?.trim()    || "",
//     isActive:       true,
//     isArchived:     false,
//   };

//   // Hours: blank regular_hours defaults to standard_hours
//   const regularHours  = raw.regular_hours?.trim()   ? parseNum(raw.regular_hours,  standardHours) : standardHours;
//   const overtimeHours = raw.overtime_hours?.trim()   ? parseNum(raw.overtime_hours, 0) : 0;
//   const holidayHours  = raw.holiday_hours?.trim()    ? parseNum(raw.holiday_hours,  0) : 0;

//   return { row: { employee, regularHours, overtimeHours, holidayHours }, error: null };
// }

// function parseCSV(text: string): { rows: BulkRow[]; errors: string[] } {
//   const lines  = text.trim().split(/\r?\n/);
//   if (lines.length < 2) return { rows: [], errors: ["CSV must have a header row and at least one data row."] };

//   const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
//   const rows: BulkRow[] = [];
//   const errors: string[] = [];

//   for (let i = 1; i < lines.length; i++) {
//     const line = lines[i].trim();
//     if (!line) continue;

//     // Handle quoted fields with commas
//     const values: string[] = [];
//     let cur = "", inQuote = false;
//     for (const ch of line) {
//       if (ch === '"') { inQuote = !inQuote; }
//       else if (ch === "," && !inQuote) { values.push(cur); cur = ""; }
//       else { cur += ch; }
//     }
//     values.push(cur);

//     const raw: Record<string, string> = {};
//     headers.forEach((h, idx) => { raw[h] = values[idx]?.trim() ?? ""; });

//     const { row, error } = parseRow(raw, i + 1);
//     if (error) errors.push(error);
//     else if (row) rows.push(row);
//   }

//   return { rows, errors };
// }

// // ─── Component ────────────────────────────────────────────────────────────────

// export default function BulkUpload({ onImport, onClose }: Props) {
//   const fileRef = useRef<HTMLInputElement>(null);
//   const [dragging, setDragging]   = useState(false);
//   const [preview,  setPreview]    = useState<BulkRow[] | null>(null);
//   const [errors,   setErrors]     = useState<string[]>([]);
//   const [fileName, setFileName]   = useState<string>("");

//   function downloadTemplate() {
//     const blob = new Blob([buildCSV()], { type: "text/csv" });
//     const url  = URL.createObjectURL(blob);
//     const a    = document.createElement("a");
//     a.href     = url;
//     a.download = "slipdesk_employee_template.csv";
//     a.click();
//     URL.revokeObjectURL(url);
//   }

//   function processFile(file: File) {
//     setFileName(file.name);
//     const reader = new FileReader();
//     reader.onload = (e) => {
//       const text = e.target?.result as string;
//       const { rows, errors: errs } = parseCSV(text);
//       setPreview(rows);
//       setErrors(errs);
//     };
//     reader.readAsText(file);
//   }

//   function handleDrop(e: React.DragEvent) {
//     e.preventDefault();
//     setDragging(false);
//     const file = e.dataTransfer.files[0];
//     if (file) processFile(file);
//   }

//   function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
//     const file = e.target.files?.[0];
//     if (file) processFile(file);
//   }

//   function handleImport() {
//     if (preview && preview.length > 0) onImport(preview);
//   }

//   const hasErrors   = errors.length > 0;
//   const hasPreview  = preview && preview.length > 0;

//   return (
//     <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
//       <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

//         {/* Header */}
//         <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
//           <div>
//             <h2 className="font-bold text-slate-800">Bulk Upload Employees</h2>
//             <p className="text-xs text-slate-400 mt-0.5">Upload a CSV to add or update employees for this pay period</p>
//           </div>
//           <button onClick={onClose} className="text-slate-300 hover:text-slate-600 transition-colors">
//             <X className="w-5 h-5"/>
//           </button>
//         </div>

//         <div className="flex-1 overflow-y-auto p-6 space-y-5">

//           {/* Download template */}
//           <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4">
//             <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5"/>
//             <div className="flex-1">
//               <p className="text-sm text-blue-700 font-medium mb-1">
//                 CSV includes overtime &amp; holiday hours
//               </p>
//               <p className="text-xs text-blue-500 mb-3">
//                 Columns <code className="font-mono bg-blue-100 px-1 rounded">regular_hours</code>,{" "}
//                 <code className="font-mono bg-blue-100 px-1 rounded">overtime_hours</code>, and{" "}
//                 <code className="font-mono bg-blue-100 px-1 rounded">holiday_hours</code> pre-fill this
//                 month's pay run. Leave blank to use each employee's standard hours.
//               </p>
//               <button onClick={downloadTemplate}
//                 className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold
//                            bg-blue-600 text-white hover:bg-blue-700 transition-colors">
//                 <Download className="w-3.5 h-3.5"/> Download Template
//               </button>
//             </div>
//           </div>

//           {/* Drop zone */}
//           <div
//             onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
//             onDragLeave={() => setDragging(false)}
//             onDrop={handleDrop}
//             onClick={() => fileRef.current?.click()}
//             className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
//               ${dragging
//                 ? "border-[#50C878] bg-[#50C878]/5"
//                 : "border-slate-200 hover:border-[#50C878] hover:bg-slate-50"}`}>
//             <Upload className={`w-8 h-8 mx-auto mb-3 ${dragging ? "text-[#50C878]" : "text-slate-300"}`}/>
//             <p className="text-sm font-medium text-slate-600">
//               {fileName || "Drop your CSV here or click to browse"}
//             </p>
//             <p className="text-xs text-slate-400 mt-1">CSV files only</p>
//             <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile}/>
//           </div>

//           {/* Errors */}
//           {hasErrors && (
//             <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-1">
//               <div className="flex items-center gap-2 mb-2">
//                 <AlertCircle className="w-4 h-4 text-red-400"/>
//                 <p className="text-sm font-semibold text-red-600">{errors.length} parsing error{errors.length > 1 ? "s" : ""}</p>
//               </div>
//               {errors.slice(0, 5).map((e, i) => (
//                 <p key={i} className="text-xs text-red-500 font-mono">{e}</p>
//               ))}
//               {errors.length > 5 && (
//                 <p className="text-xs text-red-400">…and {errors.length - 5} more</p>
//               )}
//             </div>
//           )}

//           {/* Preview table */}
//           {hasPreview && (
//             <div className="space-y-2">
//               <div className="flex items-center gap-2">
//                 <CheckCircle2 className="w-4 h-4 text-emerald-500"/>
//                 <p className="text-sm font-semibold text-slate-700">
//                   {preview.length} employee{preview.length > 1 ? "s" : ""} ready to import
//                 </p>
//               </div>
//               <div className="border border-slate-100 rounded-xl overflow-hidden">
//                 <div className="overflow-x-auto max-h-64">
//                   <table className="w-full text-xs">
//                     <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
//                       <tr>
//                         {["Name","Dept","CCY","Rate","Reg. Hrs","OT Hrs","Hol. Hrs","Allowances","Pay Method"].map((h) => (
//                           <th key={h} className="text-left px-3 py-2 font-mono text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
//                         ))}
//                       </tr>
//                     </thead>
//                     <tbody>
//                       {preview.map((r, i) => (
//                         <tr key={i} className="border-b border-slate-50 last:border-0">
//                           <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">
//                             {r.employee.firstName} {r.employee.lastName}
//                             {r.employee.employeeNumber && (
//                               <span className="ml-1 text-slate-400">({r.employee.employeeNumber})</span>
//                             )}
//                           </td>
//                           <td className="px-3 py-2 text-slate-500">{r.employee.department || "—"}</td>
//                           <td className="px-3 py-2">
//                             <span className={`font-bold px-1.5 py-0.5 rounded-full text-[10px]
//                               ${r.employee.currency === "USD" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
//                               {r.employee.currency}
//                             </span>
//                           </td>
//                           <td className="px-3 py-2 font-mono text-slate-600">{r.employee.rate.toFixed(2)}</td>
//                           <td className="px-3 py-2 font-mono text-slate-600">{r.regularHours}</td>
//                           <td className={`px-3 py-2 font-mono ${r.overtimeHours > 0 ? "text-amber-600 font-semibold" : "text-slate-400"}`}>
//                             {r.overtimeHours}
//                           </td>
//                           <td className={`px-3 py-2 font-mono ${r.holidayHours > 0 ? "text-purple-600 font-semibold" : "text-slate-400"}`}>
//                             {r.holidayHours}
//                           </td>
//                           <td className="px-3 py-2 font-mono text-slate-500">{r.employee.allowances || "—"}</td>
//                           <td className="px-3 py-2 text-slate-500 capitalize">
//                             {r.employee.paymentMethod.replace(/_/g, " ")}
//                           </td>
//                         </tr>
//                       ))}
//                     </tbody>
//                   </table>
//                 </div>
//               </div>
//             </div>
//           )}
//         </div>

//         {/* Footer */}
//         <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
//           <button onClick={onClose}
//             className="px-4 py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
//             Cancel
//           </button>
//           <button onClick={handleImport} disabled={!hasPreview}
//             className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold
//                        bg-[#50C878] text-[#002147] hover:bg-[#3aa85f]
//                        disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
//             <Upload className="w-4 h-4"/>
//             Import {hasPreview ? `${preview.length} Employee${preview.length > 1 ? "s" : ""}` : ""}
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// }

"use client";

/**
 * Slipdesk — BulkUpload Component
 * Place at: src/components/BulkUpload.tsx
 */

import { useRef, useState } from "react";
import { Upload, Download, AlertCircle, CheckCircle2, X, Info } from "lucide-react";
import type { Employee, EmploymentType, Currency, PaymentMethod } from "@/context/AppContext";

export interface BulkRow {
  employee:      Omit<Employee, "id" | "fullName">;
  regularHours:  number;
  overtimeHours: number;
  holidayHours:  number;
}

interface Props {
  onImport: (rows: BulkRow[]) => void;
  onClose:  () => void;
}

const COLUMNS = [
  "employee_number", "first_name", "last_name", "job_title", "department",
  "email", "phone", "county", "start_date",
  "employment_type", "currency", "rate", "standard_hours", "allowances",
  "nasscorp_number",
  "payment_method", "bank_name", "account_number", "momo_number",
  "regular_hours", "overtime_hours", "holiday_hours",
] as const;

const EXAMPLE_ROWS = [
  ["EMP-001","Moses","Kollie","Accountant","Finance","moses@company.lr","+231770000001","Montserrado","2023-01-15","full_time","USD","15.00","173.33","50.00","NASC-001","bank_transfer","Ecobank Liberia","1234567890","","173.33","8","0"],
  ["EMP-002","Grace","Tamba","HR Officer","HR","grace@company.lr","+231770000002","Margibi","2023-03-01","full_time","LRD","2500","173.33","0","NASC-002","mtn_momo","","","0771234567","160","0","8"],
  ["EMP-003","James","Freeman","Driver","Operations","james@company.lr","+231770000003","Bong","2024-06-01","casual","USD","8.50","0","0","","cash","","","","120","16","0"],
];

function buildCSV() {
  const header = COLUMNS.join(",");
  const rows   = EXAMPLE_ROWS.map((r) => r.map((v) => `"${v}"`).join(","));
  return [header, ...rows].join("\n");
}

const VALID_EMP_TYPES:       EmploymentType[] = ["full_time","part_time","contractor","casual"];
const VALID_CURRENCIES:      Currency[]        = ["USD","LRD"];
const VALID_PAYMENT_METHODS: PaymentMethod[]   = ["bank_transfer","mtn_momo","orange_money","cash"];

function parseNum(v: string, fallback = 0): number {
  const n = parseFloat(v?.trim() || "");
  return isNaN(n) ? fallback : n;
}

// Strip surrounding double-quotes from a single CSV field value.
// This is needed because our template wraps every value in quotes,
// and the RFC-4180 parser below consumes the quote characters as
// delimiters — but edge cases (whitespace before a quote, Excel exports)
// can leave residual quotes on the string.
function stripQuotes(v: string): string {
  const t = v.trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length > 1) return t.slice(1, -1).trim();
  return t;
}

function parseRow(raw: Record<string, string>, lineNum: number): { row: BulkRow | null; error: string | null } {
  const firstName = raw.first_name?.trim();
  const lastName  = raw.last_name?.trim();
  if (!firstName || !lastName)
    return { row: null, error: `Line ${lineNum}: first_name and last_name are required.` };

  const empType = (raw.employment_type?.trim().toLowerCase() ?? "full_time") as EmploymentType;
  if (!VALID_EMP_TYPES.includes(empType))
    return { row: null, error: `Line ${lineNum}: invalid employment_type "${raw.employment_type}". Use: ${VALID_EMP_TYPES.join(", ")}.` };

  const currency = (raw.currency?.trim().toUpperCase() ?? "USD") as Currency;
  if (!VALID_CURRENCIES.includes(currency))
    return { row: null, error: `Line ${lineNum}: invalid currency "${raw.currency}". Use USD or LRD.` };

  const payMethod = (raw.payment_method?.trim().toLowerCase() ?? "cash") as PaymentMethod;
  if (!VALID_PAYMENT_METHODS.includes(payMethod))
    return { row: null, error: `Line ${lineNum}: invalid payment_method "${raw.payment_method}". Use: ${VALID_PAYMENT_METHODS.join(", ")}.` };

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
    startDate:      raw.start_date?.trim()  || "",
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

  // FIX: raw values are already quote-stripped by the parser below.
  // An empty string means "use default"; a non-empty string is parsed as a number.
  const regularRaw  = raw.regular_hours?.trim();
  const overtimeRaw = raw.overtime_hours?.trim();
  const holidayRaw  = raw.holiday_hours?.trim();

  const regularHours  = regularRaw  ? parseNum(regularRaw,  standardHours) : standardHours;
  const overtimeHours = overtimeRaw ? parseNum(overtimeRaw, 0)             : 0;
  const holidayHours  = holidayRaw  ? parseNum(holidayRaw,  0)             : 0;

  return { row: { employee, regularHours, overtimeHours, holidayHours }, error: null };
}

function parseCSV(text: string): { rows: BulkRow[]; errors: string[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2)
    return { rows: [], errors: ["CSV must have a header row and at least one data row."] };

  // FIX: strip quotes from header names so "overtime_hours" (with quotes,
  // as written by buildCSV) maps to the same key as overtime_hours (without).
  const headers = lines[0].split(",").map((h) => stripQuotes(h).toLowerCase());

  const rows:   BulkRow[] = [];
  const errors: string[]  = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // RFC-4180 field parser: the opening/closing `"` characters are consumed
    // by the inQuote toggle, so the collected `cur` string never contains
    // the wrapping quotes — it's already clean.
    const values: string[] = [];
    let cur = "", inQuote = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        values.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    values.push(cur);

    // Apply stripQuotes as a safety net for edge-case exports (e.g. Excel
    // writes a space before the opening quote, so `inQuote` never fires).
    const cleanValues = values.map(stripQuotes);

    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => { raw[h] = cleanValues[idx]?.trim() ?? ""; });

    const { row, error } = parseRow(raw, i + 1);
    if (error) errors.push(error);
    else if (row) rows.push(row);
  }

  return { rows, errors };
}

export default function BulkUpload({ onImport, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview,  setPreview]  = useState<BulkRow[] | null>(null);
  const [errors,   setErrors]   = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");

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
      const text = e.target?.result as string;
      const { rows, errors: errs } = parseCSV(text);
      setPreview(rows);
      setErrors(errs);
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

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800">Bulk Upload Employees</h2>
            <p className="text-xs text-slate-400 mt-0.5">Upload a CSV to add or update employees for this pay period</p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5"/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5"/>
            <div className="flex-1">
              <p className="text-sm text-blue-700 font-medium mb-1">CSV includes overtime &amp; holiday hours</p>
              <p className="text-xs text-blue-500 mb-3">
                Columns <code className="font-mono bg-blue-100 px-1 rounded">regular_hours</code>,{" "}
                <code className="font-mono bg-blue-100 px-1 rounded">overtime_hours</code>, and{" "}
                <code className="font-mono bg-blue-100 px-1 rounded">holiday_hours</code> pre-fill this
                month's pay run. Leave blank to use each employee's standard hours.
              </p>
              <button onClick={downloadTemplate}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                <Download className="w-3.5 h-3.5"/> Download Template
              </button>
            </div>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
              ${dragging ? "border-[#50C878] bg-[#50C878]/5" : "border-slate-200 hover:border-[#50C878] hover:bg-slate-50"}`}>
            <Upload className={`w-8 h-8 mx-auto mb-3 ${dragging ? "text-[#50C878]" : "text-slate-300"}`}/>
            <p className="text-sm font-medium text-slate-600">{fileName || "Drop your CSV here or click to browse"}</p>
            <p className="text-xs text-slate-400 mt-1">CSV files only</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile}/>
          </div>

          {hasErrors && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-red-400"/>
                <p className="text-sm font-semibold text-red-600">{errors.length} parsing error{errors.length > 1 ? "s" : ""}</p>
              </div>
              {errors.slice(0, 5).map((e, i) => <p key={i} className="text-xs text-red-500 font-mono">{e}</p>)}
              {errors.length > 5 && <p className="text-xs text-red-400">…and {errors.length - 5} more</p>}
            </div>
          )}

          {hasPreview && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500"/>
                <p className="text-sm font-semibold text-slate-700">
                  {preview.length} employee{preview.length > 1 ? "s" : ""} ready to import
                </p>
              </div>
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                      <tr>
                        {["Name","Dept","CCY","Rate","Reg. Hrs","OT Hrs","Hol. Hrs","Allowances","Pay Method"].map((h) => (
                          <th key={h} className="text-left px-3 py-2 font-mono text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="border-b border-slate-50 last:border-0">
                          <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">
                            {r.employee.firstName} {r.employee.lastName}
                            {r.employee.employeeNumber && <span className="ml-1 text-slate-400">({r.employee.employeeNumber})</span>}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{r.employee.department || "—"}</td>
                          <td className="px-3 py-2">
                            <span className={`font-bold px-1.5 py-0.5 rounded-full text-[10px] ${r.employee.currency === "USD" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                              {r.employee.currency}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-600">{r.employee.rate.toFixed(2)}</td>
                          <td className="px-3 py-2 font-mono text-slate-600">{r.regularHours}</td>
                          <td className={`px-3 py-2 font-mono ${r.overtimeHours > 0 ? "text-amber-600 font-semibold" : "text-slate-400"}`}>{r.overtimeHours}</td>
                          <td className={`px-3 py-2 font-mono ${r.holidayHours > 0 ? "text-purple-600 font-semibold" : "text-slate-400"}`}>{r.holidayHours}</td>
                          <td className="px-3 py-2 font-mono text-slate-500">{r.employee.allowances || "—"}</td>
                          <td className="px-3 py-2 text-slate-500 capitalize">{r.employee.paymentMethod.replace(/_/g, " ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button onClick={handleImport} disabled={!hasPreview}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-[#50C878] text-[#002147] hover:bg-[#3aa85f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Upload className="w-4 h-4"/>
            Import {hasPreview ? `${preview.length} Employee${preview.length > 1 ? "s" : ""}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * Slipdesk — Employees Page
 * Place at: src/app/(dashboard)/employees/page.tsx
 *
 * Phase 1: All mutations (add, update, toggle, bulk import) now persist
 * to Supabase via AppContext. No more local-state-only setEmployees shim.
 */

import { useState, useRef, useCallback } from "react";
import {
  Search, Plus, X, ChevronDown, Users, Edit3,
  ToggleLeft, ToggleRight, Upload, Download,
  AlertTriangle, CheckCircle2, FileText, Archive,
  RotateCcw, Trash2, Crown, Loader,
} from "lucide-react";
import type { Employee, PaymentMethod } from "@/context/AppContext";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/Toast";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPARTMENTS   = ["All","Operations","Finance","Engineering","Sales","Human Resources"];
const EMP_TYPES     = ["full_time","part_time","contractor","casual"] as const;
const COUNTIES      = ["Montserrado","Margibi","Bong","Nimba","Lofa","Grand Bassa","Sinoe"];
const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "bank_transfer", label: "Bank Transfer"    },
  { value: "mtn_momo",      label: "MTN Mobile Money" },
  { value: "orange_money",  label: "Orange Money"     },
  { value: "cash",          label: "Cash"             },
];

const EMPTY: Omit<Employee, "id" | "employeeNumber" | "fullName" | "isArchived"> = {
  firstName: "", lastName: "", jobTitle: "", department: "Operations",
  email: "", phone: "", county: "Montserrado", startDate: "",
  employmentType: "full_time", currency: "USD", rate: 0,
  standardHours: 173.33, isActive: true, nasscorpNumber: "",
  allowances: 0, paymentMethod: "bank_transfer",
  bankName: "", accountNumber: "", momoNumber: "",
};

// CSV columns — employee registry fields + payroll hour columns so the
// same file works for both employee import AND payroll bulk upload.
const CSV_HEADERS = [
  "employee_number", "first_name",  "last_name",      "job_title",      "department",
  "email",           "phone",       "county",          "start_date",
  "employment_type", "currency",    "rate",            "standard_hours", "allowances",
  "nasscorp_number",
  "payment_method",  "bank_name",   "account_number",  "momo_number",
  "regular_hours",   "overtime_hours", "holiday_hours",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    full_time:  "bg-blue-100 text-blue-700",
    part_time:  "bg-purple-100 text-purple-700",
    contractor: "bg-orange-100 text-orange-700",
    casual:     "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full capitalize ${colors[type] ?? "bg-slate-100 text-slate-600"}`}>
      {type.replace("_", " ")}
    </span>
  );
}

function downloadTemplate() {
  const rows = [
    CSV_HEADERS.join(","),
    // Bank Transfer — USD full-time, standard hours only
    "EMP-001,Moses,Kollie,Operations Manager,Operations,m.kollie@co.lr,+231770000001,Montserrado,2023-01-15,full_time,USD,8.50,173.33,0,NSC-001-2024,bank_transfer,Ecobank Liberia,1234567890,,173.33,0,0",
    // MTN MoMo — LRD full-time, housing allowance + 8 holiday hours
    "EMP-002,Fanta,Kamara,Finance Officer,Finance,f.kamara@co.lr,+231770000002,Montserrado,2023-03-01,full_time,LRD,1500,173.33,50000,NSC-002-2024,mtn_momo,,,0770000002,173.33,0,8",
    // Orange Money — USD part-time + 10 overtime hours
    "EMP-003,James,Pewee,Field Supervisor,Operations,j.pewee@co.lr,+231555000003,Margibi,2024-06-01,part_time,USD,6.00,86.67,0,NSC-003-2024,orange_money,,,0550000003,86.67,10,0",
    // Cash — casual LRD worker, no email or NASSCORP yet
    "EMP-004,Korto,Freeman,General Assistant,Operations,,,Bong,2025-01-10,casual,LRD,800,173.33,0,,cash,,,,173.33,0,0",
    // Bank Transfer — USD contractor, transport allowance + 5 holiday hours
    "EMP-005,David,Sumo,IT Consultant,Engineering,d.sumo@co.lr,+231770000005,Montserrado,2024-09-15,contractor,USD,12.00,173.33,100,NSC-005-2024,bank_transfer,GTBank Liberia,9876543210,,173.33,0,5",
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "slipdesk-employees-template.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

interface ParsedRow { data: Partial<Employee>; errors: string[]; warnings: string[]; }

function parseEmployeeCSV(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
  const results: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim(); if (!line) continue;
    const vals: string[] = []; let cur = ""; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { vals.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    vals.push(cur.trim());

    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => { raw[h] = vals[idx] ?? ""; });

    const errors: string[]   = [];
    const warnings: string[] = [];

    // Support both snake_case (template) and camelCase headers
    const firstName = raw.first_name  || raw.firstname  || "";
    const lastName  = raw.last_name   || raw.lastname   || "";
    const jobTitle  = raw.job_title   || raw.jobtitle   || "";
    const startDate = raw.start_date  || raw.startdate  || "";
    const empType   = raw.employment_type  || raw.employmenttype  || "";
    const nasscorp  = raw.nasscorp_number  || raw.nasscorpnumber  || "";
    const pm        = raw.payment_method   || raw.paymentmethod   || "bank_transfer";
    const bankName  = raw.bank_name        || raw.bankname        || "";
    const acctNum   = raw.account_number   || raw.accountnumber   || "";
    const momoNum   = raw.momo_number      || raw.momonumber      || "";
    const stdHours  = raw.standard_hours   || raw.standardhours   || "";

    if (!firstName) errors.push("First name required");
    if (!lastName)  errors.push("Last name required");
    if (!raw.currency) errors.push("Currency required");
    if (!raw.rate)     errors.push("Rate required");

    const rate       = parseFloat(raw.rate);
    const hours      = parseFloat(stdHours);
    const allowances = parseFloat(raw.allowances ?? "0");
    const currency   = (raw.currency ?? "USD").toUpperCase();

    if (raw.rate && isNaN(rate))           errors.push("Rate must be a number");
    if (!["USD","LRD"].includes(currency)) errors.push("Currency must be USD or LRD");
    if (!["bank_transfer","mtn_momo","orange_money","cash"].includes(pm))
      warnings.push(`Unknown payment method "${pm}" — defaulting to bank_transfer`);

    const data: Partial<Employee> = {
      firstName,
      lastName,
      jobTitle,
      department:     raw.department || "Operations",
      email:          raw.email      || "",
      phone:          raw.phone      || "",
      county:         raw.county     || "Montserrado",
      startDate,
      employmentType: (["full_time","part_time","contractor","casual"].includes(empType)
        ? empType : "full_time") as Employee["employmentType"],
      currency:       (["USD","LRD"].includes(currency) ? currency : "USD") as "USD" | "LRD",
      rate:           isNaN(rate)       ? 0      : rate,
      standardHours:  isNaN(hours)      ? 173.33 : hours,
      allowances:     isNaN(allowances) ? 0      : allowances,
      nasscorpNumber: nasscorp,
      paymentMethod:  (["bank_transfer","mtn_momo","orange_money","cash"].includes(pm)
        ? pm : "bank_transfer") as PaymentMethod,
      bankName,
      accountNumber:  acctNum,
      momoNumber:     momoNum,
      isActive:       true,
      isArchived:     false,
    };

    results.push({ data, errors, warnings });
  }
  return results;
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ title, message, confirmLabel = "Confirm",
  confirmClass = "bg-red-500 text-white hover:bg-red-600", onConfirm, onCancel }: {
  title: string; message: string; confirmLabel?: string; confirmClass?: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel}/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-semibold text-slate-800 text-base">{title}</h3>
        <p className="text-sm text-slate-500 leading-relaxed">{message}</p>
        <div className="flex gap-3 pt-2">
          <button onClick={onCancel}
            className="flex-1 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={onConfirm}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-colors ${confirmClass}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CSV Upload Modal ─────────────────────────────────────────────────────────

function CSVUploadModal({ onClose, onImport }: {
  onClose: () => void;
  onImport: (rows: Partial<Employee>[]) => Promise<void>;
}) {
  const { toast } = useToast();
  const [parsed,    setParsed]    = useState<ParsedRow[] | null>(null);
  const [fileName,  setFileName]  = useState("");
  const [dragging,  setDragging]  = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) { toast.error("Please upload a .csv file."); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setParsed(parseEmployeeCSV(e.target?.result as string));
    reader.readAsText(file);
  }, [toast]);

  const validRows   = parsed?.filter((r) => r.errors.length === 0) ?? [];
  const invalidRows = parsed?.filter((r) => r.errors.length > 0)  ?? [];

  async function handleImport() {
    if (!validRows.length) return;
    setImporting(true);
    try {
      await onImport(validRows.map((r) => r.data));
      onClose();
    } catch {
      toast.error("Some employees could not be imported. Please check and retry.");
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#50C878]"/>Bulk Import Employees
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Upload a CSV to add multiple employees at once</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-medium text-blue-800">Need a template?</p>
              <p className="text-xs text-blue-500 mt-0.5">Includes OT hours, holiday hours, allowances & payment columns</p>
            </div>
            <button onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-blue-200 text-blue-700 rounded-xl hover:bg-blue-50">
              <Download className="w-3.5 h-3.5"/>Template
            </button>
          </div>

          {!parsed ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all
                ${dragging ? "border-[#50C878] bg-emerald-50" : "border-slate-200 hover:border-[#50C878] hover:bg-slate-50"}`}>
              <FileText className="w-10 h-10 mx-auto mb-3 text-slate-300"/>
              <p className="text-sm font-medium text-slate-600">Drop your CSV here or click to browse</p>
              <p className="text-xs text-slate-400 mt-1">Columns: employee details + regular_hours, overtime_hours, holiday_hours</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}/>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                  <p className="text-xs font-mono text-emerald-600 uppercase">Ready</p>
                  <p className="text-2xl font-bold text-emerald-700">{validRows.length}</p>
                </div>
                {invalidRows.length > 0 && (
                  <div className="flex-1 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    <p className="text-xs font-mono text-red-500 uppercase">Errors</p>
                    <p className="text-2xl font-bold text-red-600">{invalidRows.length}</p>
                  </div>
                )}
                <button onClick={() => { setParsed(null); setFileName(""); }}
                  className="px-3 py-2 text-xs text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50">
                  Change file
                </button>
              </div>
              <p className="text-xs text-slate-400 font-mono">{fileName}</p>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-60">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        {["Name","Title","Type","Rate","Allowances","Payment","Status"].map((h) => (
                          <th key={h} className="text-left px-3 py-2 font-mono text-slate-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.map((row, i) => (
                        <tr key={i} className={`border-b border-slate-50 ${row.errors.length > 0 ? "bg-red-50" : ""}`}>
                          <td className="px-3 py-2 font-medium text-slate-700">{row.data.firstName} {row.data.lastName}</td>
                          <td className="px-3 py-2 text-slate-500">{row.data.jobTitle || "—"}</td>
                          <td className="px-3 py-2"><TypeBadge type={row.data.employmentType ?? "full_time"}/></td>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {row.data.currency === "USD" ? "$" : "L$"}{row.data.rate?.toFixed(2)}/hr
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {row.data.currency === "USD" ? "$" : "L$"}{(row.data.allowances ?? 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-slate-500 capitalize">
                            {row.data.paymentMethod?.replace(/_/g, " ") ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            {row.errors.length > 0 ? (
                              <div className="group relative">
                                <span className="flex items-center gap-1 text-red-500">
                                  <AlertTriangle className="w-3 h-3"/>Error
                                </span>
                                <div className="absolute left-0 top-5 z-50 hidden group-hover:block bg-white border border-red-100 rounded-xl shadow-xl p-2 w-48">
                                  {row.errors.map((e, ei) => <p key={ei} className="text-red-600 text-[10px]">{e}</p>)}
                                </div>
                              </div>
                            ) : (
                              <span className="flex items-center gap-1 text-emerald-500">
                                <CheckCircle2 className="w-3 h-3"/>OK
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={handleImport} disabled={!parsed || validRows.length === 0 || importing}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl
                       bg-[#50C878] text-[#002147] hover:bg-[#3aa85f] disabled:opacity-40 disabled:cursor-not-allowed">
            {importing
              ? <><Loader className="w-4 h-4 animate-spin"/>Importing…</>
              : <>Import {validRows.length > 0 ? `${validRows.length} Employees` : "Employees"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Async Save Button ────────────────────────────────────────────────────────

function AsyncSaveButton({ isNew, onSave }: { isNew: boolean; onSave: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => { setBusy(true); try { await onSave(); } finally { setBusy(false); } }}
      className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold
                 rounded-xl bg-[#50C878] text-[#002147] hover:bg-[#3aa85f]
                 disabled:opacity-60 disabled:cursor-not-allowed">
      {busy ? <Loader className="w-4 h-4 animate-spin"/> : null}
      {busy ? "Saving…" : isNew ? "Add Employee" : "Save Changes"}
    </button>
  );
}

// ─── Employee Drawer ──────────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, type = "text", hint }: {
  label: string; value: string | number; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">{label}</label>
      <input type={type} value={String(value)} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none
                   focus:ring-2 focus:ring-[#50C878] bg-white text-slate-800 placeholder-slate-300"/>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function EmployeeDrawer({ employee, onClose, onSave }: {
  employee: Partial<Employee> | null;
  onClose: () => void;
  onSave: (d: Partial<Employee>) => Promise<void>;
}) {
  const isNew = !employee?.id;
  const [form, setForm] = useState<Partial<Employee>>(employee ?? { ...EMPTY });
  const set = (field: keyof Employee, value: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));
  const pm = form.paymentMethod ?? "bank_transfer";

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}/>
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">

        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800 text-base">{isNew ? "Add Employee" : "Edit Employee"}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isNew ? "Fill in the details below" : `Editing ${employee?.fullName}`}
            </p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Personal</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" value={form.firstName ?? ""} onChange={(v) => set("firstName", v)} placeholder="Moses"/>
            <Field label="Last Name"  value={form.lastName  ?? ""} onChange={(v) => set("lastName",  v)} placeholder="Kollie"/>
          </div>
          <Field label="NASSCORP / National ID" value={form.nasscorpNumber ?? ""} onChange={(v) => set("nasscorpNumber", v)} placeholder="NSC-001-2024"/>
          <Field label="Email" value={form.email ?? ""} onChange={(v) => set("email", v)} type="email" placeholder="m.kollie@company.lr"/>
          <Field label="Phone" value={form.phone ?? ""} onChange={(v) => set("phone", v)} placeholder="+231 770 000 000"/>
          <div>
            <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">County</label>
            <div className="relative">
              <select value={form.county ?? "Montserrado"} onChange={(e) => set("county", e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl appearance-none
                           focus:outline-none focus:ring-2 focus:ring-[#50C878] bg-white text-slate-800">
                {COUNTIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"/>
            </div>
          </div>

          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest pt-2">Employment</p>
          <Field label="Job Title"  value={form.jobTitle   ?? ""} onChange={(v) => set("jobTitle",   v)} placeholder="Operations Manager"/>
          <Field label="Department" value={form.department ?? ""} onChange={(v) => set("department", v)} placeholder="Operations"/>
          <Field label="Start Date" value={form.startDate  ?? ""} onChange={(v) => set("startDate",  v)} type="date"/>
          <div>
            <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">Employment Type</label>
            <div className="relative">
              <select value={form.employmentType ?? "full_time"} onChange={(e) => set("employmentType", e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl appearance-none
                           focus:outline-none focus:ring-2 focus:ring-[#50C878] bg-white text-slate-800">
                {EMP_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"/>
            </div>
          </div>

          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest pt-2">Compensation</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">Currency</label>
              <div className="flex gap-2">
                {(["USD", "LRD"] as const).map((c) => (
                  <button key={c} onClick={() => set("currency", c)}
                    className={`flex-1 py-2.5 text-sm font-semibold rounded-xl border transition-all
                      ${form.currency === c ? "bg-[#002147] text-white border-[#002147]" : "bg-white text-slate-500 border-slate-200"}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Hourly Rate" value={form.rate ?? 0}
              onChange={(v) => set("rate", parseFloat(v) || 0)} type="number" placeholder="8.50"/>
          </div>
          <Field label="Standard Monthly Hours" value={form.standardHours ?? 173.33}
            onChange={(v) => set("standardHours", parseFloat(v) || 173.33)} type="number" placeholder="173.33"/>
          <Field label={`Monthly Allowances (${form.currency ?? "USD"})`} value={form.allowances ?? 0}
            onChange={(v) => set("allowances", parseFloat(v) || 0)} type="number" placeholder="0"
            hint="Transport, housing, etc. — added to gross each month"/>

          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest pt-2">Payment / Disbursement</p>
          <div>
            <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">Payment Method</label>
            <div className="relative">
              <select value={pm} onChange={(e) => set("paymentMethod", e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl appearance-none
                           focus:outline-none focus:ring-2 focus:ring-[#50C878] bg-white text-slate-800">
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"/>
            </div>
          </div>
          {pm === "bank_transfer" && (
            <>
              <Field label="Bank Name"      value={form.bankName      ?? ""} onChange={(v) => set("bankName",      v)} placeholder="Ecobank Liberia"/>
              <Field label="Account Number" value={form.accountNumber ?? ""} onChange={(v) => set("accountNumber", v)} placeholder="1234567890"/>
            </>
          )}
          {(pm === "mtn_momo" || pm === "orange_money") && (
            <Field label={`${pm === "mtn_momo" ? "MTN" : "Orange"} Mobile Number`}
              value={form.momoNumber ?? ""} onChange={(v) => set("momoNumber", v)} placeholder="+231 770 000 000"/>
          )}
          {pm === "cash" && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <p className="text-xs text-amber-700">Cash payment — no additional details required.</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <AsyncSaveButton isNew={isNew} onSave={async () => { await onSave(form); onClose(); }}/>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type DialogState = { kind: "archive" | "hard_delete"; employee: Employee } | null;
type PageView    = "active" | "archived";

export default function EmployeesPage() {
  const {
    employees, archivedEmployees,
    addEmployee, updateEmployee,
    archiveEmployee, restoreEmployee, hardDeleteEmployee,
  } = useApp();

  const { toast } = useToast();

  const [view,       setView]       = useState<PageView>("active");
  const [search,     setSearch]     = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [drawer,     setDrawer]     = useState<Partial<Employee> | null | undefined>(undefined);
  const [showUpload, setShowUpload] = useState(false);
  const [dialog,     setDialog]     = useState<DialogState>(null);
  const [saving,     setSaving]     = useState(false);

  const sourceList = view === "active" ? employees : archivedEmployees;
  const filtered   = sourceList.filter((e) => {
    const q = search.toLowerCase();
    return (
      e.fullName.toLowerCase().includes(q)       ||
      e.employeeNumber.toLowerCase().includes(q) ||
      e.jobTitle.toLowerCase().includes(q)
    ) && (deptFilter === "All" || e.department === deptFilter);
  });
  const activeCount = employees.filter((e) => e.isActive).length;

  // ── Save (add or update) persisted to Supabase ───────────────────────────
  async function handleSave(data: Partial<Employee>) {
    setSaving(true);
    try {
      if (data.id) {
        await updateEmployee(data.id, data);
        toast.success("Employee updated.");
      } else {
        await addEmployee({
          ...(data as Omit<Employee, "id" | "fullName" | "isArchived">),
          isActive: data.isActive ?? true,
        });
        toast.success("Employee added.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to save employee: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  // ── Bulk import — each row persisted via addEmployee ─────────────────────
  async function handleBulkImport(rows: Partial<Employee>[]) {
    setSaving(true);
    try {
      for (const data of rows) {
        await addEmployee({
          ...(data as Omit<Employee, "id" | "fullName" | "isArchived">),
          isActive: true,
        });
      }
      toast.success(`${rows.length} employee${rows.length !== 1 ? "s" : ""} imported.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Bulk import failed: ${msg}`);
      throw err; // CSVUploadModal still catches this to show inline error
    } finally {
      setSaving(false);
    }
  }

  // ── Toggle active status — persisted to Supabase ─────────────────────────
  async function toggleActive(id: string) {
    const emp = employees.find((e) => e.id === id);
    if (!emp) return;
    await updateEmployee(id, { isActive: !emp.isActive });
  }

  function paymentLabel(emp: Employee) {
    switch (emp.paymentMethod) {
      case "bank_transfer": return emp.bankName || "Bank Transfer";
      case "mtn_momo":      return `MTN · ${emp.momoNumber || "—"}`;
      case "orange_money":  return `Orange · ${emp.momoNumber || "—"}`;
      case "cash":          return "Cash";
      default:              return "—";
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      {/* Admin banner */}
      <div className="flex items-center gap-3 bg-[#002147] rounded-2xl px-5 py-3.5">
        <Crown className="w-4 h-4 text-[#50C878] flex-shrink-0"/>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Super Admin · Full premium access</p>
          <p className="text-xs text-white/40 font-mono">All features unlocked · admin@slipdesk.lr</p>
        </div>
        <span className="text-[10px] font-mono bg-[#50C878] text-[#002147] px-2.5 py-1 rounded-full font-bold">PREMIUM</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Employees</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {activeCount} active · {employees.length} total
            {archivedEmployees.length > 0 && ` · ${archivedEmployees.length} archived`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Upload className="w-4 h-4"/>Import CSV
          </button>
          <button onClick={() => setDrawer(null)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-[#50C878] text-[#002147] hover:bg-[#3aa85f]">
            <Plus className="w-4 h-4"/>Add Employee
          </button>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {(["active", "archived"] as PageView[]).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all capitalize
              ${view === v ? "bg-white text-[#002147] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {v === "active" ? `Active (${employees.length})` : `Archived (${archivedEmployees.length})`}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300"/>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, ID, or title…"
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#50C878] bg-white"/>
        </div>
        <div className="flex gap-2 flex-wrap">
          {DEPARTMENTS.map((d) => (
            <button key={d} onClick={() => setDeptFilter(d)}
              className={`px-3 py-2 text-xs font-mono rounded-xl border transition-all
                ${deptFilter === d
                  ? "bg-[#002147] text-white border-[#002147]"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      {view === "active" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Full Time",   count: employees.filter((e) => e.employmentType === "full_time").length,  color: "bg-blue-100 text-blue-700"    },
            { label: "Part Time",   count: employees.filter((e) => e.employmentType === "part_time").length,  color: "bg-purple-100 text-purple-700" },
            { label: "Contractors", count: employees.filter((e) => e.employmentType === "contractor").length, color: "bg-orange-100 text-orange-700" },
            { label: "Casual",      count: employees.filter((e) => e.employmentType === "casual").length,     color: "bg-slate-100 text-slate-600"   },
          ].map((s) => (
            <div key={s.label} className={`flex items-center justify-between px-4 py-3 rounded-xl ${s.color}`}>
              <span className="text-xs font-mono font-semibold">{s.label}</span>
              <span className="text-lg font-bold">{s.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Empty states */}
      {sourceList.length === 0 && view === "active" && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-16 text-center">
          <Users className="w-10 h-10 mx-auto mb-3 text-slate-200"/>
          <p className="text-slate-500 font-medium">No employees yet</p>
          <p className="text-slate-400 text-sm mt-1 mb-5">Add employees one by one or import a CSV file</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">
              <Upload className="w-4 h-4"/>Import CSV
            </button>
            <button onClick={() => setDrawer(null)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-[#50C878] text-[#002147] hover:bg-[#3aa85f]">
              <Plus className="w-4 h-4"/>Add Employee
            </button>
          </div>
        </div>
      )}
      {sourceList.length === 0 && view === "archived" && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-16 text-center">
          <Archive className="w-10 h-10 mx-auto mb-3 text-slate-200"/>
          <p className="text-slate-500 font-medium">No archived employees</p>
          <p className="text-slate-400 text-sm mt-1">Archived employees are excluded from payroll but their records are preserved.</p>
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Employee","Department","Type","Rate","Payment","Status","Actions"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-mono text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => (
                  <tr key={emp.id}
                    className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors
                      ${(!emp.isActive || emp.isArchived) ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#002147]/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[#002147] text-[10px] font-bold">
                            {emp.firstName[0]}{emp.lastName[0]}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-slate-700">{emp.fullName}</p>
                          <p className="text-xs text-slate-400">{emp.employeeNumber} · {emp.jobTitle}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">{emp.department}</td>
                    <td className="px-4 py-3.5"><TypeBadge type={emp.employmentType}/></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                          ${emp.currency === "USD" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                          {emp.currency}
                        </span>
                        <span className="font-mono text-slate-700">
                          {emp.currency === "USD" ? "$" : "L$"}{emp.rate.toFixed(2)}/hr
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">{paymentLabel(emp)}</td>
                    <td className="px-4 py-3.5">
                      {view === "active" ? (
                        <button onClick={() => toggleActive(emp.id)} className="flex items-center gap-1.5">
                          {emp.isActive
                            ? <ToggleRight className="w-5 h-5 text-emerald-500"/>
                            : <ToggleLeft  className="w-5 h-5 text-slate-300"/>}
                          <span className={`text-xs font-mono ${emp.isActive ? "text-emerald-600" : "text-slate-400"}`}>
                            {emp.isActive ? "Active" : "Inactive"}
                          </span>
                        </button>
                      ) : (
                        <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                          <Archive className="w-3.5 h-3.5"/>Archived
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1">
                        {view === "active" ? (
                          <>
                            <button onClick={() => setDrawer(emp)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-[#002147] hover:bg-slate-100 transition-colors" title="Edit">
                              <Edit3 className="w-4 h-4"/>
                            </button>
                            <button onClick={() => setDialog({ kind: "archive", employee: emp })}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-colors" title="Archive">
                              <Archive className="w-4 h-4"/>
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => restoreEmployee(emp.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Restore">
                              <RotateCcw className="w-4 h-4"/>
                            </button>
                            <button onClick={() => setDialog({ kind: "hard_delete", employee: emp })}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete permanently">
                              <Trash2 className="w-4 h-4"/>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 font-mono text-center">
        All employees enrolled in NASSCORP · Employer 6% · Employee 4% of base salary
      </p>

      {/* Global saving overlay — shown during bulk import */}
      {saving && (
        <div className="fixed inset-0 z-[70] bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-2xl px-8 py-6 flex items-center gap-4 shadow-2xl">
            <Loader className="w-5 h-5 animate-spin text-[#50C878]"/>
            <p className="text-sm font-medium text-slate-700">Saving to Supabase…</p>
          </div>
        </div>
      )}

      {/* Modals */}
      {drawer !== undefined && (
        <EmployeeDrawer employee={drawer} onClose={() => setDrawer(undefined)} onSave={handleSave}/>
      )}
      {showUpload && (
        <CSVUploadModal onClose={() => setShowUpload(false)} onImport={handleBulkImport}/>
      )}

      {dialog?.kind === "archive" && (
        <ConfirmDialog
          title="Archive Employee"
          message={`Archive ${dialog.employee.fullName}? They'll be removed from future pay runs but their records are preserved. You can restore them at any time.`}
          confirmLabel="Archive"
          confirmClass="bg-amber-500 text-white hover:bg-amber-600"
          onConfirm={() => { archiveEmployee(dialog.employee.id); setDialog(null); }}
          onCancel={() => setDialog(null)}/>
      )}
      {dialog?.kind === "hard_delete" && (
        <ConfirmDialog
          title="Permanently Delete Employee"
          message={`Delete ${dialog.employee.fullName} permanently? This cannot be undone and all their payroll records will be lost.`}
          confirmLabel="Delete Permanently"
          confirmClass="bg-red-500 text-white hover:bg-red-600"
          onConfirm={() => { hardDeleteEmployee(dialog.employee.id); setDialog(null); }}
          onCancel={() => setDialog(null)}/>
      )}
    </div>
  );
}

"use client";

import { useState, useRef, useCallback } from "react";
import {
  Search, Plus, X, ChevronDown, Users, Edit3,
  ToggleLeft, ToggleRight, Upload, Download,
  AlertTriangle, CheckCircle2, FileText, Crown,
} from "lucide-react";
import type { Employee } from "@/lib/mock-data";
import { useApp } from "@/context/AppContext";

// ─── Super Admin Account ──────────────────────────────────────────────────────
export const SUPER_ADMIN = {
  id:       "admin-001",
  email:    "admin@slipdesk.lr",
  password: "Slipdesk@2025!",
  name:     "Super Admin",
  role:     "super_admin" as const,
  plan:     "premium" as const,
  company:  "Slipdesk Demo Co.",
};

const isPremium = true;

// ─── Constants ────────────────────────────────────────────────────────────────
const DEPARTMENTS  = ["All", "Operations", "Finance", "Engineering", "Sales", "Human Resources"];
const EMP_TYPES    = ["full_time", "part_time", "contractor", "casual"] as const;
const COUNTIES     = ["Montserrado", "Margibi", "Bong", "Nimba", "Lofa", "Grand Bassa", "Sinoe"];

const EMPTY: Omit<Employee, "id" | "employeeNumber" | "fullName"> = {
  firstName: "", lastName: "", jobTitle: "", department: "Operations",
  email: "", phone: "", county: "Montserrado", startDate: "",
  employmentType: "full_time", currency: "USD", rate: 0,
  standardHours: 173.33, isActive: true, nasscorpNumber: "", bankName: "",
};

const CSV_HEADERS = [
  "firstName","lastName","jobTitle","department","email","phone",
  "county","startDate","employmentType","currency","rate","standardHours",
  "nasscorpNumber","bankName",
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
    "Moses,Kollie,Operations Manager,Operations,m.kollie@company.lr,+231770000001,Montserrado,2023-01-15,full_time,USD,8.50,173.33,NSC-001-2024,Ecobank Liberia",
    "Fanta,Kamara,Finance Officer,Finance,f.kamara@company.lr,+231770000002,Montserrado,2023-03-01,full_time,LRD,1500,173.33,NSC-002-2024,UBA Liberia",
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "slipdesk-employees-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

interface ParsedRow {
  data:     Partial<Employee>;
  errors:   string[];
  warnings: string[];
  raw:      Record<string, string>;
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
  const results: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === "," && !inQuotes) { values.push(current.trim()); current = ""; }
      else { current += ch; }
    }
    values.push(current.trim());

    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => { raw[h] = values[idx] ?? ""; });

    const errors:   string[] = [];
    const warnings: string[] = [];

    if (!raw.firstname) errors.push("First name is required");
    if (!raw.lastname)  errors.push("Last name is required");
    if (!raw.currency)  errors.push("Currency is required");
    if (!raw.rate)      errors.push("Rate is required");

    const rate = parseFloat(raw.rate);
    if (raw.rate && isNaN(rate)) errors.push("Rate must be a number");

    const hours = parseFloat(raw.standardhours);
    if (raw.standardhours && isNaN(hours)) warnings.push("Standard hours invalid — defaulting to 173.33");

    const currency = (raw.currency ?? "USD").toUpperCase();
    if (!["USD", "LRD"].includes(currency)) errors.push("Currency must be USD or LRD");

    const empType = raw.employmenttype ?? "full_time";
    if (!["full_time","part_time","contractor","casual"].includes(empType))
      warnings.push(`Employment type "${empType}" unknown — defaulting to full_time`);

    if (currency === "USD" && !isNaN(rate) && rate * (hours || 173.33) < 150)
      warnings.push("Gross pay may fall below $150 USD minimum wage");

    const data: Partial<Employee> = {
      firstName:      raw.firstname      || "",
      lastName:       raw.lastname       || "",
      jobTitle:       raw.jobtitle       || "",
      department:     raw.department     || "Operations",
      email:          raw.email          || "",
      phone:          raw.phone          || "",
      county:         raw.county         || "Montserrado",
      startDate:      raw.startdate      || "",
      employmentType: (["full_time","part_time","contractor","casual"].includes(empType)
                        ? empType : "full_time") as Employee["employmentType"],
      currency:       (["USD","LRD"].includes(currency) ? currency : "USD") as "USD" | "LRD",
      rate:           isNaN(rate) ? 0 : rate,
      standardHours:  isNaN(hours) ? 173.33 : hours,
      nasscorpNumber: raw.nasscorpnumber || "",
      bankName:       raw.bankname       || "",
      isActive:       true,
    };

    results.push({ data, errors, warnings, raw });
  }
  return results;
}

// ─── Field components ─────────────────────────────────────────────────────────

function Field({
  label, field, form, set, type = "text", placeholder = "",
}: {
  label: string; field: keyof Employee;
  form: Partial<Employee>; set: (f: keyof Employee, v: string | number | boolean) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">{label}</label>
      <input
        type={type}
        value={String(form[field] ?? "")}
        placeholder={placeholder}
        onChange={(e) => set(field, type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)}
        className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl
                   focus:outline-none focus:ring-2 focus:ring-[#50C878] focus:border-transparent
                   bg-white text-slate-800 placeholder-slate-300"
      />
    </div>
  );
}

function SelectField({
  label, field, form, set, options,
}: {
  label: string; field: keyof Employee;
  form: Partial<Employee>; set: (f: keyof Employee, v: string | number | boolean) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">{label}</label>
      <div className="relative">
        <select
          value={String(form[field] ?? "")}
          onChange={(e) => set(field, e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl appearance-none
                     focus:outline-none focus:ring-2 focus:ring-[#50C878] bg-white text-slate-800"
        >
          {options.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      </div>
    </div>
  );
}

// ─── Employee Drawer ──────────────────────────────────────────────────────────

function EmployeeDrawer({
  employee, onClose, onSave,
}: {
  employee: Partial<Employee> | null;
  onClose: () => void;
  onSave: (data: Partial<Employee>) => void;
}) {
  const isNew = !employee?.id;
  const [form, setForm] = useState<Partial<Employee>>(employee ?? { ...EMPTY });
  const set = (field: keyof Employee, value: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800 text-base">
              {isNew ? "Add Employee" : "Edit Employee"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isNew ? "Fill in the details below" : `Editing ${employee?.fullName}`}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Personal</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" field="firstName" form={form} set={set} placeholder="Moses" />
            <Field label="Last Name"  field="lastName"  form={form} set={set} placeholder="Kollie" />
          </div>
          <Field label="National ID / Passport" field="nasscorpNumber" form={form} set={set} placeholder="NSC-001-2024" />
          <Field label="Email" field="email" form={form} set={set} type="email" placeholder="m.kollie@company.lr" />
          <Field label="Phone" field="phone" form={form} set={set} placeholder="+231 770 000 000" />
          <div>
            <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">County</label>
            <div className="relative">
              <select value={form.county ?? "Montserrado"} onChange={(e) => set("county", e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl appearance-none
                           focus:outline-none focus:ring-2 focus:ring-[#50C878] bg-white text-slate-800">
                {COUNTIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest pt-2">Employment</p>
          <Field label="Job Title"  field="jobTitle"   form={form} set={set} placeholder="Operations Manager" />
          <Field label="Department" field="department" form={form} set={set} placeholder="Operations" />
          <Field label="Start Date" field="startDate"  form={form} set={set} type="date" />
          <SelectField label="Employment Type" field="employmentType" form={form} set={set} options={[...EMP_TYPES]} />

          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest pt-2">Compensation</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">Currency</label>
              <div className="flex gap-2">
                {(["USD", "LRD"] as const).map((c) => (
                  <button key={c} onClick={() => set("currency", c)}
                    className={`flex-1 py-2.5 text-sm font-semibold rounded-xl border transition-all ${
                      form.currency === c ? "bg-[#002147] text-white border-[#002147]" : "bg-white text-slate-500 border-slate-200"}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Hourly Rate" field="rate" form={form} set={set} type="number" placeholder="8.50" />
          </div>
          <Field label="Standard Monthly Hours" field="standardHours" form={form} set={set} type="number" placeholder="173.33" />
          <Field label="Bank Name" field="bankName" form={form} set={set} placeholder="Ecobank Liberia" />
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={() => { onSave(form); onClose(); }}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-[#50C878] text-[#002147] hover:bg-[#3aa85f]">
            {isNew ? "Add Employee" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CSV Upload Modal ─────────────────────────────────────────────────────────

function CSVUploadModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (employees: Partial<Employee>[]) => void;
}) {
  const [parsed,   setParsed]   = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) { alert("Please upload a .csv file"); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setParsed(parseCSV(text));
    };
    reader.readAsText(file);
  }, []);

  const validRows   = parsed?.filter((r) => r.errors.length === 0) ?? [];
  const invalidRows = parsed?.filter((r) => r.errors.length > 0)  ?? [];

  function confirmImport() {
    onImport(validRows.map((r) => r.data));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800 text-base flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#50C878]" /> Bulk Import Employees
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Upload a CSV file to add multiple employees at once</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-medium text-blue-800">Need a template?</p>
              <p className="text-xs text-blue-500 mt-0.5">Download our CSV template with all required columns</p>
            </div>
            <button onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-blue-200 text-blue-700 rounded-xl hover:bg-blue-50">
              <Download className="w-3.5 h-3.5" /> Template
            </button>
          </div>

          {!parsed && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                dragging ? "border-[#50C878] bg-emerald-50" : "border-slate-200 hover:border-[#50C878] hover:bg-slate-50"}`}>
              <FileText className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">Drop your CSV here or click to browse</p>
              <p className="text-xs text-slate-400 mt-1">Only .csv files supported</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          )}

          {parsed && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                  <p className="text-xs font-mono text-emerald-600 uppercase tracking-wider">Ready to import</p>
                  <p className="text-2xl font-bold text-emerald-700">{validRows.length}</p>
                </div>
                {invalidRows.length > 0 && (
                  <div className="flex-1 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    <p className="text-xs font-mono text-red-500 uppercase tracking-wider">Rows with errors</p>
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
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                  <p className="text-xs font-mono text-slate-500 uppercase tracking-wider">Preview</p>
                </div>
                <div className="overflow-x-auto max-h-60">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left px-3 py-2 font-mono text-slate-400">#</th>
                        <th className="text-left px-3 py-2 font-mono text-slate-400">Name</th>
                        <th className="text-left px-3 py-2 font-mono text-slate-400">Job Title</th>
                        <th className="text-left px-3 py-2 font-mono text-slate-400">Type</th>
                        <th className="text-left px-3 py-2 font-mono text-slate-400">Rate</th>
                        <th className="text-left px-3 py-2 font-mono text-slate-400">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.map((row, i) => (
                        <tr key={i} className={`border-b border-slate-50 ${row.errors.length > 0 ? "bg-red-50" : ""}`}>
                          <td className="px-3 py-2 font-mono text-slate-400">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-slate-700">{row.data.firstName} {row.data.lastName}</td>
                          <td className="px-3 py-2 text-slate-500">{row.data.jobTitle || "—"}</td>
                          <td className="px-3 py-2"><TypeBadge type={row.data.employmentType ?? "full_time"} /></td>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {row.data.currency === "USD" ? "$" : "L$"}{row.data.rate?.toFixed(2)}/hr
                          </td>
                          <td className="px-3 py-2">
                            {row.errors.length > 0 ? (
                              <div className="group relative">
                                <span className="flex items-center gap-1 text-red-500">
                                  <AlertTriangle className="w-3 h-3" /> Error
                                </span>
                                <div className="absolute left-0 top-5 z-50 hidden group-hover:block bg-white border border-red-100 rounded-xl shadow-xl p-2 w-48 space-y-1">
                                  {row.errors.map((e, ei) => <p key={ei} className="text-red-600 text-[10px]">{e}</p>)}
                                </div>
                              </div>
                            ) : row.warnings.length > 0 ? (
                              <div className="group relative">
                                <span className="flex items-center gap-1 text-amber-500">
                                  <AlertTriangle className="w-3 h-3" /> Warning
                                </span>
                                <div className="absolute left-0 top-5 z-50 hidden group-hover:block bg-white border border-amber-100 rounded-xl shadow-xl p-2 w-48 space-y-1">
                                  {row.warnings.map((w, wi) => <p key={wi} className="text-amber-600 text-[10px]">{w}</p>)}
                                </div>
                              </div>
                            ) : (
                              <span className="flex items-center gap-1 text-emerald-500">
                                <CheckCircle2 className="w-3 h-3" /> OK
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {invalidRows.length > 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  {invalidRows.length} row{invalidRows.length > 1 ? "s" : ""} with errors will be skipped.
                  Fix them in your CSV and re-upload to include them.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={confirmImport}
            disabled={!parsed || validRows.length === 0}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-[#50C878] text-[#002147]
                       hover:bg-[#3aa85f] disabled:opacity-40 disabled:cursor-not-allowed">
            Import {validRows.length > 0 ? `${validRows.length} Employee${validRows.length > 1 ? "s" : ""}` : "Employees"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
  // ── Use shared context instead of local state ──────────────────────────────
  const { employees, setEmployees } = useApp();

  const [search,     setSearch]     = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [drawer,     setDrawer]     = useState<Partial<Employee> | null | undefined>(undefined);
  const [showUpload, setShowUpload] = useState(false);

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch = e.fullName.toLowerCase().includes(q) ||
      e.employeeNumber.toLowerCase().includes(q) ||
      e.jobTitle.toLowerCase().includes(q);
    return matchSearch && (deptFilter === "All" || e.department === deptFilter);
  });

  const activeCount = employees.filter((e) => e.isActive).length;

  function handleSave(data: Partial<Employee>) {
    if (data.id) {
      setEmployees((prev) => prev.map((e) =>
        e.id === data.id ? { ...e, ...data, fullName: `${data.firstName} ${data.lastName}` } : e
      ));
    } else {
      const num = employees.length + 1;
      setEmployees((prev) => [...prev, {
        ...(data as Omit<Employee, "id" | "employeeNumber" | "fullName">),
        id:             `EMP-${String(num).padStart(3, "0")}`,
        employeeNumber: `EMP-${String(num).padStart(3, "0")}`,
        fullName:       `${data.firstName} ${data.lastName}`,
      }]);
    }
  }

  function handleBulkImport(rows: Partial<Employee>[]) {
    const newEmployees: Employee[] = rows.map((data, idx) => {
      const num = employees.length + idx + 1;
      return {
        ...(data as Omit<Employee, "id" | "employeeNumber" | "fullName">),
        id:             `EMP-${String(num).padStart(3, "0")}`,
        employeeNumber: `EMP-${String(num).padStart(3, "0")}`,
        fullName:       `${data.firstName} ${data.lastName}`,
      };
    });
    setEmployees((prev) => [...prev, ...newEmployees]);
  }

  function toggleActive(id: string) {
    setEmployees((prev) => prev.map((e) => e.id === id ? { ...e, isActive: !e.isActive } : e));
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      {/* Super Admin Banner */}
      <div className="flex items-center gap-3 bg-[#002147] rounded-2xl px-5 py-3.5">
        <Crown className="w-4 h-4 text-[#50C878] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">
            Super Admin · {SUPER_ADMIN.name}
          </p>
          <p className="text-xs text-white/40 font-mono">
            {SUPER_ADMIN.email} · Full premium access · All features unlocked
          </p>
        </div>
        <span className="text-[10px] font-mono bg-[#50C878] text-[#002147] px-2.5 py-1 rounded-full font-bold flex-shrink-0">
          PREMIUM
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Employees</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {activeCount} active · {employees.length} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isPremium && (
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                         border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              <Upload className="w-4 h-4" /> Import CSV
            </button>
          )}
          <button onClick={() => setDrawer(null)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                       bg-[#50C878] text-[#002147] hover:bg-[#3aa85f] transition-colors">
            <Plus className="w-4 h-4" /> Add Employee
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, ID, or title…"
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-[#50C878] bg-white" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {DEPARTMENTS.map((d) => (
            <button key={d} onClick={() => setDeptFilter(d)}
              className={`px-3 py-2 text-xs font-mono rounded-xl border transition-all ${
                deptFilter === d ? "bg-[#002147] text-white border-[#002147]" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Full Time",   count: employees.filter((e) => e.employmentType === "full_time").length,  color: "bg-blue-100 text-blue-700" },
          { label: "Part Time",   count: employees.filter((e) => e.employmentType === "part_time").length,  color: "bg-purple-100 text-purple-700" },
          { label: "Contractors", count: employees.filter((e) => e.employmentType === "contractor").length, color: "bg-orange-100 text-orange-700" },
          { label: "Casual",      count: employees.filter((e) => e.employmentType === "casual").length,     color: "bg-slate-100 text-slate-600" },
        ].map((s) => (
          <div key={s.label} className={`flex items-center justify-between px-4 py-3 rounded-xl ${s.color}`}>
            <span className="text-xs font-mono font-semibold">{s.label}</span>
            <span className="text-lg font-bold">{s.count}</span>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {employees.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-16 text-center">
          <Users className="w-10 h-10 mx-auto mb-3 text-slate-200" />
          <p className="text-slate-500 font-medium">No employees yet</p>
          <p className="text-slate-400 text-sm mt-1 mb-5">Add employees one by one or import a CSV file</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">
              <Upload className="w-4 h-4" /> Import CSV
            </button>
            <button onClick={() => setDrawer(null)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-[#50C878] text-[#002147] hover:bg-[#3aa85f]">
              <Plus className="w-4 h-4" /> Add Employee
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {employees.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Employee", "Department", "Type", "Currency & Rate", "Hours/mo", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-mono text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                      <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No employees match your search
                    </td>
                  </tr>
                ) : filtered.map((emp) => (
                  <tr key={emp.id}
                    className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors ${!emp.isActive ? "opacity-50" : ""}`}>
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
                    <td className="px-4 py-3.5"><TypeBadge type={emp.employmentType} /></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${emp.currency === "USD" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                          {emp.currency}
                        </span>
                        <span className="font-mono text-slate-700">
                          {emp.currency === "USD" ? "$" : "L$"}{emp.rate.toFixed(2)}/hr
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-500">{emp.standardHours}</td>
                    <td className="px-4 py-3.5">
                      <button onClick={() => toggleActive(emp.id)} className="flex items-center gap-1.5">
                        {emp.isActive
                          ? <ToggleRight className="w-5 h-5 text-emerald-500" />
                          : <ToggleLeft  className="w-5 h-5 text-slate-300" />}
                        <span className={`text-xs font-mono ${emp.isActive ? "text-emerald-600" : "text-slate-400"}`}>
                          {emp.isActive ? "Active" : "Inactive"}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3.5">
                      <button onClick={() => setDrawer(emp)}
                        className="text-slate-400 hover:text-[#002147] transition-colors p-1 rounded-lg hover:bg-slate-100">
                        <Edit3 className="w-4 h-4" />
                      </button>
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

      {/* Modals */}
      {drawer !== undefined && (
        <EmployeeDrawer employee={drawer} onClose={() => setDrawer(undefined)} onSave={handleSave} />
      )}
      {showUpload && (
        <CSVUploadModal onClose={() => setShowUpload(false)} onImport={handleBulkImport} />
      )}
    </div>
  );
}
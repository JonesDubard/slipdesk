"use client";

/**
 * Slipdesk — Employees Page
 * Place at: src/app/(dashboard)/employees/page.tsx
 */

import { useState, useRef, useCallback } from "react";
import {
  Search, Plus, X, ChevronDown, Users, Edit3,
  Upload, Download, AlertTriangle, CheckCircle2, 
  FileText, Loader,
} from "lucide-react";
import type { Employee, PaymentMethod } from "@/context/AppContext";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/Toast";
import PageSkeleton from "@/components/PageSkeleton";

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

// UPDATED: Added "deductions" to the headers
const CSV_HEADERS = [
  "employee_number", "first_name", "last_name", "job_title", "department",
  "email", "phone", "county", "start_date",
  "employment_type", "currency", "rate", "standard_hours", "allowances",
  "nasscorp_number",
  "payment_method", "bank_name", "account_number", "momo_number",
  "regular_hours", "overtime_hours", "holiday_hours", "deductions"
];

// UPDATED: Template now includes a placeholder for deductions (the last 0)
function downloadTemplate() {
  const rows = [
    CSV_HEADERS.join(","),
    "EMP-001,Moses,Kollie,Operations Manager,Operations,m.kollie@co.lr,+231770000001,Montserrado,2023-01-15,full_time,USD,8.50,173.33,0,NSC-001-2024,bank_transfer,Ecobank Liberia,1234567890,,173.33,0,0,0",
    "EMP-002,Fanta,Kamara,Finance Officer,Finance,f.kamara@co.lr,+231770000002,Montserrado,2023-03-01,full_time,LRD,1500,173.33,50000,NSC-002-2024,mtn_momo,,,0770000002,173.33,0,8,0",
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

    const firstName = raw.first_name  || raw.firstname  || "";
    const lastName  = raw.last_name   || raw.lastname   || "";
    const currency  = (raw.currency  || "USD").toUpperCase();
    const pm        = raw.payment_method   || raw.paymentmethod   || "bank_transfer";

    if (!firstName) errors.push("First name required");
    if (!lastName)  errors.push("Last name required");
    if (!raw.currency) errors.push("Currency required");
    if (!raw.rate)     errors.push("Rate required");

    const rate           = parseFloat(raw.rate);
    const hours          = parseFloat(raw.standard_hours || "173.33");
    const allowances     = parseFloat(raw.allowances ?? "0");
    const parsedRegHours = raw.regular_hours ? parseFloat(raw.regular_hours) : null;
    const parsedOtHours  = raw.overtime_hours ? parseFloat(raw.overtime_hours) : null;
    const parsedHolHours = raw.holiday_hours ? parseFloat(raw.holiday_hours) : null;
    const parsedDed      = raw.deductions ? parseFloat(raw.deductions) : null;

    const data: Partial<Employee> = {
      firstName,
      lastName,
      jobTitle:       raw.job_title || "",
      department:     raw.department || "Operations",
      email:          raw.email || "",
      phone:          raw.phone || "",
      county:         raw.county || "Montserrado",
      startDate:      raw.start_date || "",
      employmentType: (["full_time","part_time","contractor","casual"].includes(raw.employment_type) 
                        ? raw.employment_type : "full_time") as Employee["employmentType"],
      currency:       (currency === "LRD" ? "LRD" : "USD"),
      rate:           isNaN(rate) ? 0 : rate,
      standardHours:  isNaN(hours) ? 173.33 : hours,
      allowances:     isNaN(allowances) ? 0 : allowances,
      nasscorpNumber: raw.nasscorp_number || "",
      paymentMethod:  pm as PaymentMethod,
      bankName:       raw.bank_name || "",
      accountNumber:  raw.account_number || "",
      momoNumber:     raw.momo_number || "",
      isActive:       true,
      isArchived:     false,
      pendingRegularHours:  (isNaN(parsedRegHours as number) || parsedRegHours === null) ? null : parsedRegHours,
      pendingOvertimeHours: (isNaN(parsedOtHours as number) || parsedOtHours === null) ? null : parsedOtHours,
      pendingHolidayHours:  (isNaN(parsedHolHours as number) || parsedHolHours === null) ? null : parsedHolHours,
      pendingDeductions:    (isNaN(parsedDed as number) || parsedDed === null) ? null : parsedDed,
    };

    results.push({ data, errors, warnings });
  }
  return results;
}

// ─── CSV Upload Modal ─────────────────────────────────────────────────────────

function CSVUploadModal({ onClose, onImport }: {
  onClose: () => void;
  onImport: (rows: Partial<Employee>[]) => Promise<void>;
}) {
  const { toast } = useToast();
  const [parsed,    setParsed]    = useState<ParsedRow[] | null>(null);
  const [fileName,  setFileName]  = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) { toast.error("Please upload a .csv file."); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setParsed(parseEmployeeCSV(e.target?.result as string));
    reader.readAsText(file);
  }, [toast]);

  const validRows = parsed?.filter((r) => r.errors.length === 0) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#50C878]"/>Bulk Import
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400"/></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
           {!parsed ? (
             <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer hover:bg-slate-50 border-slate-200">
               <FileText className="w-10 h-10 mx-auto mb-3 text-slate-300"/>
               <p className="text-sm font-medium text-slate-600">Click to upload CSV</p>
               <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleFile(e.target.files![0])}/>
             </div>
           ) : (
             <div className="space-y-4">
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                  <p className="text-emerald-700 font-bold text-lg">{validRows.length} Employees Ready</p>
                  <p className="text-emerald-600 text-xs">Deductions and hours detected in CSV will be saved as pending overrides.</p>
                </div>
                <button onClick={() => setParsed(null)} className="text-xs text-blue-500 underline">Choose different file</button>
             </div>
           )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 border rounded-xl">Cancel</button>
          <button 
            disabled={!validRows.length || importing}
            onClick={async () => {
              setImporting(true);
              await onImport(validRows.map(r => r.data));
              setImporting(false);
            }} 
            className="flex-1 bg-[#50C878] text-[#002147] font-bold py-2 rounded-xl disabled:opacity-50"
          >
            {importing ? <Loader className="animate-spin mx-auto w-5 h-5"/> : `Import ${validRows.length} Employees`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function EmployeesPage() {
  const { employees, addEmployee, refreshEmployees, loading } = useApp();
  const { toast } = useToast();
  const [showUpload, setShowUpload] = useState(false);

  // FIX: THE BULK UPLOAD STATE RACE SOLUTION
  async function handleBulkImport(rows: Partial<Employee>[]) {
    try {
      // 1. Send all requests to Supabase
      // We use a for...of loop to avoid overwhelming the connection and ensure sequential logic
      for (const row of rows) {
        await addEmployee({
          ...(row as Omit<Employee, "id" | "fullName" | "isArchived">),
          isActive: true,
        });
      }

      // 2. CRITICAL FIX: Instead of relying on individual state updates,
      // refresh the entire employee list from the DB once after all additions.
      await refreshEmployees();

      toast.success(`Successfully imported ${rows.length} employees.`);
      setShowUpload(false);
    } catch (err) {
      toast.error("An error occurred during import.");
      console.error(err);
    }
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Employees</h1>
          <p className="text-slate-500">{employees.length} total active employees</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => downloadTemplate()} className="flex items-center gap-2 px-4 py-2 border rounded-xl text-slate-600 hover:bg-slate-50">
            <Download className="w-4 h-4"/> Template
          </button>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-[#002147] text-white rounded-xl">
            <Upload className="w-4 h-4"/> Bulk Import
          </button>
        </div>
      </div>

      {/* Employee List Table would go here... (Existing Code) */}

      {showUpload && (
        <CSVUploadModal 
          onClose={() => setShowUpload(false)} 
          onImport={handleBulkImport} 
        />
      )}
    </div>
  );
}
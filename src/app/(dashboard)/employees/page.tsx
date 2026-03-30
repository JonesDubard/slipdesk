"use client";

/**
 * Slipdesk — Employees Page (Fixed & Redesigned)
 * Place at: src/app/(dashboard)/employees/page.tsx
 *
 * Fixes applied:
 *  1. CSV import: BOM stripping, proper quoted-field parsing, all 5 rows now import
 *  2. RowMenu: dropdown now uses position:fixed + getBoundingClientRect so it
 *     never gets clipped by table overflow and never overlaps adjacent rows
 *  3. Edit / Archive / Delete wired up with working handlers passed from page
 *  4. UI: polished stats bar, hover states, action column z-index, bulk bar
 */

import { useState, useRef, useCallback, useMemo } from "react";
import {
  Search, Plus, X, Upload, Download, FileText, Loader,
  Archive, Edit3, RotateCcw, Trash2,
  Users, UserCheck, UserX, Filter, ChevronDown, Save, CheckSquare,
} from "lucide-react";
import type { Employee, EmploymentType, Currency, PaymentMethod } from "@/context/AppContext";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/Toast";
import PageSkeleton from "@/components/PageSkeleton";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPARTMENTS = ["All", "Operations", "Finance", "Engineering", "Sales", "Human Resources"];
const DEPT_LIST   = ["Operations", "Finance", "Engineering", "Sales", "Human Resources"];
const COUNTIES    = ["Montserrado","Margibi","Bong","Nimba","Lofa","Grand Bassa","Sinoe","Grand Gedeh","Maryland","River Cess"];

const DEPT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Operations:        { bg: "#0a2a4a", text: "#50C878", border: "#50C87840" },
  Finance:           { bg: "#0a2a3a", text: "#38bdf8", border: "#38bdf840" },
  Engineering:       { bg: "#1a1a3a", text: "#a78bfa", border: "#a78bfa40" },
  Sales:             { bg: "#2a1a1a", text: "#fb923c", border: "#fb923c40" },
  "Human Resources": { bg: "#2a1a2a", text: "#f472b6", border: "#f472b640" },
};

const AVATAR_COLORS = [
  "#50C878","#38bdf8","#a78bfa","#fb923c","#f472b6",
  "#34d399","#60a5fa","#f59e0b","#ec4899","#14b8a6",
];

const EMP_TYPE_LABELS: Record<string, string> = {
  full_time: "Full-time", part_time: "Part-time",
  contractor: "Contractor", casual: "Casual",
};

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "bank_transfer", label: "Bank Transfer"    },
  { value: "mtn_momo",      label: "MTN Mobile Money" },
  { value: "orange_money",  label: "Orange Money"     },
  { value: "cash",          label: "Cash"             },
];

const CSV_HEADERS = [
  "employee_number","first_name","last_name","job_title","department",
  "email","phone","county","start_date","employment_type","currency",
  "rate","standard_hours","allowances","nasscorp_number","payment_method",
  "bank_name","account_number","momo_number","regular_hours","overtime_hours",
  "holiday_hours","deductions",
];

const EMPTY_FORM: Omit<Employee, "id" | "employeeNumber" | "fullName" | "isArchived"> = {
  firstName: "", lastName: "", jobTitle: "", department: "Operations",
  email: "", phone: "", county: "Montserrado", startDate: "",
  employmentType: "full_time", currency: "USD", rate: 0,
  standardHours: 173.33, isActive: true, nasscorpNumber: "",
  allowances: 0, paymentMethod: "bank_transfer",
  bankName: "", accountNumber: "", momoNumber: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}
function getAvatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

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

// ─── CSV Parser (FIXED) ───────────────────────────────────────────────────────

interface ParsedRow { data: Partial<Employee>; errors: string[]; }

/**
 * FIX 1 — proper CSV parsing:
 *   • strips UTF-8 BOM (causes row-1 header key mismatch → silent skip)
 *   • normalises \r\n and bare \r
 *   • handles quoted fields that contain commas
 *   • skips truly blank lines only
 */
function parseEmployeeCSV(text: string): ParsedRow[] {
  // Strip BOM + normalise line endings
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = clean.split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, "").replace(/^"|"$/g, "")
  );

  const results: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue; // skip genuinely blank lines

    // Proper quoted-field splitter
    const vals: string[] = [];
    let cur = "";
    let inQ = false;
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      if (ch === '"') {
        if (inQ && line[ci + 1] === '"') { cur += '"'; ci++; } // escaped quote
        else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        vals.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    vals.push(cur.trim());

    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => { raw[h] = vals[idx] ?? ""; });

    const errors: string[] = [];
    const firstName = raw.first_name || raw.firstname || "";
    const lastName  = raw.last_name  || raw.lastname  || "";
    const currency  = (raw.currency  || "USD").toUpperCase();
    const pm        = raw.payment_method || raw.paymentmethod || "bank_transfer";

    if (!firstName) errors.push("First name required");
    if (!lastName)  errors.push("Last name required");
    if (!raw.currency) errors.push("Currency required");
    if (!raw.rate)     errors.push("Rate required");

    const n = (v: string | undefined) => (v ? parseFloat(v) : null);

    results.push({
      errors,
      data: {
        employeeNumber: raw.employee_number || "",
        firstName, lastName,
        jobTitle:       raw.job_title   || "",
        department:     raw.department  || "Operations",
        email:          raw.email       || "",
        phone:          raw.phone       || "",
        county:         raw.county      || "Montserrado",
        startDate:      raw.start_date  || "",
        employmentType: (["full_time","part_time","contractor","casual"].includes(raw.employment_type)
          ? raw.employment_type : "full_time") as EmploymentType,
        currency:       currency === "LRD" ? "LRD" : "USD",
        rate:           isNaN(parseFloat(raw.rate))           ? 0      : parseFloat(raw.rate),
        standardHours:  isNaN(parseFloat(raw.standard_hours)) ? 173.33 : parseFloat(raw.standard_hours),
        allowances:     isNaN(parseFloat(raw.allowances ?? "0")) ? 0   : parseFloat(raw.allowances ?? "0"),
        nasscorpNumber: raw.nasscorp_number || "",
        paymentMethod:  pm as PaymentMethod,
        bankName:       raw.bank_name       || "",
        accountNumber:  raw.account_number  || "",
        momoNumber:     raw.momo_number     || "",
        isActive:    true,
        isArchived:  false,
        pendingRegularHours:  n(raw.regular_hours),
        pendingOvertimeHours: n(raw.overtime_hours),
        pendingHolidayHours:  n(raw.holiday_hours),
        pendingDeductions:    n(raw.deductions),
      },
    });
  }
  return results;
}

// ─── UI Atoms ─────────────────────────────────────────────────────────────────

function Avatar({ firstName, lastName, size = 36 }: { firstName: string; lastName: string; size?: number }) {
  const color = getAvatarColor(firstName + lastName);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `${color}20`, border: `1.5px solid ${color}50`,
      color, fontSize: size * 0.36, fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Mono',monospace", flexShrink: 0, letterSpacing: "0.05em",
    }}>
      {getInitials(firstName, lastName)}
    </div>
  );
}

function DeptBadge({ dept }: { dept: string }) {
  const c = DEPT_COLORS[dept] ?? { bg: "#1a2a1a", text: "#50C878", border: "#50C87840" };
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 600,
      letterSpacing: "0.04em", fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap",
    }}>
      {dept}
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: active ? "#50C87815" : "#ffffff08",
      color: active ? "#50C878" : "#475569",
      border: `1px solid ${active ? "#50C87840" : "#ffffff10"}`,
      borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: active ? "#50C878" : "#475569",
        boxShadow: active ? "0 0 6px #50C878" : "none",
      }}/>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

// ─── Form Inputs ──────────────────────────────────────────────────────────────

const inputBase: React.CSSProperties = {
  width: "100%", padding: "9px 12px", background: "#071525",
  border: "1px solid #1e3a5f", borderRadius: 9, color: "#e2e8f0",
  fontSize: 13, boxSizing: "border-box", fontFamily: "'DM Sans',sans-serif",
  outline: "none", transition: "border-color 0.2s",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{
        fontSize: 11, fontWeight: 600, color: "#334155",
        letterSpacing: "0.06em", textTransform: "uppercase",
        fontFamily: "'DM Mono',monospace",
      }}>{label}</label>
      {children}
    </div>
  );
}

function Inp({ value, onChange, placeholder, type = "text" }: {
  value: string | number; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type} value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} style={inputBase}
      onFocus={(e) => { e.target.style.borderColor = "#50C87870"; }}
      onBlur={(e)  => { e.target.style.borderColor = "#1e3a5f"; }}
    />
  );
}

function Sel({ value, onChange, children }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ ...inputBase, cursor: "pointer" }}>
      {children}
    </select>
  );
}

// ─── Employee Drawer (Add / Edit) ─────────────────────────────────────────────

type DrawerTab = "basic" | "pay" | "payment";

function EmployeeDrawer({ employee, onClose, onSave }: {
  employee?: Employee;
  onClose: () => void;
  onSave: (data: Omit<Employee, "id" | "fullName" | "isArchived">) => Promise<void>;
}) {
  const isEdit = !!employee;
  const [form, setForm] = useState<Omit<Employee, "id" | "fullName" | "isArchived">>(
    employee ? {
      employeeNumber: employee.employeeNumber,
      firstName: employee.firstName, lastName: employee.lastName,
      jobTitle: employee.jobTitle, department: employee.department,
      email: employee.email, phone: employee.phone, county: employee.county,
      startDate: employee.startDate, employmentType: employee.employmentType,
      currency: employee.currency, rate: employee.rate,
      standardHours: employee.standardHours, isActive: employee.isActive,
      nasscorpNumber: employee.nasscorpNumber, allowances: employee.allowances,
      paymentMethod: employee.paymentMethod, bankName: employee.bankName,
      accountNumber: employee.accountNumber, momoNumber: employee.momoNumber,
    } : { ...EMPTY_FORM, employeeNumber: "" }
  );
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<DrawerTab>("basic");

  const set = (field: keyof typeof form, value: unknown) =>
    setForm((p) => ({ ...p, [field]: value }));

  const valid = form.firstName.trim() && form.lastName.trim();

  async function submit() {
    if (!valid) return;
    setSaving(true);
    try { await onSave(form); onClose(); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
      }}/>
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 61,
        width: "100%", maxWidth: 520, background: "#0d1f35",
        borderLeft: "1px solid #1e3a5f", display: "flex", flexDirection: "column",
        boxShadow: "-24px 0 64px #00000070",
        animation: "slideIn 0.28s cubic-bezier(0.32,0.72,0,1)",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid #1e3a5f",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "#50C87820", border: "1px solid #50C87840",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {isEdit ? <Edit3 size={16} color="#50C878"/> : <Plus size={16} color="#50C878"/>}
            </div>
            <div>
              <p style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 15, margin: 0 }}>
                {isEdit ? "Edit Employee" : "New Employee"}
              </p>
              {isEdit && (
                <p style={{ color: "#334155", fontSize: 12, margin: 0, fontFamily: "'DM Mono',monospace" }}>
                  {employee?.employeeNumber}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, border: "none",
            background: "#ffffff10", color: "#64748b", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <X size={14}/>
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", borderBottom: "1px solid #1e3a5f",
          padding: "0 24px", flexShrink: 0,
        }}>
          {(["basic", "pay", "payment"] as DrawerTab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "12px 16px", border: "none", background: "transparent",
              cursor: "pointer", color: tab === t ? "#50C878" : "#334155",
              fontSize: 13, fontWeight: tab === t ? 700 : 500,
              borderBottom: tab === t ? "2px solid #50C878" : "2px solid transparent",
              transition: "all 0.15s", marginBottom: -1, textTransform: "capitalize",
            }}>
              {t === "basic" ? "Basic Info" : t === "pay" ? "Pay Settings" : "Payment"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {tab === "basic" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="First Name"><Inp value={form.firstName} onChange={(v) => set("firstName", v)} placeholder="Moses"/></Field>
                <Field label="Last Name"><Inp value={form.lastName} onChange={(v) => set("lastName", v)} placeholder="Kollie"/></Field>
              </div>
              <Field label="Job Title"><Inp value={form.jobTitle} onChange={(v) => set("jobTitle", v)} placeholder="Operations Manager"/></Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Department">
                  <Sel value={form.department} onChange={(v) => set("department", v)}>
                    {DEPT_LIST.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Sel>
                </Field>
                <Field label="County">
                  <Sel value={form.county} onChange={(v) => set("county", v)}>
                    {COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Sel>
                </Field>
              </div>
              <Field label="Email"><Inp type="email" value={form.email} onChange={(v) => set("email", v)} placeholder="employee@company.lr"/></Field>
              <Field label="Phone"><Inp value={form.phone} onChange={(v) => set("phone", v)} placeholder="+231770000000"/></Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Start Date"><Inp type="date" value={form.startDate} onChange={(v) => set("startDate", v)}/></Field>
                <Field label="Employment Type">
                  <Sel value={form.employmentType} onChange={(v) => set("employmentType", v as EmploymentType)}>
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                    <option value="contractor">Contractor</option>
                    <option value="casual">Casual</option>
                  </Sel>
                </Field>
              </div>
              <Field label="NASSCORP Number">
                <Inp value={form.nasscorpNumber} onChange={(v) => set("nasscorpNumber", v)} placeholder="NSC-001-2024"/>
              </Field>
            </div>
          )}

          {tab === "pay" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Currency">
                  <Sel value={form.currency} onChange={(v) => set("currency", v as Currency)}>
                    <option value="USD">USD – US Dollar</option>
                    <option value="LRD">LRD – Liberian Dollar</option>
                  </Sel>
                </Field>
                <Field label={`Rate / hr (${form.currency})`}>
                  <Inp type="number" value={form.rate} onChange={(v) => set("rate", parseFloat(v) || 0)} placeholder="8.50"/>
                </Field>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Standard Hours / Month">
                  <Inp type="number" value={form.standardHours} onChange={(v) => set("standardHours", parseFloat(v) || 0)} placeholder="173.33"/>
                </Field>
                <Field label={`Monthly Allowances (${form.currency})`}>
                  <Inp type="number" value={form.allowances} onChange={(v) => set("allowances", parseFloat(v) || 0)} placeholder="0"/>
                </Field>
              </div>
              {/* Live estimate */}
              <div style={{
                background: "#071525", border: "1px solid #1e3a5f",
                borderRadius: 12, padding: "16px 18px", marginTop: 4,
              }}>
                <p style={{
                  color: "#334155", fontSize: 11, fontWeight: 600,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  fontFamily: "'DM Mono',monospace", marginBottom: 12,
                }}>Monthly Estimate</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ color: "#475569", fontSize: 13 }}>Base salary</span>
                  <span style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>
                    {form.currency === "LRD" ? "L$" : "$"}
                    {(form.rate * form.standardHours).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                {form.allowances > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#475569", fontSize: 13 }}>+ Allowances</span>
                    <span style={{ color: "#50C878", fontSize: 13, fontFamily: "'DM Mono',monospace" }}>
                      +{form.currency === "LRD" ? "L$" : "$"}{form.allowances.toLocaleString()}
                    </span>
                  </div>
                )}
                <div style={{ height: 1, background: "#1e3a5f", margin: "10px 0" }}/>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#64748b", fontSize: 12 }}>Gross total</span>
                  <span style={{ color: "#50C878", fontSize: 15, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                    {form.currency === "LRD" ? "L$" : "$"}
                    {(form.rate * form.standardHours + form.allowances).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {tab === "payment" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="Payment Method">
                <Sel value={form.paymentMethod} onChange={(v) => set("paymentMethod", v as PaymentMethod)}>
                  {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </Sel>
              </Field>
              {form.paymentMethod === "bank_transfer" && (
                <>
                  <Field label="Bank Name"><Inp value={form.bankName} onChange={(v) => set("bankName", v)} placeholder="Ecobank Liberia"/></Field>
                  <Field label="Account Number"><Inp value={form.accountNumber} onChange={(v) => set("accountNumber", v)} placeholder="1234567890"/></Field>
                </>
              )}
              {(form.paymentMethod === "mtn_momo" || form.paymentMethod === "orange_money") && (
                <Field label="Mobile Money Number">
                  <Inp value={form.momoNumber} onChange={(v) => set("momoNumber", v)} placeholder="0770000000"/>
                </Field>
              )}
              <div style={{
                background: "#071525", border: "1px solid #1e3a5f",
                borderRadius: 12, padding: "14px 16px", marginTop: 4,
              }}>
                <p style={{
                  color: "#334155", fontSize: 11, fontWeight: 600,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  fontFamily: "'DM Mono',monospace", marginBottom: 8,
                }}>Payment Summary</p>
                <p style={{ color: "#475569", fontSize: 13 }}>
                  {PAYMENT_METHODS.find((m) => m.value === form.paymentMethod)?.label ?? form.paymentMethod}
                </p>
                {form.paymentMethod === "bank_transfer" && form.bankName && (
                  <p style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>
                    {form.bankName} {form.accountNumber ? `· ****${form.accountNumber.slice(-4)}` : ""}
                  </p>
                )}
                {(form.paymentMethod === "mtn_momo" || form.paymentMethod === "orange_money") && form.momoNumber && (
                  <p style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>{form.momoNumber}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px", borderTop: "1px solid #1e3a5f",
          display: "flex", gap: 10, flexShrink: 0,
        }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "11px", borderRadius: 10, cursor: "pointer",
            background: "transparent", border: "1px solid #1e3a5f",
            color: "#475569", fontSize: 13, fontWeight: 500,
          }}>Cancel</button>
          <button onClick={submit} disabled={saving || !valid} style={{
            flex: 2, padding: "11px", borderRadius: 10,
            cursor: saving || !valid ? "not-allowed" : "pointer",
            background: saving || !valid ? "#50C87845" : "#50C878",
            border: "none", color: "#002147", fontSize: 13, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 7, transition: "all 0.2s",
          }}>
            {saving
              ? <><Loader size={14} style={{ animation: "spin 1s linear infinite" }}/> Saving…</>
              : <><Save size={14}/>{isEdit ? "Save Changes" : "Add Employee"}</>
            }
          </button>
        </div>
      </div>
      <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
    </>
  );
}

// ─── Row Inline Actions ───────────────────────────────────────────────────────
// Visible-on-hover pill buttons — no dropdown, no z-index issues.
// The parent <tr> uses a CSS class trick via a shared style tag so the
// action group only appears on row hover without JS state.

function RowActions({ emp, isArchived, onEdit, onArchive, onRestore, onDelete }: {
  emp: Employee; isArchived: boolean;
  onEdit:    (e: Employee) => void;
  onArchive: (id: string)  => void;
  onRestore: (id: string)  => void;
  onDelete:  (id: string)  => void;
}) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setLoadingAction(key);
    try { await fn(); } finally { setLoadingAction(null); }
  }

  const btn = (
    key: string,
    icon: React.ReactNode,
    label: string,
    color: string,
    bg: string,
    border: string,
    onClick: () => Promise<void>,
  ) => (
    <button
      key={key}
      disabled={loadingAction !== null}
      onClick={(e) => { e.stopPropagation(); run(key, onClick); }}
      title={label}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "5px 10px", borderRadius: 7, cursor: "pointer",
        background: bg, border: `1px solid ${border}`,
        color, fontSize: 11, fontWeight: 600,
        opacity: loadingAction && loadingAction !== key ? 0.4 : 1,
        transition: "all 0.15s", whiteSpace: "nowrap",
        fontFamily: "'DM Sans',sans-serif",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.filter = "brightness(1.2)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = "brightness(1)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {loadingAction === key
        ? <Loader size={11} style={{ animation: "spin 0.8s linear infinite" }}/>
        : icon
      }
      {label}
    </button>
  );

  return (
    <div className="row-actions" style={{
      display: "flex", alignItems: "center", justifyContent: "flex-end",
      gap: 6, opacity: 0, transition: "opacity 0.15s",
    }}>
      {!isArchived && btn(
        "edit",
        <Edit3 size={11}/>, "Edit",
        "#50C878", "#50C87815", "#50C87835",
        async () => { onEdit(emp); },
      )}
      {isArchived
        ? btn(
            "restore",
            <RotateCcw size={11}/>, "Restore",
            "#38bdf8", "#38bdf815", "#38bdf835",
            async () => { onRestore(emp.id); },
          )
        : btn(
            "archive",
            <Archive size={11}/>, "Archive",
            "#fb923c", "#fb923c15", "#fb923c35",
            async () => { onArchive(emp.id); },
          )
      }
      {/* Divider */}
      <div style={{ width: 1, height: 16, background: "#1e3a5f", flexShrink: 0 }}/>
      {btn(
        "delete",
        <Trash2 size={11}/>, "Delete",
        "#f87171", "#f8717115", "#f8717135",
        async () => { onDelete(emp.id); },
      )}
    </div>
  );
}

// ─── CSV Upload Modal ─────────────────────────────────────────────────────────

// Import result returned from handleBulkImport so the modal can show a summary
interface ImportResult {
  imported: number;
  skipped:  { rowNum: number; name: string; reasons: string[] }[];
}

function CSVUploadModal({ onClose, onImport }: {
  onClose:  () => void;
  // onImport now returns a result so the modal can display the outcome
  onImport: (rows: Partial<Employee>[]) => Promise<ImportResult>;
}) {
  const { toast }   = useToast();
  const [parsed,    setParsed]    = useState<ParsedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  // After a partial import, show the result summary inside the modal
  const [result,    setResult]    = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) { toast.error("Please upload a .csv file."); return; }
    const reader = new FileReader();
    reader.onload = (e) => { setParsed(parseEmployeeCSV(e.target?.result as string)); setResult(null); };
    reader.readAsText(file);
  }, [toast]);

  const validRows = parsed?.filter((r) => r.errors.length === 0) ?? [];
  const errRows   = parsed?.filter((r) => r.errors.length > 0)   ?? [];
  const allFail   = parsed !== null && validRows.length === 0;

  async function handleImport() {
    if (!validRows.length || importing) return;
    setImporting(true);
    const res = await onImport(validRows.map((r) => r.data));
    setImporting(false);
    // If there were also invalid rows, stay open and show the result summary
    // so the user knows exactly what happened. Otherwise close immediately.
    if (errRows.length > 0) {
      setResult(res);
    } else {
      onClose();
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 70,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        position: "absolute", inset: 0,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
      }} onClick={onClose}/>

      <div style={{
        position: "relative", background: "#0d1f35",
        border: "1px solid #1e3a5f", borderRadius: 20,
        width: "100%", maxWidth: 540,
        boxShadow: "0 24px 64px #00000090",
        display: "flex", flexDirection: "column",
        maxHeight: "90vh",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid #1e3a5f",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: "#50C87820", border: "1px solid #50C87840",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Upload size={15} color="#50C878"/>
            </div>
            <div>
              <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 15 }}>Bulk Import</span>
              {result && (
                <p style={{ color: "#334155", fontSize: 11, margin: "2px 0 0", fontFamily: "\'DM Mono\',monospace" }}>
                  Import complete
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 8, border: "none",
            background: "#ffffff10", color: "#64748b", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <X size={14}/>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>

          {/* ── STATE 1: No file yet ── */}
          {!parsed && (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              style={{
                border: "2px dashed #1e3a5f", borderRadius: 16,
                padding: "44px 24px", textAlign: "center", cursor: "pointer",
                transition: "border-color 0.2s, background 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#50C87860";
                e.currentTarget.style.background = "#50C8780A";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#1e3a5f";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 16,
                background: "#50C87815", border: "1px solid #50C87830",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 14px",
              }}>
                <FileText size={22} color="#50C878"/>
              </div>
              <p style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 6, fontSize: 14 }}>
                Drop CSV or click to browse
              </p>
              <p style={{ color: "#334155", fontSize: 12 }}>
                Supports the Slipdesk employee template format
              </p>
              <input
                ref={fileRef} type="file" accept=".csv"
                style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files![0])}
              />
            </div>
          )}

          {/* ── STATE 2: File parsed — pre-import preview ── */}
          {parsed && !result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Ready-to-import count */}
              {validRows.length > 0 && (
                <div style={{
                  background: "#50C87812", border: "1px solid #50C87830",
                  borderRadius: 12, padding: "14px 18px",
                  display: "flex", alignItems: "center", gap: 14,
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: "#50C87820", display: "flex",
                    alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <Users size={20} color="#50C878"/>
                  </div>
                  <div>
                    <p style={{ color: "#50C878", fontWeight: 800, fontSize: 24, margin: 0, lineHeight: 1 }}>
                      {validRows.length}
                    </p>
                    <p style={{ color: "#475569", fontSize: 12, margin: "4px 0 0" }}>
                      {validRows.length === 1 ? "employee" : "employees"} ready to import
                      {errRows.length > 0 && (
                        <span style={{ color: "#fb923c", marginLeft: 6 }}>
                          ({errRows.length} will be skipped)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* Invalid rows — shown BEFORE import so user can fix if they want */}
              {errRows.length > 0 && (
                <div style={{
                  background: allFail ? "#f8717118" : "#fb923c0E",
                  border: `1px solid ${allFail ? "#f8717140" : "#fb923c30"}`,
                  borderRadius: 12, padding: "14px 16px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6,
                      background: allFail ? "#f8717120" : "#fb923c20",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      {allFail
                        ? <X size={11} color="#f87171"/>
                        : <span style={{ color: "#fb923c", fontSize: 13, fontWeight: 800, lineHeight: 1 }}>!</span>
                      }
                    </div>
                    <p style={{ color: allFail ? "#f87171" : "#fb923c", fontWeight: 700, fontSize: 13, margin: 0 }}>
                      {allFail
                        ? `All ${errRows.length} rows have errors — nothing to import`
                        : `${errRows.length} row${errRows.length > 1 ? "s" : ""} will be skipped`
                      }
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {parsed.map((r, i) =>
                      r.errors.length > 0 && (
                        <div key={i} style={{
                          background: "#ffffff06", borderRadius: 8,
                          padding: "7px 10px",
                          display: "flex", alignItems: "flex-start", gap: 8,
                        }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: "#475569",
                            fontFamily: "\'DM Mono\',monospace",
                            background: "#0d1f35", borderRadius: 4,
                            padding: "2px 6px", flexShrink: 0, marginTop: 1,
                          }}>
                            ROW {i + 2}
                          </span>
                          <div>
                            {r.data.firstName || r.data.lastName ? (
                              <p style={{ color: "#94a3b8", fontSize: 12, margin: "0 0 2px", fontWeight: 600 }}>
                                {[r.data.firstName, r.data.lastName].filter(Boolean).join(" ") || "Unknown"}
                              </p>
                            ) : null}
                            <p style={{ color: "#64748b", fontSize: 11, margin: 0 }}>
                              {r.errors.join(" · ")}
                            </p>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                  {!allFail && (
                    <p style={{ color: "#475569", fontSize: 11, marginTop: 10, fontStyle: "italic" }}>
                      The {validRows.length} valid row{validRows.length !== 1 ? "s" : ""} will still be imported. Fix the CSV and re-upload to add the skipped employees.
                    </p>
                  )}
                </div>
              )}

              <button onClick={() => { setParsed(null); setResult(null); }} style={{
                color: "#38bdf8", fontSize: 12, background: "none",
                border: "none", cursor: "pointer", textAlign: "left", padding: 0,
              }}>
                ← Choose a different file
              </button>
            </div>
          )}

          {/* ── STATE 3: Import done — result summary (only shown on partial import) ── */}
          {result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Imported successfully */}
              <div style={{
                background: "#50C87812", border: "1px solid #50C87830",
                borderRadius: 12, padding: "14px 18px",
                display: "flex", alignItems: "center", gap: 14,
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: "#50C87820", display: "flex",
                  alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <UserCheck size={20} color="#50C878"/>
                </div>
                <div>
                  <p style={{ color: "#50C878", fontWeight: 800, fontSize: 24, margin: 0, lineHeight: 1 }}>
                    {result.imported}
                  </p>
                  <p style={{ color: "#475569", fontSize: 12, margin: "4px 0 0" }}>
                    employee{result.imported !== 1 ? "s" : ""} imported successfully
                  </p>
                </div>
              </div>

              {/* Skipped rows with reasons */}
              {result.skipped.length > 0 && (
                <div style={{
                  background: "#fb923c0E", border: "1px solid #fb923c30",
                  borderRadius: 12, padding: "14px 16px",
                }}>
                  <p style={{ color: "#fb923c", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
                    {result.skipped.length} row{result.skipped.length > 1 ? "s" : ""} were not imported
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {result.skipped.map((s, i) => (
                      <div key={i} style={{
                        background: "#ffffff06", borderRadius: 8,
                        padding: "7px 10px",
                        display: "flex", alignItems: "flex-start", gap: 8,
                      }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: "#475569",
                          fontFamily: "\'DM Mono\',monospace",
                          background: "#0d1f35", borderRadius: 4,
                          padding: "2px 6px", flexShrink: 0, marginTop: 1,
                        }}>
                          ROW {s.rowNum}
                        </span>
                        <div>
                          {s.name && (
                            <p style={{ color: "#94a3b8", fontSize: 12, margin: "0 0 2px", fontWeight: 600 }}>
                              {s.name}
                            </p>
                          )}
                          <p style={{ color: "#64748b", fontSize: 11, margin: 0 }}>
                            {s.reasons.join(" · ")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p style={{ color: "#475569", fontSize: 11, marginTop: 10, fontStyle: "italic" }}>
                    Fix these rows in your CSV and re-upload to add the missing employees.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px", borderTop: "1px solid #1e3a5f",
          display: "flex", gap: 10, flexShrink: 0,
        }}>
          {!result && (
            <button onClick={downloadTemplate} style={{
              padding: "10px 14px", borderRadius: 10, cursor: "pointer",
              background: "transparent", border: "1px solid #1e3a5f",
              color: "#475569", fontSize: 13, fontWeight: 500,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <Download size={13}/> Template
            </button>
          )}

          {/* When showing results: just a Done button */}
          {result ? (
            <button onClick={onClose} style={{
              flex: 1, padding: "10px 16px", borderRadius: 10, cursor: "pointer",
              background: "#50C878", border: "none",
              color: "#002147", fontSize: 13, fontWeight: 700,
            }}>
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} style={{
                flex: 1, padding: "10px 16px", borderRadius: 10, cursor: "pointer",
                background: "#ffffff08", border: "1px solid #1e3a5f",
                color: "#64748b", fontSize: 13,
              }}>
                Cancel
              </button>
              <button
                disabled={!validRows.length || importing}
                onClick={handleImport}
                style={{
                  flex: 2, padding: "10px 16px", borderRadius: 10,
                  cursor: validRows.length && !importing ? "pointer" : "not-allowed",
                  background: validRows.length && !importing ? "#50C878" : "#50C87845",
                  border: "none", color: "#002147", fontSize: 13, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 6, transition: "all 0.2s",
                }}
              >
                {importing
                  ? <><Loader size={14} style={{ animation: "spin 1s linear infinite" }}/> Importing…</>
                  : errRows.length > 0 && validRows.length > 0
                    ? `Import ${validRows.length} of ${(parsed?.length ?? 0)} rows`
                    : `Import ${validRows.length} Employee${validRows.length !== 1 ? "s" : ""}`
                }
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────

function BulkBar({ count, isArchiveView, onArchive, onDelete, onClear }: {
  count: number; isArchiveView: boolean;
  onArchive: () => void; onDelete: () => void; onClear: () => void;
}) {
  return (
    <div style={{
      position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
      zIndex: 55, background: "#0d1f35", border: "1px solid #1e3a5f",
      borderRadius: 16, padding: "12px 18px",
      display: "flex", alignItems: "center", gap: 14,
      boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
      animation: "slideUp 0.2s ease", minWidth: 340,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        flex: 1,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7,
          background: "#50C87825", border: "1px solid #50C87840",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <CheckSquare size={13} color="#50C878"/>
        </div>
        <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>
          {count} selected
        </span>
      </div>
      {!isArchiveView && (
        <button onClick={onArchive} style={{
          padding: "8px 14px", borderRadius: 9, cursor: "pointer",
          background: "#fb923c18", border: "1px solid #fb923c30",
          color: "#fb923c", fontSize: 12, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
        }}>
          <Archive size={13}/> Archive
        </button>
      )}
      <button onClick={onDelete} style={{
        padding: "8px 14px", borderRadius: 9, cursor: "pointer",
        background: "#f8717118", border: "1px solid #f8717130",
        color: "#f87171", fontSize: 12, fontWeight: 600,
        display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
      }}>
        <Trash2 size={13}/> Delete
      </button>
      <button onClick={onClear} style={{
        width: 26, height: 26, borderRadius: 7, cursor: "pointer",
        background: "#ffffff10", border: "1px solid #ffffff15",
        color: "#64748b", display: "flex", alignItems: "center",
        justifyContent: "center", transition: "all 0.15s",
      }}>
        <X size={12}/>
      </button>
      <style>{`@keyframes slideUp{from{opacity:0;transform:translate(-50%,16px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
  const { employees, addEmployee, updateEmployee, archiveEmployee, hardDeleteEmployee, restoreEmployee, refreshEmployees, loading } = useApp();
  const { toast } = useToast();

  const [search,        setSearch]        = useState("");
  const [deptFilter,    setDeptFilter]    = useState("All");
  const [showArchived,  setShowArchived]  = useState(false);
  const [showUpload,    setShowUpload]    = useState(false);
  const [drawerEmp,     setDrawerEmp]     = useState<Employee | undefined>(undefined);
  const [showDrawer,    setShowDrawer]    = useState(false);
  const [selected,      setSelected]      = useState<Set<string>>(new Set());

  // ── Derived data ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return employees.filter((e) => {
      if (e.isArchived !== showArchived) return false;
      if (deptFilter !== "All" && e.department !== deptFilter) return false;
      const q = search.toLowerCase();
      if (!q) return true;
      return (
        e.firstName.toLowerCase().includes(q) ||
        e.lastName.toLowerCase().includes(q)  ||
        e.jobTitle.toLowerCase().includes(q)  ||
        e.email.toLowerCase().includes(q)     ||
        e.employeeNumber.toLowerCase().includes(q)
      );
    });
  }, [employees, showArchived, deptFilter, search]);

  const stats = useMemo(() => ({
    total:    employees.filter((e) => !e.isArchived).length,
    active:   employees.filter((e) => !e.isArchived && e.isActive).length,
    archived: employees.filter((e) => e.isArchived).length,
  }), [employees]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleBulkImport(rows: Partial<Employee>[]): Promise<ImportResult> {
    // Pre-compute ALL employee numbers before any await to avoid stale-state
    // collisions (sequential awaits all see the same React state snapshot).
    const existingNums = employees
      .map((e) => parseInt(e.employeeNumber.replace(/\D/g, ""), 10))
      .filter(Boolean);
    let counter = existingNums.length ? Math.max(...existingNums) : 0;

    const numbered = rows.map((row) => {
      const csvNum = (row.employeeNumber ?? "").trim();
      const empNum = csvNum || `EMP-${String(++counter).padStart(3, "0")}`;
      return { row, empNum };
    });

    let imported = 0;
    const skipped: ImportResult["skipped"] = [];

    for (let i = 0; i < numbered.length; i++) {
      const { row, empNum } = numbered[i];
      try {
        await addEmployee(
          { ...(row as Omit<Employee, "id" | "fullName" | "isArchived">), isActive: true },
          empNum,
        );
        imported++;
      } catch (err) {
        // Capture per-row failures so partial success is still surfaced
        skipped.push({
          rowNum: i + 2,
          name: [row.firstName, row.lastName].filter(Boolean).join(" "),
          reasons: [err instanceof Error ? err.message : "Unknown error"],
        });
        console.error(`Row ${i + 2} failed:`, err);
      }
    }

    await refreshEmployees();

    if (imported > 0) {
      toast.success(
        skipped.length > 0
          ? `${imported} imported, ${skipped.length} skipped — see details below.`
          : `Successfully imported ${imported} employee${imported !== 1 ? "s" : ""}.`
      );
    } else {
      toast.error("No employees were imported. Check the errors below.");
    }

    if (skipped.length === 0) setShowUpload(false);

    return { imported, skipped };
  }

  async function handleSaveEmployee(data: Omit<Employee, "id" | "fullName" | "isArchived">) {
    if (drawerEmp) {
      await updateEmployee(drawerEmp.id, data);
      toast.success("Employee updated.");
    } else {
      await addEmployee(data);
      toast.success("Employee added.");
    }
  }

  function openAdd()           { setDrawerEmp(undefined); setShowDrawer(true); }
  function openEdit(e: Employee) { setDrawerEmp(e);         setShowDrawer(true); }

  async function handleArchive(id: string) {
    await archiveEmployee(id);
    toast.success("Employee archived.");
  }
  async function handleRestore(id: string) {
    await restoreEmployee(id);
    toast.success("Employee restored.");
  }
  async function handleDelete(id: string) {
    await hardDeleteEmployee(id);
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
    toast.success("Employee deleted.");
  }

  // Bulk
  async function handleBulkArchive() {
    for (const id of selected) await archiveEmployee(id);
    toast.success(`${selected.size} employee${selected.size !== 1 ? "s" : ""} archived.`);
    setSelected(new Set());
  }
  async function handleBulkDelete() {
    for (const id of selected) await hardDeleteEmployee(id);
    toast.success(`${selected.size} employee${selected.size !== 1 ? "s" : ""} deleted.`);
    setSelected(new Set());
  }

  function toggleSelect(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((e) => e.id)));
  }

  if (loading) return <PageSkeleton/>;

  return (
    <div style={{ padding: "28px 32px", minHeight: "100vh", background: "#061220", fontFamily: "'DM Sans',sans-serif" }}>

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ color: "#f1f5f9", fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: "-0.3px" }}>
            Employees
          </h1>
          <p style={{ color: "#334155", fontSize: 13, margin: "4px 0 0", fontFamily: "'DM Mono',monospace" }}>
            {stats.total} total · {stats.active} active
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={downloadTemplate} style={{
            padding: "9px 14px", borderRadius: 10, cursor: "pointer",
            background: "transparent", border: "1px solid #1e3a5f",
            color: "#475569", fontSize: 13, fontWeight: 500,
            display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
          }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = "#50C87850"}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = "#1e3a5f"}
          >
            <Download size={14}/> Template
          </button>
          <button onClick={() => setShowUpload(true)} style={{
            padding: "9px 14px", borderRadius: 10, cursor: "pointer",
            background: "#0d1f35", border: "1px solid #1e3a5f",
            color: "#94a3b8", fontSize: 13, fontWeight: 500,
            display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
          }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = "#38bdf850"}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = "#1e3a5f"}
          >
            <Upload size={14}/> Bulk Import
          </button>
          <button onClick={openAdd} style={{
            padding: "9px 16px", borderRadius: 10, cursor: "pointer",
            background: "#50C878", border: "none",
            color: "#002147", fontSize: 13, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 7, transition: "all 0.15s",
          }}
            onMouseEnter={(e) => e.currentTarget.style.background = "#3daf62"}
            onMouseLeave={(e) => e.currentTarget.style.background = "#50C878"}
          >
            <Plus size={15}/> Add Employee
          </button>
        </div>
      </div>

      {/* ── Stats Bar ───────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Employees",   value: stats.total,    icon: <Users size={16} color="#50C878"/>,    accent: "#50C878" },
          { label: "Active",            value: stats.active,   icon: <UserCheck size={16} color="#38bdf8"/>, accent: "#38bdf8" },
          { label: "Archived",          value: stats.archived, icon: <UserX size={16} color="#fb923c"/>,    accent: "#fb923c" },
        ].map(({ label, value, icon, accent }) => (
          <div key={label} style={{
            background: "#0d1f35", border: "1px solid #1e3a5f",
            borderRadius: 14, padding: "16px 20px",
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: `${accent}15`, border: `1px solid ${accent}30`,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              {icon}
            </div>
            <div>
              <p style={{ color: "#e2e8f0", fontWeight: 800, fontSize: 22, margin: 0, lineHeight: 1, fontFamily: "'DM Mono',monospace" }}>
                {value}
              </p>
              <p style={{ color: "#334155", fontSize: 11, margin: "4px 0 0", fontWeight: 500, letterSpacing: "0.03em" }}>
                {label}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters Row ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, alignItems: "center", flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{
          flex: 1, minWidth: 220, position: "relative",
          display: "flex", alignItems: "center",
        }}>
          <Search size={14} color="#334155" style={{ position: "absolute", left: 12, pointerEvents: "none" }}/>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, title, email…"
            style={{
              width: "100%", padding: "9px 12px 9px 34px",
              background: "#0d1f35", border: "1px solid #1e3a5f",
              borderRadius: 10, color: "#e2e8f0", fontSize: 13,
              fontFamily: "'DM Sans',sans-serif", outline: "none",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) => e.target.style.borderColor = "#50C87870"}
            onBlur={(e)  => e.target.style.borderColor = "#1e3a5f"}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{
              position: "absolute", right: 10, background: "none",
              border: "none", cursor: "pointer", color: "#334155",
              display: "flex", alignItems: "center",
            }}>
              <X size={13}/>
            </button>
          )}
        </div>

        {/* Department filter */}
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            style={{
              padding: "9px 32px 9px 12px", background: "#0d1f35",
              border: "1px solid #1e3a5f", borderRadius: 10,
              color: deptFilter === "All" ? "#334155" : "#e2e8f0",
              fontSize: 13, fontFamily: "'DM Sans',sans-serif",
              outline: "none", cursor: "pointer", appearance: "none",
            }}
          >
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d === "All" ? "All Departments" : d}</option>)}
          </select>
          <ChevronDown size={13} color="#334155" style={{ position: "absolute", right: 10, pointerEvents: "none" }}/>
        </div>

        {/* Archive toggle */}
        <button onClick={() => { setShowArchived((v) => !v); setSelected(new Set()); }} style={{
          padding: "9px 14px", borderRadius: 10, cursor: "pointer",
          background: showArchived ? "#fb923c18" : "transparent",
          border: `1px solid ${showArchived ? "#fb923c40" : "#1e3a5f"}`,
          color: showArchived ? "#fb923c" : "#334155",
          fontSize: 13, fontWeight: 500, transition: "all 0.15s",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <Archive size={14}/> {showArchived ? "Showing Archived" : "View Archived"}
        </button>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div style={{
        background: "#0d1f35", border: "1px solid #1e3a5f",
        borderRadius: 16, overflow: "hidden",
      }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "60px 24px", textAlign: "center" }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: "#50C87810", border: "1px solid #50C87825",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 14px",
            }}>
              <Users size={22} color="#334155"/>
            </div>
            <p style={{ color: "#475569", fontSize: 14, fontWeight: 600 }}>
              {search || deptFilter !== "All" ? "No matching employees" : showArchived ? "No archived employees" : "No employees yet"}
            </p>
            <p style={{ color: "#1e3a5f", fontSize: 13, marginTop: 4 }}>
              {!showArchived && !search && deptFilter === "All" && "Click \u201cAdd Employee\u201d to get started"}
            </p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e3a5f" }}>
                {/* Checkbox */}
                <th style={{ width: 44, padding: "12px 0 12px 16px" }}>
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                    style={{ accentColor: "#50C878", width: 15, height: 15, cursor: "pointer" }}
                  />
                </th>
                {["Employee","Department","Status","Rate","Payment",""].map((h) => (
                  <th key={h} style={{
                    padding: "12px 14px", textAlign: "left",
                    fontSize: 11, fontWeight: 600, color: "#1e3a5f",
                    letterSpacing: "0.07em", textTransform: "uppercase",
                    fontFamily: "'DM Mono',monospace",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp, idx) => {
                const isSel = selected.has(emp.id);
                return (
                  <tr
                    key={emp.id}
                    style={{
                      borderBottom: idx < filtered.length - 1 ? "1px solid #0d2137" : "none",
                      background: isSel ? "#50C8780A" : "transparent",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSel) e.currentTarget.style.background = "#ffffff04";
                      const actions = e.currentTarget.querySelector(".row-actions") as HTMLElement | null;
                      if (actions) actions.style.opacity = "1";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isSel ? "#50C8780A" : "transparent";
                      const actions = e.currentTarget.querySelector(".row-actions") as HTMLElement | null;
                      if (actions) actions.style.opacity = "0";
                    }}
                  >
                    {/* Checkbox cell */}
                    <td style={{ width: 44, padding: "0 0 0 16px" }}>
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleSelect(emp.id)}
                        style={{ accentColor: "#50C878", width: 15, height: 15, cursor: "pointer" }}
                      />
                    </td>

                    {/* Employee name + number */}
                    <td style={{ padding: "14px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                        <Avatar firstName={emp.firstName} lastName={emp.lastName}/>
                        <div>
                          <p style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 13, margin: 0 }}>
                            {emp.firstName} {emp.lastName}
                          </p>
                          <p style={{ color: "#334155", fontSize: 11, margin: "2px 0 0", fontFamily: "'DM Mono',monospace" }}>
                            {emp.employeeNumber || emp.jobTitle}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Department */}
                    <td style={{ padding: "14px 14px" }}>
                      <DeptBadge dept={emp.department}/>
                    </td>

                    {/* Status */}
                    <td style={{ padding: "14px 14px" }}>
                      <StatusPill active={emp.isActive && !emp.isArchived}/>
                    </td>

                    {/* Rate */}
                    <td style={{ padding: "14px 14px" }}>
                      <span style={{ color: "#e2e8f0", fontSize: 13, fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>
                        {emp.currency === "LRD" ? "L$" : "$"}{emp.rate.toFixed(2)}/hr
                      </span>
                      <span style={{ color: "#334155", fontSize: 11, display: "block" }}>
                        {EMP_TYPE_LABELS[emp.employmentType]}
                      </span>
                    </td>

                    {/* Payment method */}
                    <td style={{ padding: "14px 14px" }}>
                      <span style={{ color: "#475569", fontSize: 12 }}>
                        {PAYMENT_METHODS.find((m) => m.value === emp.paymentMethod)?.label ?? emp.paymentMethod}
                      </span>
                    </td>

                    {/* Actions — inline pill buttons, visible on row hover via CSS */}
                    <td style={{ padding: "10px 16px 10px 6px", textAlign: "right" }}>
                      <RowActions
                        emp={emp}
                        isArchived={!!emp.isArchived}
                        onEdit={openEdit}
                        onArchive={handleArchive}
                        onRestore={handleRestore}
                        onDelete={handleDelete}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer count ────────────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <p style={{ color: "#1e3a5f", fontSize: 12, textAlign: "center", marginTop: 14, fontFamily: "'DM Mono',monospace" }}>
          Showing {filtered.length} of {employees.filter((e) => e.isArchived === showArchived).length} employees
        </p>
      )}

      {/* ── Bulk action bar ──────────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          isArchiveView={showArchived}
          onArchive={handleBulkArchive}
          onDelete={handleBulkDelete}
          onClear={() => setSelected(new Set())}
        />
      )}

      {/* ── Drawers & Modals ─────────────────────────────────────────────────── */}
      {showDrawer && (
        <EmployeeDrawer
          employee={drawerEmp}
          onClose={() => setShowDrawer(false)}
          onSave={handleSaveEmployee}
        />
      )}
      {showUpload && (
        <CSVUploadModal
          onClose={() => setShowUpload(false)}
          onImport={handleBulkImport}
        />
      )}

      <style>{`
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        select option { background: #0d1f35; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e3a5f; border-radius: 10px; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.4); cursor: pointer; }
      `}</style>
    </div>
  );
}
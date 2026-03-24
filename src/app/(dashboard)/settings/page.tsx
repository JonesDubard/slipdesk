"use client";

/**
 * Slipdesk — Settings Page
 * Place at: src/app/(dashboard)/settings/page.tsx
 */

import { useState, useEffect } from "react";
import { Save, AlertTriangle, CheckCircle2, Building2, RotateCcw, Lock, Eye, EyeOff, Loader } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp, type CompanyProfile, EMPTY_COMPANY } from "@/context/AppContext";
import LogoUploader from "@/components/LogoUploader";

export default function SettingsPage() {
  const { company, setCompany } = useApp();

  // company is always CompanyProfile (never null) — EMPTY_COMPANY is the default
  const [form,   setForm]   = useState<CompanyProfile>({ ...company });
  const [saved,  setSaved]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty,  setDirty]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);


  // Password change state
const supabase = createClient();
const [newPassword,     setNewPassword]     = useState("");
const [confirmPassword, setConfirmPassword] = useState("");
const [showNewPw,       setShowNewPw]       = useState(false);
const [showConfirmPw,   setShowConfirmPw]   = useState(false);
const [pwSaving,        setPwSaving]        = useState(false);
const [pwSaved,         setPwSaved]         = useState(false);
const [pwError,         setPwError]         = useState<string | null>(null);

const PW_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter",  test: (p: string) => /[A-Z]/.test(p) },
  { label: "One number",            test: (p: string) => /[0-9]/.test(p) },
];

async function handlePasswordChange() {
  if (newPassword !== confirmPassword) { setPwError("Passwords don't match."); return; }
  setPwSaving(true);
  setPwError(null);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  setPwSaving(false);
  if (error) { setPwError(error.message); }
  else { setPwSaved(true); setNewPassword(""); setConfirmPassword(""); }
}

  // Re-sync when real data loads from Supabase (id changes from "" to a UUID)
  useEffect(() => {
    if (company.id) setForm({ ...company });
  }, [company.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function update(field: keyof CompanyProfile, value: string | null) {
    setForm((f) => ({ ...f, [field]: value }));
    setDirty(true);
    setSaved(false);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Company name is required."); return; }
    setError(null);
    setSaving(true);
    try {
      await setCompany(form);
      setSaved(true);
      setDirty(false);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setForm({ ...EMPTY_COMPANY, id: company.id });
    setDirty(true);
    setSaved(false);
  }

  const inputClass =
    "w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 " +
    "placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#50C878] " +
    "focus:border-transparent transition-all";

  const labelClass = "block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5";

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
          <p className="text-slate-400 text-sm mt-0.5">Company profile &amp; branding</p>
        </div>
        <button onClick={handleSave} disabled={saving || !dirty}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
                     bg-[#50C878] text-[#002147] hover:bg-[#3aa85f]
                     disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <Save className="w-4 h-4"/>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {saved && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0"/>
          <p className="text-sm text-emerald-700">Changes saved successfully.</p>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0"/>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Logo */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-400"/> Company Logo
        </h2>
        <p className="text-xs text-slate-400">
          Appears on all payslips and PDFs. PNG, JPG, SVG or WebP · max 2 MB.
        </p>
        <LogoUploader
          currentLogoUrl={form.logoUrl}
          onUploadComplete={(url) => update("logoUrl", url)}
        />
      </div>

      {/* Company details */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-semibold text-slate-800">Company Details</h2>

        <div>
          <label className={labelClass}>Company Name <span className="text-red-400">*</span></label>
          <input value={form.name} onChange={(e) => update("name", e.target.value)}
            placeholder="Acme Corp Ltd." className={inputClass}/>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>LRA Tax ID (TIN)</label>
            <input value={form.tin} onChange={(e) => update("tin", e.target.value)}
              placeholder="LR-TIN-XXXXXXX" className={inputClass}/>
          </div>
          <div>
            <label className={labelClass}>NASSCORP Reg. No.</label>
            <input value={form.nasscorpRegNo} onChange={(e) => update("nasscorpRegNo", e.target.value)}
              placeholder="NASC-XXXXXXX" className={inputClass}/>
          </div>
        </div>

        <div>
          <label className={labelClass}>Business Address</label>
          <input value={form.address} onChange={(e) => update("address", e.target.value)}
            placeholder="Broad Street, Monrovia, Liberia" className={inputClass}/>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Phone</label>
            <input value={form.phone} onChange={(e) => update("phone", e.target.value)}
              placeholder="+231 770 000 000" className={inputClass}/>
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)}
              placeholder="hr@company.lr" className={inputClass}/>
          </div>
        </div>
      </div>

      {dirty && (
        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold
                       bg-[#50C878] text-[#002147] hover:bg-[#3aa85f]
                       disabled:opacity-40 transition-colors shadow-sm">
            <Save className="w-4 h-4"/>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      )}

      {/* Change Password */}
<div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
  <h2 className="font-semibold text-slate-800 flex items-center gap-2">
    <Lock className="w-4 h-4 text-slate-400"/> Change Password
  </h2>

  {pwSaved && (
    <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0"/>
      <p className="text-sm text-emerald-700">Password updated successfully.</p>
    </div>
  )}
  {pwError && (
    <div className="flex items-center gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0"/>
      <p className="text-sm text-red-600">{pwError}</p>
    </div>
  )}

  <div>
    <label className={labelClass}>New Password</label>
    <div className="relative">
      <input
        type={showNewPw ? "text" : "password"}
        value={newPassword}
        onChange={(e) => { setNewPassword(e.target.value); setPwError(null); setPwSaved(false); }}
        placeholder="Min. 8 characters"
        className={inputClass}/>
      <button type="button" tabIndex={-1}
        onClick={() => setShowNewPw(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
        {showNewPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
      </button>
    </div>
    {newPassword.length > 0 && (
      <ul className="mt-2 space-y-1">
        {PW_RULES.map((r) => (
          <li key={r.label} className={`flex items-center gap-1.5 text-xs transition-colors
            ${r.test(newPassword) ? "text-emerald-600" : "text-slate-400"}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0
              ${r.test(newPassword) ? "bg-emerald-400" : "bg-slate-300"}`}/>
            {r.label}
          </li>
        ))}
      </ul>
    )}
  </div>

  <div>
    <label className={labelClass}>Confirm New Password</label>
    <div className="relative">
      <input
        type={showConfirmPw ? "text" : "password"}
        value={confirmPassword}
        onChange={(e) => { setConfirmPassword(e.target.value); setPwError(null); }}
        placeholder="Repeat your new password"
        className={`${inputClass} ${
          confirmPassword.length > 0
            ? newPassword === confirmPassword ? "border-emerald-300" : "border-red-300"
            : ""
        }`}/>
      <button type="button" tabIndex={-1}
        onClick={() => setShowConfirmPw(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
        {showConfirmPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
      </button>
    </div>
    {confirmPassword.length > 0 && newPassword !== confirmPassword && (
      <p className="text-xs text-red-500 mt-1">Passwords don't match.</p>
    )}
  </div>

  <button
    onClick={handlePasswordChange}
    disabled={pwSaving || newPassword.length < 8 || newPassword !== confirmPassword}
    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold
               bg-[#50C878] text-[#002147] hover:bg-[#3aa85f]
               disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
    {pwSaving
      ? <><Loader className="w-4 h-4 animate-spin"/>Updating…</>
      : <><Save className="w-4 h-4"/>Update Password</>}
  </button>
</div>

      {/* Danger zone */}
      <div className="bg-white rounded-2xl border border-red-100 p-6 space-y-3">
        <h2 className="font-semibold text-red-600 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4"/> Danger Zone
        </h2>
        <p className="text-sm text-slate-500">
          Reset the company profile to blank. Click Save after to persist the change.
        </p>
        <button onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                     border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
          <RotateCcw className="w-4 h-4"/> Reset Company Profile
        </button>
      </div>
    </div>
  );
}
"use client";

/**
 * Slipdesk — Settings Page
 * Place at: src/app/(dashboard)/settings/page.tsx
 */

import { useState, useEffect } from "react";
import { Save, AlertTriangle, CheckCircle2, Building2, RotateCcw } from "lucide-react";
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
"use client";

/**
 * Slipdesk — Settings Page (Dark Theme)
 * Place at: src/app/(dashboard)/settings/page.tsx
 */

import { useState, useEffect } from "react";
import {
  Save, AlertTriangle, CheckCircle2, Building2,
  RotateCcw, Lock, Eye, EyeOff, Loader, User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp, type CompanyProfile, EMPTY_COMPANY } from "@/context/AppContext";
import LogoUploader from "@/components/LogoUploader";

// ─── Shared input styles ──────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 13px",
  background: "#071525", border: "1px solid #1e3a5f",
  borderRadius: 9, color: "#e2e8f0", fontSize: 13,
  fontFamily: "'DM Sans',sans-serif", outline: "none",
  boxSizing: "border-box", transition: "border-color 0.2s",
};

function Inp({
  label, value, onChange, placeholder, type = "text",
  rightSlot, extra,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
  rightSlot?: React.ReactNode; extra?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{
        fontSize: 11, fontWeight: 600, color: "#334155",
        letterSpacing: "0.06em", textTransform: "uppercase",
        fontFamily: "'DM Mono',monospace",
      }}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          type={type} value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, paddingRight: rightSlot ? 42 : 13 }}
          onFocus={(e) => { e.target.style.borderColor = "#50C87870"; }}
          onBlur={(e)  => { e.target.style.borderColor = "#1e3a5f"; }}
        />
        {rightSlot && (
          <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>
            {rightSlot}
          </div>
        )}
      </div>
      {extra}
    </div>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      background: "#0d1f35", border: "1px solid #1e3a5f",
      borderRadius: 16, padding: "24px", display: "flex", flexDirection: "column", gap: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: "#50C87820", border: "1px solid #50C87840",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {icon}
        </div>
        <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 15 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Alert({ type, message }: { type: "success" | "error"; message: string }) {
  const isSuccess = type === "success";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: isSuccess ? "#50C87812" : "#f8717112",
      border: `1px solid ${isSuccess ? "#50C87830" : "#f8717130"}`,
      borderRadius: 10, padding: "11px 14px",
    }}>
      {isSuccess
        ? <CheckCircle2 size={14} color="#50C878"/>
        : <AlertTriangle size={14} color="#f87171"/>
      }
      <p style={{ color: isSuccess ? "#50C878" : "#f87171", fontSize: 13, margin: 0 }}>{message}</p>
    </div>
  );
}

const PW_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter",  test: (p: string) => /[A-Z]/.test(p) },
  { label: "One number",            test: (p: string) => /[0-9]/.test(p) },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { company, setCompany } = useApp();
  const supabase = createClient();

  const [form,   setForm]   = useState<CompanyProfile>({ ...company });
  const [saved,  setSaved]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty,  setDirty]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPw,       setShowNewPw]       = useState(false);
  const [showConfirmPw,   setShowConfirmPw]   = useState(false);
  const [pwSaving,        setPwSaving]        = useState(false);
  const [pwSaved,         setPwSaved]         = useState(false);
  const [pwError,         setPwError]         = useState<string | null>(null);

  useEffect(() => {
    if (company.id) setForm({ ...company });
  }, [company.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function update(field: keyof CompanyProfile, value: string | null) {
    setForm((f) => ({ ...f, [field]: value }));
    setDirty(true);
    setSaved(false);
    setError(null);
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

  async function handlePasswordChange() {
    if (newPassword !== confirmPassword) { setPwError("Passwords don't match."); return; }
    setPwSaving(true);
    setPwError(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwSaving(false);
    if (error) { setPwError(error.message); }
    else { setPwSaved(true); setNewPassword(""); setConfirmPassword(""); }
  }

  const pwStrong = PW_RULES.every((r) => r.test(newPassword));
  const pwMatch  = newPassword === confirmPassword && confirmPassword.length > 0;

  return (
    <div style={{ padding: "32px", minHeight: "100vh", background: "#071525", fontFamily: "'DM Sans',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;600&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.4);cursor:pointer}
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12, animation: "fadeUp 0.3s ease" }}>
        <div>
          <h1 style={{ color: "#f1f5f9", fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Settings</h1>
          <p style={{ color: "#334155", fontSize: 13, marginTop: 5, fontFamily: "'DM Mono',monospace" }}>Company profile & account</p>
        </div>
        <button onClick={handleSave} disabled={saving || !dirty} style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "10px 18px", borderRadius: 11, border: "none",
          background: saving || !dirty ? "#50C87830" : "#50C878",
          color: "#002147", fontWeight: 700, fontSize: 13,
          cursor: saving || !dirty ? "not-allowed" : "pointer", transition: "all 0.15s",
        }}>
          {saving ? <><Loader size={13} style={{ animation: "spin 1s linear infinite" }}/> Saving…</> : <><Save size={13}/> Save Changes</>}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 680 }}>

        {/* Global alerts */}
        {saved  && <div style={{ animation: "fadeUp 0.2s ease" }}><Alert type="success" message="Changes saved successfully."/></div>}
        {error  && <div style={{ animation: "fadeUp 0.2s ease" }}><Alert type="error"   message={error}/></div>}

        {/* Company Logo */}
        <div style={{ animation: "fadeUp 0.35s ease 0.05s both" }}>
          <SectionCard title="Company Logo" icon={<Building2 size={15} color="#50C878"/>}>
            <p style={{ color: "#334155", fontSize: 12, margin: 0 }}>
              Appears on all payslips and PDFs. PNG, JPG, SVG or WebP · max 2 MB.
            </p>
            <LogoUploader
              currentLogoUrl={form.logoUrl}
              onUploadComplete={(url) => update("logoUrl", url)}
            />
          </SectionCard>
        </div>

        {/* Company Details */}
        <div style={{ animation: "fadeUp 0.4s ease 0.1s both" }}>
          <SectionCard title="Company Details" icon={<Building2 size={15} color="#50C878"/>}>
            <Inp
              label="Company Name *"
              value={form.name}
              onChange={(v) => update("name", v)}
              placeholder="Acme Corp Ltd."
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Inp label="LRA Tax ID (TIN)"    value={form.tin}           onChange={(v) => update("tin", v)}           placeholder="LR-TIN-XXXXXXX"/>
              <Inp label="NASSCORP Reg. No."   value={form.nasscorpRegNo} onChange={(v) => update("nasscorpRegNo", v)} placeholder="NASC-XXXXXXX"/>
            </div>
            <Inp label="Business Address" value={form.address} onChange={(v) => update("address", v)} placeholder="Broad Street, Monrovia, Liberia"/>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Inp label="Phone" value={form.phone} onChange={(v) => update("phone", v)} placeholder="+231 770 000 000"/>
              <Inp label="Email" value={form.email} onChange={(v) => update("email", v)} placeholder="hr@company.lr" type="email"/>
            </div>
            {dirty && (
              <button onClick={handleSave} disabled={saving} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: "12px", borderRadius: 11, border: "none",
                background: saving ? "#50C87830" : "#50C878",
                color: "#002147", fontWeight: 700, fontSize: 13,
                cursor: saving ? "not-allowed" : "pointer", transition: "all 0.15s",
              }}>
                {saving ? <><Loader size={13} style={{ animation: "spin 1s linear infinite" }}/> Saving…</> : <><Save size={13}/> Save Changes</>}
              </button>
            )}
          </SectionCard>
        </div>

        {/* Change Password */}
        <div style={{ animation: "fadeUp 0.45s ease 0.15s both" }}>
          <SectionCard title="Change Password" icon={<Lock size={15} color="#50C878"/>}>
            {pwSaved && <Alert type="success" message="Password updated successfully."/>}
            {pwError && <Alert type="error"   message={pwError}/>}

            <Inp
              label="New Password"
              value={newPassword}
              onChange={(v) => { setNewPassword(v); setPwError(null); setPwSaved(false); }}
              placeholder="Min. 8 characters"
              type={showNewPw ? "text" : "password"}
              rightSlot={
                <button type="button" onClick={() => setShowNewPw((v) => !v)} style={{
                  background: "none", border: "none", cursor: "pointer", color: "#334155",
                  display: "flex", alignItems: "center", padding: 0,
                }}>
                  {showNewPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              }
              extra={newPassword.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                  {PW_RULES.map((r) => (
                    <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                        background: r.test(newPassword) ? "#50C878" : "#334155",
                        transition: "background 0.2s",
                      }}/>
                      <span style={{ fontSize: 11, color: r.test(newPassword) ? "#50C878" : "#334155", fontFamily: "'DM Mono',monospace" }}>
                        {r.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            />

            <Inp
              label="Confirm New Password"
              value={confirmPassword}
              onChange={(v) => { setConfirmPassword(v); setPwError(null); }}
              placeholder="Repeat your new password"
              type={showConfirmPw ? "text" : "password"}
              rightSlot={
                <button type="button" onClick={() => setShowConfirmPw((v) => !v)} style={{
                  background: "none", border: "none", cursor: "pointer", color: "#334155",
                  display: "flex", alignItems: "center", padding: 0,
                }}>
                  {showConfirmPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              }
              extra={confirmPassword.length > 0 && !pwMatch && (
                <p style={{ fontSize: 11, color: "#f87171", margin: "4px 0 0", fontFamily: "'DM Mono',monospace" }}>
                  Passwords don&apos;t match.
                </p>
              )}
            />

            <button
              onClick={handlePasswordChange}
              disabled={pwSaving || !pwStrong || !pwMatch}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "11px 18px", borderRadius: 11, border: "none",
                background: pwSaving || !pwStrong || !pwMatch ? "#50C87830" : "#50C878",
                color: "#002147", fontWeight: 700, fontSize: 13,
                cursor: pwSaving || !pwStrong || !pwMatch ? "not-allowed" : "pointer",
                transition: "all 0.15s", width: "fit-content",
              }}
            >
              {pwSaving
                ? <><Loader size={13} style={{ animation: "spin 1s linear infinite" }}/> Updating…</>
                : <><Save size={13}/> Update Password</>
              }
            </button>
          </SectionCard>
        </div>

        {/* Danger zone */}
        <div style={{ animation: "fadeUp 0.5s ease 0.2s both" }}>
          <div style={{ background: "#0d1f35", border: "1px solid #f8717130", borderRadius: 16, padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: "#f8717115", border: "1px solid #f8717130",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <AlertTriangle size={15} color="#f87171"/>
              </div>
              <span style={{ color: "#f87171", fontWeight: 700, fontSize: 15 }}>Danger Zone</span>
            </div>
            <p style={{ color: "#334155", fontSize: 12, margin: "0 0 14px" }}>
              Reset the company profile to blank. Click Save Changes after to persist.
            </p>
            <button onClick={handleReset} style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 16px", borderRadius: 10,
              background: "#f8717112", border: "1px solid #f8717130",
              color: "#f87171", fontSize: 13, fontWeight: 600, cursor: "pointer",
              transition: "all 0.15s",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#f8717120"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#f8717112"; }}
            >
              <RotateCcw size={13}/> Reset Company Profile
            </button>
          </div>
        </div>

      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
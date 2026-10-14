"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Loader, UserPlus } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/lib/rbac";
import { ASSIGNABLE_INVITE_ROLES, inviteFeedback } from "@/lib/auth/team-invite-policy";
import { isDesignatedPlatformAdmin, isPlatformAdminRole } from "@/lib/auth/platform-admin";
import { useApp } from "@/context/AppContext";
import { createClient } from "@/lib/supabase/client";
import { ModuleShell, ModuleHeader, Card } from "@/components/module-ui";

const selectStyle: React.CSSProperties = {
  padding: "8px 11px",
  borderRadius: 9,
  border: "1px solid var(--border)",
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: 13,
};

export default function AdminInvitePage() {
  const { user } = useApp();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("hr_manager");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    if (isDesignatedPlatformAdmin(user.email)) {
      setAllowed(true);
      return;
    }
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .limit(1)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: any) => {
        setAllowed(isPlatformAdminRole(data?.[0]?.role));
      });
  }, [user]);

  async function handleSubmit() {
    setBusy(true);
    setMsg(null);
    setInviteLink(null);
    try {
      const res = await fetch("/api/admin/team-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: companyId.trim(),
          companyName: companyName.trim(),
          fullName,
          email,
          role,
        }),
      });
      const body = await res.json().catch(() => ({}));
      const feedback = inviteFeedback({
        ok: res.ok,
        code: body.code,
        email,
        emailSent: body.emailSent,
        emailError: body.emailError,
        accountExists: body.accountExists,
        error: body.error,
      });
      setMsg(feedback);
      if (body.inviteUrl) setInviteLink(body.inviteUrl);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not send invite." });
    } finally {
      setBusy(false);
    }
  }

  if (allowed !== true) {
    return (
      <ModuleShell>
        <ModuleHeader title="Invite a customer teammate" subtitle="Slipdesk administrators only" />
        <Card>
          <p style={{ margin: 0, fontSize: 14, color: "var(--foreground)" }}>
            {allowed === false
              ? "You don't have permission to invite people to another organization. Company owners can invite their own teammates from Team & Roles."
              : "Checking access…"}
          </p>
        </Card>
      </ModuleShell>
    );
  }

  return (
    <ModuleShell>
      <ModuleHeader
        title="Invite a customer teammate"
        subtitle="Sends the same one-time invitation a company owner can send. No password is created here."
      />
      <Card>
        {msg && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 14, padding: "10px 13px", borderRadius: 10,
            background: msg.ok ? "color-mix(in oklch, var(--primary) 12%, transparent)" : "color-mix(in oklch, var(--destructive) 12%, transparent)",
          }}>
            {msg.ok ? <CheckCircle2 size={14} color="var(--primary)" /> : <AlertTriangle size={14} color="var(--destructive)" />}
            <span style={{ fontSize: 12.5, color: msg.ok ? "var(--primary)" : "var(--destructive)" }}>{msg.text}</span>
          </div>
        )}
        <div style={{ display: "grid", gap: 10 }}>
          <input value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="Company id (preferred)" style={inputStyle} />
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Or exact company name" style={inputStyle} />
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" style={inputStyle} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Work email" type="email" style={inputStyle} />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} style={selectStyle}>
            {ASSIGNABLE_INVITE_ROLES.map((item) => (
              <option key={item} value={item}>{ROLE_LABELS[item]}</option>
            ))}
          </select>
          <button
            onClick={handleSubmit}
            disabled={busy || !fullName.trim() || !email.trim() || (!companyId.trim() && !companyName.trim())}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center",
              padding: "10px 16px", borderRadius: 10, border: "none", background: "var(--primary)",
              color: "var(--primary-foreground)", fontWeight: 700, cursor: "pointer",
            }}
          >
            {busy ? <Loader size={14} /> : <UserPlus size={14} />}
            Send invitation
          </button>
          {inviteLink && (
            <label>
              <span style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>Invitation link (email did not send)</span>
              <input readOnly value={inviteLink} style={{ ...inputStyle, marginTop: 6 }} />
            </label>
          )}
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
            Enter the company id or the exact company name. The teammate sets their own password.
            This page is only for Slipdesk platform admins.
          </p>
        </div>
      </Card>
    </ModuleShell>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: 13,
};

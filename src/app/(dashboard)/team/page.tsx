"use client";

import { useEffect, useMemo, useState } from "react";
import { UserPlus, Shield, Trash2, Mail, Crown, Loader, CheckCircle2, AlertTriangle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { can, ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_FAMILY_LABELS, roleFamily, type Role } from "@/lib/rbac";
import { canUse, getEffectiveTier, PLAN_LABELS } from "@/lib/plan-features";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import {
  fetchMembers, inviteMember, updateMemberRole, removeMember, type CompanyMember,
} from "@/lib/company-members";
import {
  ModuleShell, ModuleHeader, Card, StatTile, UpgradeNotice,
} from "@/components/module-ui";

// Roles that a company admin may assign to teammates (super_admin is platform-only).
const ASSIGNABLE_ROLES: Role[] = [
  "company_owner", "finance_manager", "hr_manager", "payroll_officer", "auditor", "executive", "employee",
];

const selectStyle: React.CSSProperties = {
  padding: "8px 11px", borderRadius: 9, border: "1px solid var(--border)",
  background: "var(--background)", color: "var(--foreground)", fontSize: 13, cursor: "pointer",
};

export default function TeamPage() {
  const { company, user, role } = useApp();
  const effectiveTier = getEffectiveTier(company.subscriptionTier, company.billingBypass);
  const planOk = canUse("advancedRoles", effectiveTier);

  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("payroll_officer");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const allowed = can(role, "users:manage");

  useEffect(() => {
    if (!allowed || !planOk || !company.id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchMembers(company.id);
        if (!cancelled) setMembers(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [company.id, allowed, planOk]);

  async function reload() {
    setMembers(await fetchMembers(company.id));
  }

  async function handleInvite() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await inviteMember(company.id, email, inviteRole);
      if (res.ok) {
        setMsg({
          ok: true,
          text: `Invitation saved for ${email.trim().toLowerCase()}. They should sign up at /signup with that email and choose their own password — they'll join your team automatically on first login.`,
        });
        logAudit({ companyId: company.id, action: "company.update", entityType: "company_member", newValue: { invited: email.trim().toLowerCase(), role: inviteRole } });
        createNotification({ companyId: company.id, type: "general", title: "Team member invited", body: `${email.trim().toLowerCase()} was invited as ${ROLE_LABELS[inviteRole]}.`, severity: "info", link: "/team" });
        setEmail("");
        void reload();
      } else {
        setMsg({ ok: false, text: res.error ?? "Could not send invite." });
      }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not send invite." });
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(id: string, newRole: Role) {
    setMembers((prev) => prev.map((m) => m.id === id ? { ...m, role: newRole } : m));
    const res = await updateMemberRole(id, newRole);
    if (res.ok) logAudit({ companyId: company.id, action: "company.update", entityType: "company_member", entityId: id, newValue: { role: newRole } });
    else await reload();
  }

  async function handleRemove(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    const res = await removeMember(id);
    if (res.ok) logAudit({ companyId: company.id, action: "company.update", entityType: "company_member", entityId: id, newValue: { removed: true } });
    else await reload();
  }

  const pending = useMemo(() => members.filter((m) => m.status === "pending").length, [members]);

  if (!planOk) {
    return (
      <UpgradeNotice
        title="Team & Roles"
        requiredPlan={PLAN_LABELS.premium}
        description="Advanced role permissions (Admin, Manager, Employee) are available on the Enterprise plan."
      />
    );
  }

  if (!allowed) {
    return (
      <UpgradeNotice title="Team & Roles" requiredPlan="an authorized"
        description="Your role does not have access to team management. Only a Company Owner can invite teammates and assign roles." />
    );
  }

  const ownerEmail = company.email || user?.email || "—";

  return (
    <ModuleShell>
      <ModuleHeader title="Team & Roles" subtitle="Admin · Manager · Employee access with granular permissions" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 20 }}>
        <StatTile label="Members" value={members.length + 1} accent />
        <StatTile label="Pending Invites" value={pending} />
        <StatTile label="Role Families" value={3} sub="Admin · Manager · Employee" />
      </div>

      {/* Invite */}
      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <UserPlus size={16} color="var(--primary)" />
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--foreground)" }}>Invite a teammate</span>
        </div>
        {msg && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "10px 13px", borderRadius: 10,
            background: msg.ok ? "color-mix(in oklch, var(--primary) 12%, transparent)" : "color-mix(in oklch, var(--destructive) 12%, transparent)",
            border: `1px solid ${msg.ok ? "color-mix(in oklch, var(--primary) 30%, transparent)" : "color-mix(in oklch, var(--destructive) 30%, transparent)"}`,
          }}>
            {msg.ok ? <CheckCircle2 size={14} color="var(--primary)" /> : <AlertTriangle size={14} color="var(--destructive)" />}
            <span style={{ fontSize: 12.5, color: msg.ok ? "var(--primary)" : "var(--destructive)" }}>{msg.text}</span>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <Mail size={15} color="var(--muted-foreground)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.lr"
              type="email"
              style={{ width: "100%", padding: "9px 12px 9px 34px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: 13 }}
            />
          </div>
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} style={selectStyle}>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                [{ROLE_FAMILY_LABELS[roleFamily(r)]}] {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <button
            onClick={handleInvite}
            disabled={busy || !email.trim()}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 10, border: "none",
              background: busy || !email.trim() ? "color-mix(in oklch, var(--primary) 30%, transparent)" : "var(--primary)",
              color: "var(--primary-foreground)", fontWeight: 700, fontSize: 13, cursor: busy || !email.trim() ? "not-allowed" : "pointer",
            }}
          >
            {busy ? <Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> : <UserPlus size={14} />}
            Send Invite
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", margin: "10px 0 0", lineHeight: 1.5 }}>
          {ROLE_DESCRIPTIONS[inviteRole]} Invited users create their own password at signup — no password is emailed.
        </p>
      </Card>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Members */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {/* Owner (always present) */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "color-mix(in oklch, var(--primary) 18%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Crown size={16} color="var(--primary)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 13.5, color: "var(--foreground)" }}>{ownerEmail}</p>
            <p style={{ margin: 0, fontSize: 11.5, color: "var(--muted-foreground)" }}>You · Company Owner</p>
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--primary)", padding: "4px 10px", borderRadius: 999, background: "color-mix(in oklch, var(--primary) 12%, transparent)" }}>Owner</span>
        </div>

        {loading ? (
          <Empty title="Loading team…" />
        ) : members.length === 0 ? (
          <Empty title="No teammates yet" body="Invite finance, HR, and payroll staff and assign each a role. Invites appear here as pending until they sign up." />
        ) : (
          members.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "color-mix(in oklch, var(--foreground) 8%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Shield size={15} color="var(--muted-foreground)" />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5, color: "var(--foreground)" }}>{m.invitedEmail ?? "Member"}</p>
                <p style={{ margin: 0, fontSize: 11, color: m.status === "pending" ? "var(--warning)" : "var(--muted-foreground)", fontFamily: "'DM Mono',monospace" }}>
                  {m.status === "pending" ? "Pending invite" : "Active"}
                </p>
              </div>
              <select value={m.role} onChange={(e) => handleRoleChange(m.id, e.target.value as Role)} style={selectStyle}>
                {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              <button
                onClick={() => handleRemove(m.id)}
                title="Remove member"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, border: "1px solid color-mix(in oklch, var(--destructive) 30%, transparent)", background: "color-mix(in oklch, var(--destructive) 8%, transparent)", color: "var(--destructive)", cursor: "pointer" }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </Card>

      {/* Role reference */}
      <div style={{ marginTop: 22 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'DM Mono',monospace", marginBottom: 12 }}>
          Role Reference
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
          {ASSIGNABLE_ROLES.map((r) => (
            <Card key={r} style={{ padding: 16 }}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 13, color: "var(--foreground)" }}>{ROLE_LABELS[r]}</p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5 }}>{ROLE_DESCRIPTIONS[r]}</p>
            </Card>
          ))}
        </div>
      </div>
    </ModuleShell>
  );
}

function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div style={{ padding: "48px 32px", textAlign: "center" }}>
      <p style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 15, margin: "0 0 6px" }}>{title}</p>
      {body && <p style={{ color: "var(--muted-foreground)", fontSize: 12.5, maxWidth: 440, margin: "0 auto", lineHeight: 1.6 }}>{body}</p>}
    </div>
  );
}

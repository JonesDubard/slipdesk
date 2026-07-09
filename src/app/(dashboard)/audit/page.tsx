"use client";

import { useEffect, useMemo, useState } from "react";
import { ScrollText, RefreshCw, Search, FileDown } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { getEffectiveTier, canUse, PLAN_LABELS } from "@/lib/plan-features";
import { can } from "@/lib/rbac";
import { fetchAuditLog, auditActionLabel, type AuditRecord } from "@/lib/audit";
import { downloadCSV, type Cell } from "@/lib/reporting";
import {
  ModuleShell, ModuleHeader, Card, StatTile, UpgradeNotice, btnGhost,
} from "@/components/module-ui";

function actionTone(action: string): string {
  if (action.includes("delete") || action.includes("archive")) return "var(--destructive)";
  if (action.includes("approve") || action.includes("release") || action.includes("create")) return "var(--primary)";
  if (action.includes("reopen") || action.includes("salary")) return "var(--warning)";
  return "var(--muted-foreground)";
}

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("default", {
      year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function summarizeValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  try {
    const obj = v as Record<string, unknown>;
    return Object.entries(obj).map(([k, val]) => `${k}: ${String(val)}`).join(", ").slice(0, 120);
  } catch { return String(v); }
}

export default function AuditCenterPage() {
  const { company, role } = useApp();
  const effectiveTier = getEffectiveTier(company.subscriptionTier, company.billingBypass);

  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("All");

  const gated = !canUse("auditTrail", effectiveTier) || !can(role, "audit:view");

  useEffect(() => {
    if (gated || !company.id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await fetchAuditLog(company.id);
      if (!cancelled) { setRecords(data); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [company.id, gated]);

  async function refresh() {
    setLoading(true);
    setRecords(await fetchAuditLog(company.id));
    setLoading(false);
  }

  const actions = useMemo(() => ["All", ...Array.from(new Set(records.map((r) => r.action)))], [records]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      if (actionFilter !== "All" && r.action !== actionFilter) return false;
      if (!q) return true;
      return (
        r.action.toLowerCase().includes(q) ||
        (r.actorEmail ?? "").toLowerCase().includes(q) ||
        (r.entityType ?? "").toLowerCase().includes(q)
      );
    });
  }, [records, query, actionFilter]);

  function exportCsv() {
    const headers = ["When", "Actor", "Action", "Entity", "Old Value", "New Value", "IP"];
    const dataRows: Cell[][] = filtered.map((r) => [
      fmtWhen(r.createdAt), r.actorEmail ?? "—", auditActionLabel(r.action),
      r.entityType ? `${r.entityType} ${r.entityId ?? ""}`.trim() : "—",
      summarizeValue(r.oldValue), summarizeValue(r.newValue), r.ipAddress ?? "—",
    ]);
    downloadCSV(`Audit_Log_${new Date().toISOString().split("T")[0]}`, headers, dataRows);
  }

  if (!canUse("auditTrail", effectiveTier)) {
    return (
      <UpgradeNotice
        title="Audit Center"
        requiredPlan={PLAN_LABELS.premium}
        description="The Audit Center — a tamper-evident record of every salary edit, payroll approval, export, and login — is available on the Enterprise plan."
      />
    );
  }

  if (!can(role, "audit:view")) {
    return (
      <UpgradeNotice title="Audit Center" requiredPlan="an authorized"
        description="Your role does not have access to the Audit Center. Contact your company owner or an auditor." />
    );
  }

  const today = new Date().toDateString();
  const todayCount = records.filter((r) => new Date(r.createdAt).toDateString() === today).length;
  const uniqueActors = new Set(records.map((r) => r.actorEmail).filter(Boolean)).size;

  const selectStyle: React.CSSProperties = {
    padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border)",
    background: "var(--card)", color: "var(--foreground)", fontSize: 13, cursor: "pointer",
  };

  return (
    <ModuleShell>
      <ModuleHeader
        title="Audit Center"
        subtitle="Immutable record of every critical action"
        actions={
          <>
            <button onClick={exportCsv} style={btnGhost()} disabled={!filtered.length}>
              <FileDown size={15} /> Export CSV
            </button>
            <button onClick={refresh} style={btnGhost()}>
              <RefreshCw size={15} style={loading ? { animation: "spin 1s linear infinite" } : undefined} /> Refresh
            </button>
          </>
        }
      />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 20 }}>
        <StatTile label="Total Events" value={records.length} accent />
        <StatTile label="Today" value={todayCount} />
        <StatTile label="Unique Actors" value={uniqueActors} />
        <StatTile label="Action Types" value={Math.max(actions.length - 1, 0)} />
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 12, padding: 16, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <Search size={15} color="var(--muted-foreground)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search actor, action, entity…"
              style={{ width: "100%", padding: "9px 12px 9px 34px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: 13 }}
            />
          </div>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={selectStyle}>
            {actions.map((a) => <option key={a} value={a}>{a === "All" ? "All actions" : auditActionLabel(a)}</option>)}
          </select>
        </div>

        {loading ? (
          <EmptyState icon={<ScrollText size={26} color="var(--muted-foreground)" />} title="Loading audit trail…" />
        ) : records.length === 0 ? (
          <EmptyState
            icon={<ScrollText size={26} color="var(--muted-foreground)" />}
            title="No audit events yet"
            body="Actions like salary edits, payroll approvals, and exports will appear here once the audit_log table is provisioned (migration 0001) and activity begins."
          />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Search size={26} color="var(--muted-foreground)" />} title="No matching events" />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted-foreground)", fontFamily: "'DM Mono',monospace", fontSize: 11 }}>
                  <Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th><Th>Change</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <Td mono>{fmtWhen(r.createdAt)}</Td>
                    <Td>{r.actorEmail ?? "—"}</Td>
                    <Td>
                      <span style={{
                        display: "inline-block", padding: "3px 9px", borderRadius: 999, fontSize: 11.5, fontWeight: 700,
                        color: actionTone(r.action),
                        background: `color-mix(in oklch, ${actionTone(r.action)} 12%, transparent)`,
                        border: `1px solid color-mix(in oklch, ${actionTone(r.action)} 30%, transparent)`,
                      }}>
                        {auditActionLabel(r.action)}
                      </span>
                    </Td>
                    <Td mono>{r.entityType ? `${r.entityType}${r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}` : "—"}</Td>
                    <Td>
                      {r.oldValue != null && (
                        <span style={{ color: "var(--destructive)", fontFamily: "'DM Mono',monospace", fontSize: 11.5 }}>
                          {summarizeValue(r.oldValue)}
                        </span>
                      )}
                      {r.oldValue != null && r.newValue != null && <span style={{ color: "var(--muted-foreground)" }}> → </span>}
                      {r.newValue != null && (
                        <span style={{ color: "var(--foreground)", fontFamily: "'DM Mono',monospace", fontSize: 11.5 }}>
                          {summarizeValue(r.newValue)}
                        </span>
                      )}
                      {r.oldValue == null && r.newValue == null && <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </ModuleShell>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "11px 16px", fontWeight: 600, whiteSpace: "nowrap" }}>{children}</th>;
}
function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td style={{ padding: "11px 16px", color: "var(--foreground)", verticalAlign: "top", fontFamily: mono ? "'DM Mono',monospace" : undefined, fontSize: mono ? 12 : 13 }}>
      {children}
    </td>
  );
}
function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body?: string }) {
  return (
    <div style={{ padding: "56px 32px", textAlign: "center" }}>
      <div style={{ width: 54, height: 54, borderRadius: 14, margin: "0 auto 16px", background: "color-mix(in oklch, var(--foreground) 6%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {icon}
      </div>
      <p style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 15, margin: "0 0 6px" }}>{title}</p>
      {body && <p style={{ color: "var(--muted-foreground)", fontSize: 12.5, maxWidth: 440, margin: "0 auto", lineHeight: 1.6 }}>{body}</p>}
    </div>
  );
}

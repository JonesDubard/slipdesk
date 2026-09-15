"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, GitBranch, Loader, Lock, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { canUse, getEffectiveTier, PLAN_LABELS } from "@/lib/plan-features";
import { ModuleShell, ModuleHeader, Card, UpgradeNotice } from "@/components/module-ui";

type Kind = "departments" | "branches";
interface Unit { id: string; name: string; created_at?: string }

export default function OrganizationPage() {
  const { company } = useApp();
  const tier = getEffectiveTier(company.subscriptionTier, company.billingBypass);
  const canDepts = canUse("departmentManagement", tier);
  const canBranches = canUse("branchManagement", tier);
  const canMulti = canUse("multiBranch", tier);

  if (!canDepts && !canBranches) {
    return (
      <UpgradeNotice
        title="Organization"
        requiredPlan={PLAN_LABELS.standard}
        description="Create and assign departments and branches on the Professional plan and above."
      />
    );
  }

  return (
    <ModuleShell>
      <ModuleHeader
        title="Organization"
        subtitle="Branches (entities), departments, and how employees are grouped for payroll"
      />

      <Card style={{ marginBottom: 16, borderColor: "color-mix(in oklch, var(--primary) 25%, var(--border))" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <GitBranch size={18} color="var(--primary)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>
              Branches &amp; entities (batches)
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.55 }}>
              A <strong style={{ color: "var(--foreground)" }}>branch</strong> is a location or entity under your company
              (for example &ldquo;Monrovia HQ&rdquo; or &ldquo;Buchanan Office&rdquo;). Branches are used for branch-scoped
              payroll and reporting. This is <strong style={{ color: "var(--foreground)" }}>not</strong> your company logo
              — logo upload lives under <strong style={{ color: "var(--foreground)" }}>Settings</strong> → Company Logo.
            </p>
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {canBranches ? (
          <UnitPanel
            kind="branches"
            title="Branches & Entities"
            subtitle="Add each branch or batch under your organization, then assign employees to it."
            icon={<GitBranch size={15} />}
            addLabel="Add Branch"
            namePlaceholder="e.g. Monrovia HQ, Buchanan Office"
            emptyHint="No branches yet. Type a name above and click Add Branch."
          />
        ) : (
          <LockedCard label="Branches & entities" plan={PLAN_LABELS.standard} />
        )}
        {canDepts ? (
          <UnitPanel kind="departments" title="Departments" icon={<Building2 size={15} />} />
        ) : (
          <LockedCard label="Departments" plan={PLAN_LABELS.standard} />
        )}
      </div>
      {canMulti ? (
        <div style={{ marginTop: 16 }} data-testid="multi-branch-panel">
          <MultiBranchPanel />
        </div>
      ) : canBranches ? (
        <Card style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Lock size={14} color="var(--muted-foreground)" />
            <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
              Multi-branch headcount analytics unlock on {PLAN_LABELS.premium}.
            </span>
          </div>
        </Card>
      ) : null}
    </ModuleShell>
  );
}

function LockedCard({ label, plan }: { label: string; plan: string }) {
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Lock size={14} color="var(--muted-foreground)" />
        <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
          {label} require the {plan} plan.
        </span>
      </div>
    </Card>
  );
}

function UnitPanel({
  kind,
  title,
  subtitle,
  icon,
  addLabel = "Add",
  namePlaceholder,
  emptyHint,
}: {
  kind: Kind;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  addLabel?: string;
  namePlaceholder?: string;
  emptyHint?: string;
}) {
  const [items, setItems] = useState<Unit[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/org/units?kind=${kind}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => { void load(); }, [load]);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/org/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add");
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setSaving(true);
    try {
      await fetch("/api/org/units", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card data-testid={kind === "branches" ? "branches-entities-panel" : undefined}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: subtitle ? 6 : 0 }}>
          <span style={{ color: "var(--primary)" }}>{icon}</span>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</h2>
        </div>
        {subtitle && (
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5, paddingLeft: 23 }}>
            {subtitle}
          </p>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
          placeholder={namePlaceholder ?? `New ${kind === "departments" ? "department" : "branch"}`}
          aria-label={kind === "branches" ? "Branch or entity name" : `New ${kind}`}
          style={{
            flex: 1, padding: "9px 12px", borderRadius: 10,
            border: "1px solid var(--border)", background: "var(--background)",
            color: "var(--foreground)", fontSize: 13,
          }}
        />
        <button
          onClick={() => void add()}
          disabled={saving || !name.trim()}
          data-testid={kind === "branches" ? "add-branch-button" : undefined}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 14px", borderRadius: 10, border: "none",
            background: "var(--primary)", color: "var(--primary-foreground)",
            fontWeight: 700, fontSize: 12, cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {saving ? <Loader size={13} className="animate-spin" /> : <Plus size={13} />}
          {addLabel}
        </button>
      </div>
      {error && <p style={{ color: "var(--destructive)", fontSize: 12, margin: "0 0 10px" }}>{error}</p>}
      {loading ? (
        <p style={{ color: "var(--muted-foreground)", fontSize: 12 }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
          {emptyHint ?? `No ${kind} yet. Add one to assign on the Employees page.`}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((item) => (
            <li
              key={item.id}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)",
              }}
            >
              <span style={{ fontSize: 13 }}>{item.name}</span>
              <button
                onClick={() => void remove(item.id)}
                aria-label={`Delete ${item.name}`}
                style={{
                  border: "none", background: "transparent", cursor: "pointer",
                  color: "var(--muted-foreground)", display: "flex",
                }}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {kind === "branches" && items.length > 0 && (
        <p style={{ margin: "12px 0 0", fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
          Next: on <strong style={{ color: "var(--foreground)" }}>Employees</strong>, assign each person to a branch (Unassigned is allowed).
          On <strong style={{ color: "var(--foreground)" }}>Payroll</strong>, choose a branch scope when starting a run.
        </p>
      )}
    </Card>
  );
}

function MultiBranchPanel() {
  const [rows, setRows] = useState<{ id: string; name: string; employees: number; salaryMass: number; isHq?: boolean }[]>([]);
  const [unassigned, setUnassigned] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/org/branch-summary");
        const data = await res.json();
        if (!res.ok || cancelled) return;
        setRows(data.branches ?? []);
        setUnassigned(data.unassigned ?? 0);
        setTotal(data.totalActive ?? 0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Card>
      <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700 }}>Multi-branch overview</h3>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--muted-foreground)" }}>
        Headcount and salary mass by registered branch · {total} active employees
        {unassigned ? ` · ${unassigned} unassigned` : ""}
      </p>
      {loading ? (
        <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          Assign employees to a branch. Headcount and salary mass group by branch ID (Unassigned = no branch).
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Branch", "Employees", "Salary mass"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid var(--border)", color: "var(--muted-foreground)", fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ padding: "8px 6px", borderBottom: "1px solid var(--border)" }}>
                  {r.name}{r.isHq ? " (HQ)" : ""}
                </td>
                <td style={{ padding: "8px 6px", borderBottom: "1px solid var(--border)" }}>{r.employees}</td>
                <td style={{ padding: "8px 6px", borderBottom: "1px solid var(--border)", fontFamily: "'DM Mono',monospace" }}>
                  ${Number(r.salaryMass).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

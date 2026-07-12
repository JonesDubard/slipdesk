"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader, Plus, Trash2, Copy, Check } from "lucide-react";
import { canUse, getEffectiveTier, PLAN_LABELS } from "@/lib/plan-features";
import { useApp } from "@/context/AppContext";

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export function ApiAccessPanel() {
  const { company } = useApp();
  const tier = getEffectiveTier(company.subscriptionTier, company.billingBypass);
  const unlocked = canUse("apiAccess", tier);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("Default");
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!unlocked) return;
    setLoading(true);
    try {
      const res = await fetch("/api/settings/api-keys");
      const data = await res.json();
      if (res.ok) setKeys((data.keys ?? []).filter((k: ApiKeyRow) => !k.revoked_at));
      else setError(data.error || "Could not load keys");
    } finally {
      setLoading(false);
    }
  }, [unlocked]);

  useEffect(() => { void load(); }, [load]);

  if (!unlocked) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, background: "color-mix(in oklch, var(--primary) 8%, transparent)", border: "1px solid var(--border)" }}>
        <KeyRound size={14} color="var(--muted-foreground)" />
        <span style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
          API Access (Bearer keys + /api/v1/employees) is available on the {PLAN_LABELS.premium} plan.
        </span>
      </div>
    );
  }

  async function createKey() {
    setError(null);
    setPlaintext(null);
    const res = await fetch("/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() || "Default" }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Create failed"); return; }
    setPlaintext(data.plaintext);
    await load();
  }

  async function revoke(id: string) {
    await fetch("/api/settings/api-keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  return (
    <div data-testid="api-access-panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)" }}>
        Use <code style={{ fontFamily: "'DM Mono',monospace" }}>Authorization: Bearer sk_live_…</code> against
        {" "}<code style={{ fontFamily: "'DM Mono',monospace" }}>GET /api/v1/employees</code>.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name"
          style={{ flex: 1, minWidth: 140, padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--background)", fontSize: 13 }}
        />
        <button
          type="button"
          onClick={() => void createKey()}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "9px 12px", borderRadius: 10, border: "none",
            background: "var(--primary)", color: "var(--primary-foreground)", fontWeight: 700, fontSize: 12, cursor: "pointer",
          }}
        >
          <Plus size={13} /> Create key
        </button>
      </div>
      {plaintext && (
        <div style={{ padding: 12, borderRadius: 10, background: "color-mix(in oklch, var(--primary) 10%, transparent)", border: "1px solid var(--border)" }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700 }}>Copy this key now — it won&apos;t be shown again.</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code style={{ flex: 1, fontSize: 12, wordBreak: "break-all", fontFamily: "'DM Mono',monospace" }}>{plaintext}</code>
            <button
              type="button"
              onClick={async () => { await navigator.clipboard.writeText(plaintext); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--foreground)" }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      )}
      {error && <p style={{ color: "var(--destructive)", fontSize: 12, margin: 0 }}>{error}</p>}
      {loading ? (
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 6 }}>
          <Loader size={13} className="animate-spin" /> Loading…
        </p>
      ) : keys.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>No active API keys.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {keys.map((k) => (
            <li key={k.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{k.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "'DM Mono',monospace" }}>
                  {k.key_prefix}… · created {new Date(k.created_at).toLocaleDateString()}
                  {k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}` : ""}
                </div>
              </div>
              <button type="button" onClick={() => void revoke(k.id)} aria-label="Revoke key" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted-foreground)" }}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

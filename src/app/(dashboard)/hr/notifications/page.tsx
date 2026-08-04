"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader, Mail, RefreshCw, Search } from "lucide-react";
import {
  ModuleShell, ModuleHeader, Card, StatTile, btnGhost, btnPrimary,
} from "@/components/module-ui";

type LogRow = {
  id: string;
  channel: string;
  provider: string;
  templateKey: string;
  eventType: string;
  recipient: string;
  status: string;
  attempt: number;
  providerMessageId: string | null;
  errorReason: string | null;
  createdAt: string;
  employeeName: string | null;
  employeeNumber: string | null;
};

type Counts = { sent: number; delivered: number; failed: number; pending: number; skipped: number };

export default function HrNotificationsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [counts, setCounts] = useState<Counts>({ sent: 0, delivered: 0, failed: 0, pending: 0, skipped: 0 });
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ channel: "email" });
      if (status !== "all") params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/hr/notifications?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load notifications.");
        return;
      }
      setLogs(data.logs ?? []);
      setCounts(data.counts ?? { sent: 0, delivered: 0, failed: 0, pending: 0, skipped: 0 });
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [status, q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function retry(id: string) {
    setRetrying(id);
    try {
      await fetch(`/api/hr/notifications/${id}/retry`, { method: "POST" });
      await load();
    } finally {
      setRetrying(null);
    }
  }

  const lastSent = logs.find((l) => l.status === "sent" || l.status === "delivered")?.createdAt;

  return (
    <ModuleShell>
      <ModuleHeader
        title="Email notifications"
        subtitle="Outbound transactional email via Resend — foundation for future WhatsApp/SMS"
        actions={
          <button type="button" style={btnGhost()} onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 12, marginBottom: 20 }}>
        <StatTile label="Sent" value={counts.sent} />
        <StatTile label="Delivered" value={counts.delivered} accent />
        <StatTile label="Failed" value={counts.failed} warning />
        <StatTile label="Pending" value={counts.pending} />
        <StatTile label="Skipped" value={counts.skipped} />
      </div>

      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 16, fontFamily: "'DM Mono',monospace" }}>
        Last sent: {lastSent ? new Date(lastSent).toLocaleString() : "—"}
      </p>

      <Card style={{ marginBottom: 16, padding: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search employee or recipient…"
            style={{
              width: "100%", padding: "10px 12px 10px 34px", borderRadius: 11,
              border: "1px solid var(--border)", fontSize: 13, background: "var(--background)",
            }}
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 11, border: "1px solid var(--border)", fontSize: 13 }}
        >
          <option value="all">All statuses</option>
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
          <option value="skipped">Skipped</option>
        </select>
        <button type="button" style={btnPrimary()} onClick={() => void load()}>
          Apply
        </button>
      </Card>

      {error && <p style={{ color: "var(--destructive)", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted-foreground)", fontSize: 13, padding: "32px 0" }}>
          <Loader size={16} className="animate-spin" /> Loading logs…
        </div>
      ) : logs.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 40, color: "var(--muted-foreground)", fontSize: 13 }}>
          <Mail size={28} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
          No notification logs yet.
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 11, color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "12px 14px", fontWeight: 600 }}>When</th>
                <th style={{ padding: "12px 14px", fontWeight: 600 }}>Employee</th>
                <th style={{ padding: "12px 14px", fontWeight: 600 }}>Recipient</th>
                <th style={{ padding: "12px 14px", fontWeight: 600 }}>Template</th>
                <th style={{ padding: "12px 14px", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "12px 14px", fontWeight: 600 }}>Attempt</th>
                <th style={{ padding: "12px 14px", fontWeight: 600 }}>Provider</th>
                <th style={{ padding: "12px 14px", fontWeight: 600 }} />
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 14px", whiteSpace: "nowrap", fontSize: 11, color: "var(--muted-foreground)" }}>
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ fontWeight: 600 }}>{row.employeeName ?? "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "'DM Mono',monospace" }}>{row.employeeNumber}</div>
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 11, fontFamily: "'DM Mono',monospace" }}>{row.recipient}</td>
                  <td style={{ padding: "12px 14px", fontSize: 12 }}>{row.templateKey}</td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{
                      display: "inline-flex", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                      background: row.status === "failed" ? "color-mix(in oklch, var(--destructive) 12%, transparent)"
                        : row.status === "sent" || row.status === "delivered" ? "color-mix(in oklch, var(--primary) 12%, transparent)"
                          : "var(--muted)",
                      color: row.status === "failed" ? "var(--destructive)" : "var(--foreground)",
                    }}>
                      {row.status}
                    </span>
                    {row.errorReason && (
                      <div style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 4, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }} title={row.errorReason}>
                        {row.errorReason}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 12 }}>{row.attempt}</td>
                  <td style={{ padding: "12px 14px", fontSize: 12 }}>
                    {row.provider}
                    {row.providerMessageId && (
                      <div style={{ fontSize: 10, color: "var(--muted-foreground)", fontFamily: "'DM Mono',monospace", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }} title={row.providerMessageId}>
                        {row.providerMessageId}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    {row.status === "failed" && (
                      <button
                        type="button"
                        disabled={retrying === row.id}
                        onClick={() => void retry(row.id)}
                        style={{ ...btnGhost(), padding: "6px 10px", fontSize: 12, opacity: retrying === row.id ? 0.5 : 1 }}
                      >
                        {retrying === row.id ? "…" : "Retry"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </ModuleShell>
  );
}

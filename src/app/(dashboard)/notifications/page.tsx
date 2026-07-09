"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell, CheckCheck, AlertTriangle, CheckCircle2, Info, Clock, RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useApp } from "@/context/AppContext";
import {
  fetchNotifications, markNotificationRead, markAllNotificationsRead,
  type AppNotification, type NotificationSeverity,
} from "@/lib/notifications";
import {
  ModuleShell, ModuleHeader, Card, btnGhost,
} from "@/components/module-ui";

function severityStyle(sev: NotificationSeverity): { color: string; icon: React.ReactNode } {
  switch (sev) {
    case "critical": return { color: "var(--destructive)", icon: <AlertTriangle size={16} color="var(--destructive)" /> };
    case "warning":  return { color: "var(--warning)",     icon: <AlertTriangle size={16} color="var(--warning)" /> };
    case "success":  return { color: "var(--primary)",     icon: <CheckCircle2 size={16} color="var(--primary)" /> };
    default:         return { color: "var(--muted-foreground)", icon: <Info size={16} color="var(--muted-foreground)" /> };
  }
}

function fmtWhen(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return d.toLocaleDateString("default", { month: "short", day: "numeric" });
  } catch { return iso; }
}

export default function NotificationCenterPage() {
  const { company } = useApp();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "unread">("all");

  useEffect(() => {
    if (!company.id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await fetchNotifications(company.id);
      if (!cancelled) { setItems(data); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [company.id]);

  async function refresh() {
    setLoading(true);
    setItems(await fetchNotifications(company.id));
    setLoading(false);
  }

  async function readOne(id: string) {
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
    await markNotificationRead(id);
  }

  async function readAll() {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await markAllNotificationsRead(company.id);
  }

  const unreadCount = items.filter((n) => !n.isRead).length;
  const shown = useMemo(() => tab === "unread" ? items.filter((n) => !n.isRead) : items, [items, tab]);

  return (
    <ModuleShell>
      <ModuleHeader
        title="Notifications"
        subtitle={unreadCount ? `${unreadCount} unread` : "You're all caught up"}
        actions={
          <>
            {unreadCount > 0 && (
              <button onClick={readAll} style={btnGhost()}>
                <CheckCheck size={15} /> Mark all read
              </button>
            )}
            <button onClick={refresh} style={btnGhost()}>
              <RefreshCw size={15} style={loading ? { animation: "spin 1s linear infinite" } : undefined} /> Refresh
            </button>
          </>
        }
      />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["all", "unread"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "7px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
            border: `1px solid ${tab === t ? "var(--primary)" : "var(--border)"}`,
            background: tab === t ? "color-mix(in oklch, var(--primary) 14%, transparent)" : "var(--card)",
            color: tab === t ? "var(--primary)" : "var(--muted-foreground)", textTransform: "capitalize",
          }}>
            {t}{t === "unread" && unreadCount ? ` (${unreadCount})` : ""}
          </button>
        ))}
      </div>

      <Card style={{ padding: 0, overflow: "hidden", maxWidth: 760 }}>
        {loading ? (
          <Empty title="Loading notifications…" />
        ) : shown.length === 0 ? (
          <Empty
            title={tab === "unread" ? "No unread notifications" : "No notifications yet"}
            body="Payroll deadlines, approvals, compliance warnings, and new employees will show up here once activity begins."
          />
        ) : (
          <div>
            {shown.map((n) => {
              const s = severityStyle(n.severity);
              const body = (
                <div style={{ display: "flex", gap: 12, padding: "14px 18px", borderTop: "1px solid var(--border)", background: n.isRead ? "transparent" : "color-mix(in oklch, var(--primary) 5%, transparent)", cursor: n.link ? "pointer" : "default" }}>
                  <div style={{ flexShrink: 0, marginTop: 1 }}>{s.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {!n.isRead && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--primary)", flexShrink: 0 }} />}
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 13.5, color: "var(--foreground)" }}>{n.title}</p>
                    </div>
                    {n.body && <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.5 }}>{n.body}</p>}
                    <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--muted-foreground)", fontFamily: "'DM Mono',monospace", display: "flex", alignItems: "center", gap: 5 }}>
                      <Clock size={11} /> {fmtWhen(n.createdAt)}
                    </p>
                  </div>
                  {!n.isRead && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); readOne(n.id); }}
                      style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    >
                      Mark read
                    </button>
                  )}
                </div>
              );
              return n.link
                ? <Link key={n.id} href={n.link} onClick={() => readOne(n.id)} style={{ textDecoration: "none" }}>{body}</Link>
                : <div key={n.id}>{body}</div>;
            })}
          </div>
        )}
      </Card>
    </ModuleShell>
  );
}

function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div style={{ padding: "56px 32px", textAlign: "center" }}>
      <div style={{ width: 54, height: 54, borderRadius: 14, margin: "0 auto 16px", background: "color-mix(in oklch, var(--foreground) 6%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Bell size={24} color="var(--muted-foreground)" />
      </div>
      <p style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 15, margin: "0 0 6px" }}>{title}</p>
      {body && <p style={{ color: "var(--muted-foreground)", fontSize: 12.5, maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>{body}</p>}
    </div>
  );
}

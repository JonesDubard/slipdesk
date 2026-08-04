"use client";

import { useEffect, useState } from "react";
import { Loader, AlertCircle, Bell } from "lucide-react";

type Pref = {
  id: string;
  channel: string;
  event_type: string;
  enabled: boolean;
  available: boolean;
};

const LABELS: Record<string, string> = {
  payslip_ready: "Payslip emails",
  password_reset: "Password reset emails (required)",
  password_changed: "Password changed alerts",
  welcome: "Welcome emails",
};

export default function PortalPreferencesPage() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/employee/notification-preferences");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load preferences.");
        return;
      }
      setPrefs(data.preferences ?? []);
      setEmail(data.email ?? null);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggle(pref: Pref, enabled: boolean) {
    if (pref.channel !== "email" || pref.event_type === "password_reset" || !pref.available) return;
    setSaving(pref.event_type);
    try {
      const res = await fetch("/api/employee/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "email", eventType: pref.event_type, enabled }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Could not update.");
        return;
      }
      setPrefs((prev) =>
        prev.map((p) =>
          p.channel === pref.channel && p.event_type === pref.event_type ? { ...p, enabled } : p,
        ),
      );
    } catch {
      setError("Network error.");
    } finally {
      setSaving(null);
    }
  }

  const emailPrefs = prefs.filter((p) => p.channel === "email");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[#002147] flex items-center gap-2">
          <Bell className="w-5 h-5" /> Notification preferences
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Email is the only active channel. WhatsApp and SMS will appear here when enabled later.
        </p>
        {email ? (
          <p className="text-xs text-slate-400 mt-1 font-mono">{email}</p>
        ) : (
          <p className="text-xs text-amber-700 mt-2">
            No email on your employee record — ask HR to add one to receive payslip and reset emails.
          </p>
        )}
      </div>

      {error && (
        <div className="flex gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-400 flex items-center gap-2">
          <Loader className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
            {emailPrefs.map((p) => {
              const locked = p.event_type === "password_reset";
              return (
                <label
                  key={`${p.channel}-${p.event_type}`}
                  className="flex items-center justify-between gap-4 px-4 py-3.5"
                >
                  <span className="text-sm text-slate-700">
                    {LABELS[p.event_type] ?? p.event_type}
                    {locked && <span className="block text-xs text-slate-400 mt-0.5">Cannot be disabled</span>}
                  </span>
                  <input
                    type="checkbox"
                    checked={Boolean(p.enabled)}
                    disabled={locked || saving === p.event_type}
                    onChange={(e) => void toggle(p, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </label>
              );
            })}
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Coming later</p>
            <div className="bg-white border border-dashed border-slate-200 rounded-2xl divide-y divide-slate-50 opacity-60">
              {(["whatsapp", "sms"] as const).map((ch) => (
                  <label key={ch} className="flex items-center justify-between gap-4 px-4 py-3.5">
                    <span className="text-sm text-slate-500 capitalize">{ch} payslip alerts</span>
                    <input type="checkbox" checked={false} disabled className="h-4 w-4" />
                  </label>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

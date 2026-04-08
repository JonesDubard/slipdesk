"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Clock, Loader2, Lock, Unlock } from "lucide-react";

type Payment = {
  id:              string;
  amount:          number;
  month:           string;
  status:          "pending" | "confirmed" | "rejected";
  tier_requested:  string;
  receipt_note:    string | null;
  created_at:      string;
  rejected_reason: string | null;
  company_id:      string;
  companies: {
    name:                string;
    email:               string;
    admin_email:         string | null;
    subscription_tier:   string;
    subscription_status: string;
  } | null;
};

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TIER_COLOR: Record<string, string> = {
  basic:    "#3B82F6",
  standard: "#50C878",
  premium:  "#8B5CF6",
};

export default function AdminPaymentsPage() {
  const [payments,  setPayments]  = useState<Payment[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [working,   setWorking]   = useState<string | null>(null); // paymentId being actioned
  const [lockInput, setLockInput] = useState<Record<string, string>>({}); // companyId → reason

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/payments/pending");
    const data = await res.json();
    setPayments(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function action(paymentId: string, act: "confirm" | "reject", rejectedReason?: string) {
    setWorking(paymentId);
    await fetch("/api/admin/payments/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, action: act, rejectedReason }),
    });
    setWorking(null);
    load();
  }

  async function lockToggle(companyId: string, currentlyLocked: boolean) {
    const reason = lockInput[companyId] ?? "";
    await fetch("/api/admin/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        action: currentlyLocked ? "unlock" : "lock",
        reason,
      }),
    });
    load();
  }

  const pending   = payments.filter((p) => p.status === "pending");
  const completed = payments.filter((p) => p.status !== "pending");

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: "0 auto", fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>Admin — Payments</h1>
      <p style={{ color: "#64748B", fontSize: 13, margin: "0 0 28px" }}>
        Review and confirm MTN MoMo payment notifications from clients.
      </p>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}>
          <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "#50C878" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <>
          {/* Pending */}
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px" }}>
            Pending ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <div style={{
              padding: 32, textAlign: "center", background: "#F8FAFC",
              borderRadius: 16, border: "1px solid #E2E8F0", marginBottom: 32,
            }}>
              <CheckCircle2 size={28} color="#94A3B8" style={{ margin: "0 auto 8px" }} />
              <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>No pending payments</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 36 }}>
              {pending.map((p) => {
                const isLocked = false; // can't derive from payment alone — see completed section
                return (
                  <div key={p.id} style={{
                    background: "#fff", border: "2px solid #FCD34D",
                    borderRadius: 16, padding: 22,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                          <span style={{ fontWeight: 800, fontSize: 16 }}>{p.companies?.name ?? "Unknown"}</span>
                          <span style={{
                            background: (TIER_COLOR[p.tier_requested] ?? "#94A3B8") + "20",
                            color: TIER_COLOR[p.tier_requested] ?? "#94A3B8",
                            fontSize: 10, fontWeight: 700, padding: "2px 8px",
                            borderRadius: 20, textTransform: "uppercase",
                          }}>
                            {p.tier_requested}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: "#64748B", fontFamily: "'DM Mono',monospace" }}>
                          {p.companies?.email} · {p.month}
                        </p>
                        {p.receipt_note && (
                          <p style={{ margin: "8px 0 0", fontSize: 12, color: "#475569" }}>
                            <strong>MoMo TX ID:</strong> {p.receipt_note}
                          </p>
                        )}
                        <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94A3B8" }}>
                          Submitted: {new Date(p.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ margin: 0, fontSize: 24, fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                          {fmt(p.amount)}
                        </p>
                        <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
                          <button
                            onClick={() => action(p.id, "confirm")}
                            disabled={working === p.id}
                            style={{
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "9px 18px", borderRadius: 10,
                              background: "#50C878", color: "#002147",
                              fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer",
                            }}
                          >
                            {working === p.id ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={14} />}
                            Confirm
                          </button>
                          <button
                            onClick={() => action(p.id, "reject")}
                            disabled={working === p.id}
                            style={{
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "9px 18px", borderRadius: 10,
                              background: "#FEE2E2", color: "#991B1B",
                              fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer",
                            }}
                          >
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Lock/unlock inline */}
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #F1F5F9", display: "flex", gap: 10, alignItems: "center" }}>
                      <input
                        type="text"
                        placeholder="Lock reason (optional)"
                        value={lockInput[p.company_id] ?? ""}
                        onChange={(e) => setLockInput((prev) => ({ ...prev, [p.company_id]: e.target.value }))}
                        style={{
                          flex: 1, padding: "7px 12px",
                          border: "1px solid #E2E8F0", borderRadius: 8,
                          fontSize: 12, fontFamily: "'DM Mono',monospace",
                        }}
                      />
                      <button
                        onClick={() => lockToggle(p.company_id, false)}
                        style={{
                          display: "flex", alignItems: "center", gap: 5,
                          padding: "7px 14px", borderRadius: 8,
                          background: "#FEF2F2", color: "#991B1B",
                          fontWeight: 600, fontSize: 12, border: "none", cursor: "pointer",
                        }}
                      >
                        <Lock size={12} /> Lock account
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Completed */}
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px" }}>
            Recent ({completed.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {completed.map((p) => (
              <div key={p.id} style={{
                background: "#F8FAFC", border: "1px solid #E2E8F0",
                borderRadius: 14, padding: "16px 20px",
                display: "flex", justifyContent: "space-between",
                alignItems: "center", flexWrap: "wrap", gap: 10,
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    {p.status === "confirmed"
                      ? <CheckCircle2 size={14} color="#16A34A" />
                      : <XCircle size={14} color="#EF4444" />}
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{p.companies?.name}</span>
                    <span style={{ fontSize: 11, color: "#94A3B8" }}>· {p.month}</span>
                  </div>
                  {p.rejected_reason && (
                    <p style={{ margin: 0, fontSize: 11, color: "#EF4444" }}>Reason: {p.rejected_reason}</p>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700 }}>{fmt(p.amount)}</span>
                  <button
                    onClick={() => lockToggle(p.company_id, p.companies?.subscription_status === "active")}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "5px 12px", borderRadius: 8,
                      background: "#F1F5F9", color: "#475569",
                      fontWeight: 600, fontSize: 11, border: "none", cursor: "pointer",
                    }}
                  >
                    <Unlock size={11} /> Toggle Lock
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
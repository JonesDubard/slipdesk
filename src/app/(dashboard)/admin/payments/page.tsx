"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2, XCircle, Loader2,
  Lock, Unlock, AlertTriangle, RefreshCw,
} from "lucide-react";

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
    is_locked:           boolean;   // ← Bug 3 fix: was missing
  } | null;
};

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TIER_COLOR: Record<string, string> = {
  basic:    "#3B82F6",
  standard: "#50C878",
  premium:  "#8B5CF6",
};

const TIER_LIMITS: Record<string, string> = {
  basic:    "Up to 80 employees",
  standard: "Up to 499 employees",
  premium:  "Unlimited employees",
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 200,
      background: type === "success" ? "#F0FDF4" : "#FEF2F2",
      border: `2px solid ${type === "success" ? "#86EFAC" : "#FCA5A5"}`,
      borderRadius: 14, padding: "14px 20px",
      display: "flex", alignItems: "center", gap: 10,
      boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
      animation: "slideUp 0.25s ease",
      maxWidth: 380, fontFamily: "'DM Sans', sans-serif",
    }}>
      {type === "success"
        ? <CheckCircle2 size={16} color="#16A34A" style={{ flexShrink: 0 }} />
        : <AlertTriangle size={16} color="#EF4444" style={{ flexShrink: 0 }} />}
      <p style={{
        margin: 0, fontSize: 13, fontWeight: 600,
        color: type === "success" ? "#15803D" : "#DC2626",
      }}>
        {message}
      </p>
    </div>
  );
}

// ── Reject dialog ─────────────────────────────────────────────────────────────
function RejectDialog({ onConfirm, onCancel, working }: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  working: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 18, padding: 28,
        width: "100%", maxWidth: 420,
        boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 800, color: "#0F172A" }}>
          Reject this payment?
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748B" }}>
          Give a reason — the client will see this on their billing page so they know what to fix.
        </p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. Transaction ID not found in our MoMo records. Please resend with correct TX ID."
          rows={3}
          style={{
            width: "100%", padding: "10px 12px",
            border: "1px solid #E2E8F0", borderRadius: 10,
            fontSize: 13, resize: "vertical",
            boxSizing: "border-box",
            fontFamily: "'DM Sans', sans-serif",
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "11px", borderRadius: 10, cursor: "pointer",
              background: "transparent", border: "1px solid #E2E8F0",
              color: "#64748B", fontSize: 13, fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason.trim() || "Rejected by admin")}
            disabled={working}
            style={{
              flex: 2, padding: "11px", borderRadius: 10,
              cursor: working ? "not-allowed" : "pointer",
              background: working ? "#FCA5A5" : "#EF4444",
              border: "none", color: "#fff",
              fontSize: 13, fontWeight: 700,
              display: "flex", alignItems: "center",
              justifyContent: "center", gap: 6,
            }}
          >
            {working
              ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Rejecting…</>
              : <><XCircle size={14} /> Confirm Rejection</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminPaymentsPage() {
  const [payments,     setPayments]     = useState<Payment[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [working,      setWorking]      = useState<string | null>(null);
  const [lockWorking,  setLockWorking]  = useState<string | null>(null);
  const [lockInput,    setLockInput]    = useState<Record<string, string>>({});
  const [toast,        setToast]        = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
  }, []);

  // ── Load payments ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/admin/payments/pending");
      const data = await res.json();
      // Bug 1 fix: check response status
      if (!res.ok) {
        showToast(
          res.status === 403
            ? "Access denied. Make sure your account has the admin role in the profiles table."
            : `Failed to load payments: ${data.error ?? "Unknown error"}`,
          "error",
        );
        setPayments([]);
        return;
      }
      setPayments(Array.isArray(data) ? data : []);
    } catch {
      showToast("Network error — could not reach the server.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  // ── Confirm ────────────────────────────────────────────────────────────────
  async function handleConfirm(paymentId: string) {
    setWorking(paymentId);
    try {
      const res  = await fetch("/api/admin/payments/confirm", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ paymentId, action: "confirm" }),
      });
      const data = await res.json();

      // Bug 1 fix: actually check if it worked
      if (!res.ok) {
        showToast(`Confirm failed: ${data.error ?? "Unknown error"}`, "error");
        return;
      }

      // Optimistic update — no full reload needed
      setPayments(prev =>
        prev.map(p => p.id === paymentId ? { ...p, status: "confirmed" } : p)
      );
      showToast("✓ Payment confirmed. Account activated and email sent to client.", "success");
    } catch {
      showToast("Network error during confirm.", "error");
    } finally {
      setWorking(null);
    }
  }

  // ── Reject ─────────────────────────────────────────────────────────────────
  async function handleReject(paymentId: string, reason: string) {
    setWorking(paymentId);
    try {
      const res  = await fetch("/api/admin/payments/confirm", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ paymentId, action: "reject", rejectedReason: reason }),
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(`Reject failed: ${data.error ?? "Unknown error"}`, "error");
        return;
      }

      setPayments(prev =>
        prev.map(p =>
          p.id === paymentId
            ? { ...p, status: "rejected", rejected_reason: reason }
            : p
        )
      );
      showToast("Payment rejected. Client will see the reason on their billing page.", "error");
    } catch {
      showToast("Network error during reject.", "error");
    } finally {
      setWorking(null);
      setRejectTarget(null);
    }
  }

  // ── Lock / unlock ──────────────────────────────────────────────────────────
  async function handleLockToggle(companyId: string, currentlyLocked: boolean) {
    setLockWorking(companyId);
    try {
      const res  = await fetch("/api/admin/lock", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          companyId,
          // Bug 2 fix: use the actual currentlyLocked value
          action: currentlyLocked ? "unlock" : "lock",
          reason: lockInput[companyId] ?? "",
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(`Lock toggle failed: ${data.error ?? "Unknown error"}`, "error");
        return;
      }

      // Bug 2 fix: update is_locked in local state immediately
      setPayments(prev =>
        prev.map(p =>
          p.company_id === companyId && p.companies
            ? { ...p, companies: { ...p.companies, is_locked: !currentlyLocked } }
            : p
        )
      );
      setLockInput(prev => ({ ...prev, [companyId]: "" }));
      showToast(
        currentlyLocked ? "Account unlocked." : "Account locked.",
        currentlyLocked ? "success" : "error",
      );
    } catch {
      showToast("Network error during lock toggle.", "error");
    } finally {
      setLockWorking(null);
    }
  }

  const pending   = payments.filter(p => p.status === "pending");
  const completed = payments.filter(p => p.status !== "pending");

  return (
    <div style={{ padding: 32, maxWidth: 920, margin: "0 auto", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "#0F172A" }}>Admin — Payments</h1>
          <p style={{ color: "#64748B", fontSize: 13, margin: "4px 0 0" }}>
            Review MTN MoMo payment notifications · {pending.length} pending
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 10,
            border: "1px solid #E2E8F0", background: "#fff",
            color: "#64748B", fontSize: 13, cursor: "pointer",
          }}
        >
          <RefreshCw
            size={13}
            style={loading ? { animation: "spin 1s linear infinite" } : {}}
          />
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 80 }}>
          <Loader2 size={32} style={{ animation: "spin 1s linear infinite", color: "#50C878" }} />
        </div>
      ) : (
        <>
          {/* ── PENDING ─────────────────────────────────────────────────── */}
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 14px", color: "#0F172A" }}>
            Pending ({pending.length})
          </h2>

          {pending.length === 0 ? (
            <div style={{
              padding: 40, textAlign: "center", background: "#F8FAFC",
              borderRadius: 16, border: "1px solid #E2E8F0", marginBottom: 32,
            }}>
              <CheckCircle2 size={28} color="#CBD5E1" style={{ margin: "0 auto 8px" }} />
              <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>No pending payments</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 36 }}>
              {pending.map(p => {
                // Bug 2 fix: read actual lock state from data
                const isLocked  = p.companies?.is_locked ?? false;
                const tierColor = TIER_COLOR[p.tier_requested] ?? "#94A3B8";
                const isWorking = working === p.id;

                return (
                  <div key={p.id} style={{
                    background: "#fff", border: "2px solid #FCD34D",
                    borderRadius: 16, padding: 24,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
                      {/* Left: company info */}
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                          <span style={{ fontWeight: 800, fontSize: 16, color: "#0F172A" }}>
                            {p.companies?.name ?? "Unknown"}
                          </span>
                          <span style={{
                            background: tierColor + "20", color: tierColor,
                            fontSize: 10, fontWeight: 700, padding: "2px 9px",
                            borderRadius: 20, textTransform: "uppercase",
                          }}>
                            {p.tier_requested}
                          </span>
                          {isLocked && (
                            <span style={{
                              background: "#FEE2E2", color: "#991B1B",
                              fontSize: 10, fontWeight: 700,
                              padding: "2px 8px", borderRadius: 20,
                            }}>
                              LOCKED
                            </span>
                          )}
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: "#64748B", fontFamily: "'DM Mono',monospace" }}>
                          {p.companies?.email} · {p.month}
                        </p>
                        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94A3B8" }}>
                          {TIER_LIMITS[p.tier_requested] ?? ""} · Submitted {new Date(p.created_at).toLocaleString()}
                        </p>
                        {p.receipt_note ? (
                          <div style={{
                            marginTop: 10, padding: "7px 12px",
                            background: "#F0FDF4", borderRadius: 8,
                            border: "1px solid #BBF7D0", display: "inline-block",
                          }}>
                            <span style={{ fontSize: 11, color: "#166534", fontFamily: "'DM Mono',monospace" }}>
                              MoMo TX ID: <strong>{p.receipt_note}</strong>
                            </span>
                          </div>
                        ) : (
                          <p style={{ margin: "8px 0 0", fontSize: 11, color: "#F59E0B" }}>
                            ⚠ No TX ID provided — verify manually in MoMo before confirming.
                          </p>
                        )}
                      </div>

                      {/* Right: amount + action buttons */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
                        <p style={{
                          margin: 0, fontSize: 28, fontWeight: 800,
                          fontFamily: "'DM Mono',monospace", color: "#0F172A",
                        }}>
                          {fmt(p.amount)}
                        </p>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => handleConfirm(p.id)}
                            disabled={isWorking}
                            style={{
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "10px 20px", borderRadius: 10,
                              background: isWorking ? "#A7F3C4" : "#50C878",
                              color: "#002147", fontWeight: 700, fontSize: 13,
                              border: "none",
                              cursor: isWorking ? "not-allowed" : "pointer",
                              transition: "background 0.15s",
                            }}
                          >
                            {isWorking
                              ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                              : <CheckCircle2 size={14} />}
                            Confirm
                          </button>
                          <button
                            onClick={() => setRejectTarget(p.id)}
                            disabled={isWorking}
                            style={{
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "10px 16px", borderRadius: 10,
                              background: "#FEE2E2", color: "#991B1B",
                              fontWeight: 700, fontSize: 13, border: "none",
                              cursor: isWorking ? "not-allowed" : "pointer",
                            }}
                          >
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Lock/unlock strip */}
                    <div style={{
                      marginTop: 16, paddingTop: 14, borderTop: "1px solid #F1F5F9",
                      display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
                    }}>
                      <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600, flexShrink: 0 }}>
                        Account:
                      </span>
                      <input
                        type="text"
                        placeholder={isLocked ? "Reason to unlock (optional)" : "Reason to lock (optional)"}
                        value={lockInput[p.company_id] ?? ""}
                        onChange={e => setLockInput(prev => ({ ...prev, [p.company_id]: e.target.value }))}
                        style={{
                          flex: 1, minWidth: 180,
                          padding: "7px 12px", border: "1px solid #E2E8F0",
                          borderRadius: 8, fontSize: 12,
                          fontFamily: "'DM Mono',monospace", outline: "none",
                        }}
                      />
                      <button
                        onClick={() => handleLockToggle(p.company_id, isLocked)}
                        disabled={lockWorking === p.company_id}
                        style={{
                          display: "flex", alignItems: "center", gap: 5,
                          padding: "7px 14px", borderRadius: 8, border: "none",
                          background: isLocked ? "#F0FDF4" : "#FEF2F2",
                          color: isLocked ? "#15803D" : "#991B1B",
                          fontWeight: 600, fontSize: 12, cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        {lockWorking === p.company_id
                          ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                          : isLocked ? <Unlock size={12} /> : <Lock size={12} />}
                        {isLocked ? "Unlock" : "Lock"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── COMPLETED ───────────────────────────────────────────────── */}
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 14px", color: "#0F172A" }}>
            Recent ({completed.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {completed.length === 0 && (
              <p style={{ color: "#94A3B8", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
                No completed payments yet.
              </p>
            )}
            {completed.map(p => (
              <div key={p.id} style={{
                background: "#F8FAFC", border: "1px solid #E2E8F0",
                borderRadius: 14, padding: "16px 20px",
                display: "flex", justifyContent: "space-between",
                alignItems: "center", flexWrap: "wrap", gap: 10,
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    {p.status === "confirmed"
                      ? <CheckCircle2 size={14} color="#16A34A" />
                      : <XCircle size={14} color="#EF4444" />}
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#0F172A" }}>
                      {p.companies?.name}
                    </span>
                    <span style={{ fontSize: 11, color: "#94A3B8" }}>· {p.month}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      padding: "1px 7px", borderRadius: 20,
                      background: (TIER_COLOR[p.tier_requested] ?? "#94A3B8") + "20",
                      color: TIER_COLOR[p.tier_requested] ?? "#94A3B8",
                    }}>
                      {p.tier_requested}
                    </span>
                  </div>
                  {p.rejected_reason && (
                    <p style={{ margin: 0, fontSize: 11, color: "#EF4444" }}>
                      Reason: {p.rejected_reason}
                    </p>
                  )}
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94A3B8" }}>
                    {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{
                    fontFamily: "'DM Mono',monospace",
                    fontWeight: 700, fontSize: 15, color: "#0F172A",
                  }}>
                    {fmt(p.amount)}
                  </span>
                  <button
                    onClick={() => handleLockToggle(
                      p.company_id,
                      // Bug 2 fix: use actual lock state, not subscription_status comparison
                      p.companies?.is_locked ?? false,
                    )}
                    disabled={lockWorking === p.company_id}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "5px 12px", borderRadius: 8,
                      background: p.companies?.is_locked ? "#F0FDF4" : "#F1F5F9",
                      color: p.companies?.is_locked ? "#15803D" : "#475569",
                      fontWeight: 600, fontSize: 11, border: "none", cursor: "pointer",
                    }}
                  >
                    {p.companies?.is_locked ? <Unlock size={11} /> : <Lock size={11} />}
                    {p.companies?.is_locked ? "Unlock" : "Lock"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Reject dialog */}
      {rejectTarget && (
        <RejectDialog
          working={working === rejectTarget}
          onCancel={() => setRejectTarget(null)}
          onConfirm={reason => handleReject(rejectTarget, reason)}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
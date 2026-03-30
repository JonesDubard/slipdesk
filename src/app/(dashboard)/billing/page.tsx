"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  CreditCard, CheckCircle2, Clock, AlertTriangle,
  Users, DollarSign, ArrowRight, FileText, Zap,
  ShieldCheck, RefreshCw, TrendingUp,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import PageSkeleton from "@/components/PageSkeleton";
import {
  MOCK_MODE,
  PEPM_RATE_USD,
  generateReference,
  type BillingProfile,
  type PaymentRecord,
  type FlwPaymentResponse,
  type CheckoutPayload,
} from "@/lib/billing";

const FlutterwaveCheckout = dynamic(
  () => import("@/components/FlutterwaveCheckout"),
  { ssr: false },
);

const DEMO_USER = { email: "admin@slipdesk.lr", name: "Admin User", phone: "+231770000001" };
const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-LR", { year: "numeric", month: "short", day: "numeric" }) : "—";
const LRD_DISPLAY_RATE = 185.44;

const TIERS = [
  { count: 5,   label: "Starter"  },
  { count: 10,  label: "Small"    },
  { count: 25,  label: "Growing"  },
  { count: 50,  label: "Mid-size" },
  { count: 100, label: "Large"    },
];

const STATUS_COLOR: Record<string, string> = {
  success: "var(--primary)",
  failed:  "var(--destructive)",
  pending: "var(--warning)",
};

function PlanBadge({ planId }: { planId: BillingProfile["planId"] }) {
  const map: Record<string, { color: string; bg: string; label: string }> = {
    trial:     { color: "var(--secondary)", bg: "color-mix(in oklch, var(--secondary) 15%, transparent)", label: "Free Trial"  },
    active:    { color: "var(--primary)", bg: "color-mix(in oklch, var(--primary) 15%, transparent)", label: "Active"      },
    past_due:  { color: "var(--destructive)", bg: "color-mix(in oklch, var(--destructive) 15%, transparent)", label: "Past Due"    },
    cancelled: { color: "var(--muted-foreground)", bg: "color-mix(in oklch, var(--muted-foreground) 15%, transparent)", label: "Cancelled"   },
  };
  const s = map[planId];
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono',monospace",
      padding: "3px 10px", borderRadius: 20,
      color: s.color, background: s.bg, border: `1px solid ${s.color}40`,
    }}>
      {s.label}
    </span>
  );
}

export default function BillingPage() {
  const { employees, company, loading } = useApp();

  const [planId,          setPlanId]          = useState<BillingProfile["planId"]>("trial");
  const [paymentHistory,  setPaymentHistory]  = useState<PaymentRecord[]>([]);
  const [totalPaid,       setTotalPaid]       = useState(0);
  const [nextBillingDate, setNextBillingDate] = useState<string | null>(null);
  const [showCheckout,    setShowCheckout]    = useState(false);
  const [checkoutPayload, setCheckoutPayload] = useState<CheckoutPayload | null>(null);

  const activeCount  = employees.filter((e) => e.isActive).length;
  const monthlyTotal = useMemo(() => Math.round(activeCount * PEPM_RATE_USD * 100) / 100, [activeCount]);

  if (loading) return <PageSkeleton/>;

  const billingBypassed = company?.billingBypass === true;
  const companyDisplay  = company?.name || "Your Company";
  const currentMonth    = new Date().toLocaleString("default", { month: "long", year: "numeric" });
  const onTrial         = planId === "trial";
  const daysLeft: number = 30;

  function handlePayNow() {
    const payload: CheckoutPayload = {
      amount:      monthlyTotal,
      currency:    "USD",
      email:       DEMO_USER.email,
      name:        DEMO_USER.name,
      phone:       DEMO_USER.phone,
      reference:   generateReference("SLIP"),
      description: `Slipdesk PEPM — ${activeCount} employee${activeCount !== 1 ? "s" : ""} @ $${PEPM_RATE_USD}/emp`,
      employees:   activeCount,
      periodLabel: currentMonth,
    };
    setCheckoutPayload(payload);
    setShowCheckout(true);
  }

  function handlePaymentSuccess(response: FlwPaymentResponse) {
    const record: PaymentRecord = {
      id:          String(response.transaction_id),
      date:        new Date().toISOString(),
      amount:      response.amount,
      currency:    response.currency,
      employees:   activeCount,
      status:      "success",
      reference:   response.tx_ref,
      method:      "Card",
      periodLabel: currentMonth,
    };
    setPlanId("active");
    setTotalPaid((p) => p + response.amount);
    setPaymentHistory((p) => [record, ...p]);
    setNextBillingDate(() => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      return d.toISOString();
    });
  }

  return (
    <div style={{ padding: "32px", minHeight: "100vh", background: "var(--background)", fontFamily: "'DM Sans',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;600&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <div style={{ marginBottom: 28, animation: "fadeUp 0.3s ease" }}>
        <h1 style={{ color: "var(--foreground)", fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Billing</h1>
        <p style={{ color: "var(--muted-foreground)", fontSize: 13, marginTop: 5, fontFamily: "'DM Mono',monospace" }}>
          {companyDisplay} · {fmt(PEPM_RATE_USD)}/employee/month · Early adopter rate
          {MOCK_MODE && (
            <span style={{ marginLeft: 10, fontSize: 10, background: "color-mix(in oklch, var(--warning) 20%, transparent)", color: "var(--warning)", border: "1px solid color-mix(in oklch, var(--warning) 30%, transparent)", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>
              Demo Mode
            </span>
          )}
        </p>
      </div>

      <div style={{
        display: "flex", alignItems: "flex-start", gap: 12,
        background: "color-mix(in oklch, var(--primary) 12%, transparent)", border: "1px solid color-mix(in oklch, var(--primary) 30%, transparent)",
        borderRadius: 14, padding: "14px 18px", marginBottom: 16,
        animation: "fadeUp 0.35s ease 0.05s both",
      }}>
        <TrendingUp size={15} color="var(--primary)" style={{ flexShrink: 0, marginTop: 2 }}/>
        <p style={{ color: "var(--primary)", fontSize: 13, margin: 0 }}>
          <strong>Early adopter pricing locked at {fmt(PEPM_RATE_USD)}/employee/month.</strong>{" "}
          <span style={{ color: "color-mix(in oklch, var(--primary) 50%, transparent)" }}>
            Rate is guaranteed as long as your subscription stays active. Pay only for what you use — no minimums, no contracts.
          </span>
        </p>
      </div>

      {!billingBypassed && onTrial && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 14,
          background: "color-mix(in oklch, var(--secondary) 15%, transparent)", border: "1px solid color-mix(in oklch, var(--secondary) 30%, transparent)",
          borderRadius: 14, padding: "16px 18px", marginBottom: 16,
          animation: "fadeUp 0.4s ease 0.1s both",
        }}>
          <Zap size={16} color="var(--secondary)" style={{ flexShrink: 0, marginTop: 2 }}/>
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--secondary)", fontWeight: 700, fontSize: 13, margin: "0 0 3px" }}>
              Free trial — {daysLeft} {daysLeft !== 1 ? "days" : "day"} remaining
            </p>
            <p style={{ color: "color-mix(in oklch, var(--secondary) 50%, transparent)", fontSize: 12, margin: 0 }}>
              Your first pay run is on us. After that:{" "}
              <strong style={{ color: "var(--secondary)" }}>{fmt(PEPM_RATE_USD)} per active employee per month</strong>
              {activeCount > 0 && <> — that&apos;s <strong style={{ color: "var(--secondary)" }}>{fmt(monthlyTotal)}/month</strong> for your {activeCount} employee{activeCount !== 1 ? "s" : ""}</>}.
            </p>
          </div>
          <button onClick={handlePayNow} disabled={activeCount === 0} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 16px", borderRadius: 10, border: "none",
            background: "var(--secondary)", color: "var(--secondary-foreground)",
            fontSize: 12, fontWeight: 700, cursor: activeCount === 0 ? "not-allowed" : "pointer",
            opacity: activeCount === 0 ? 0.4 : 1, flexShrink: 0, transition: "opacity 0.15s",
          }}>
            Activate <ArrowRight size={13}/>
          </button>
        </div>
      )}

      {!billingBypassed && planId === "past_due" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          background: "color-mix(in oklch, var(--destructive) 15%, transparent)", border: "1px solid color-mix(in oklch, var(--destructive) 30%, transparent)",
          borderRadius: 14, padding: "14px 18px", marginBottom: 16,
        }}>
          <AlertTriangle size={15} color="var(--destructive)"/>
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--destructive)", fontWeight: 700, fontSize: 13, margin: 0 }}>Payment overdue</p>
            <p style={{ color: "color-mix(in oklch, var(--destructive) 50%, transparent)", fontSize: 12, margin: 0 }}>Your account is past due. Pay now to restore full access.</p>
          </div>
          <button onClick={handlePayNow} style={{
            padding: "9px 16px", borderRadius: 10, border: "none",
            background: "var(--destructive)", color: "var(--destructive-foreground)", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
            Pay now
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20, animation: "fadeUp 0.4s ease 0.1s both" }}>
        {[
          { label: "Plan",          value: <PlanBadge planId={planId}/>, sub: undefined,            icon: <ShieldCheck size={13} color="var(--muted-foreground)"/> },
          { label: "This Month",    value: activeCount > 0 ? fmt(monthlyTotal) : "$0.00",
            sub: activeCount > 0 ? `≈ L$${(monthlyTotal * LRD_DISPLAY_RATE).toFixed(2)}` : "Add employees to calculate",
            accent: true, icon: <DollarSign size={13} color="var(--primary)"/> },
          { label: "Active Employees", value: activeCount,
            sub: `${employees.length} total · ${employees.length - activeCount} inactive`,
            icon: <Users size={13} color="var(--muted-foreground)"/> },
          { label: "Total Paid",    value: fmt(totalPaid), sub: "lifetime", icon: <CreditCard size={13} color="var(--muted-foreground)"/> },
        ].map((card, i) => (
          <div key={i} style={{
            background: (card as any).accent ? "color-mix(in oklch, var(--primary) 15%, var(--card))" : "var(--card)",
            border: "1px solid var(--border)", borderRadius: 16, padding: "18px 20px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <p style={{
                fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
                fontFamily: "'DM Mono',monospace",
                color: (card as any).accent ? "color-mix(in oklch, var(--foreground) 60%, transparent)" : "var(--muted-foreground)", margin: 0,
              }}>{card.label}</p>
              <div style={{
                width: 26, height: 26, borderRadius: 7,
                background: (card as any).accent ? "color-mix(in oklch, var(--foreground) 10%, transparent)" : "color-mix(in oklch, var(--primary) 15%, transparent)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {card.icon}
              </div>
            </div>
            <div style={{
              fontSize: typeof card.value === "string" ? 20 : 14,
              fontWeight: 800, fontFamily: "'DM Mono',monospace",
              color: (card as any).accent ? "var(--primary)" : "var(--foreground)",
              marginBottom: 6, lineHeight: 1,
            }}>
              {card.value}
            </div>
            {card.sub && (
              <p style={{ fontSize: 11, color: (card as any).accent ? "color-mix(in oklch, var(--foreground) 40%, transparent)" : "var(--muted-foreground)", fontFamily: "'DM Mono',monospace", margin: 0 }}>{card.sub}</p>
            )}
          </div>
        ))}
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "24px", marginBottom: 16, animation: "fadeUp 0.45s ease 0.15s both" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <p style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 15, margin: "0 0 3px" }}>Current billing cycle</p>
            <p style={{ color: "var(--muted-foreground)", fontSize: 12, margin: 0, fontFamily: "'DM Mono',monospace" }}>{currentMonth}</p>
          </div>
          {planId !== "trial" && nextBillingDate && (
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 10, color: "var(--muted-foreground)", fontFamily: "'DM Mono',monospace", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Next billing date</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>{fmtDate(nextBillingDate)}</p>
            </div>
          )}
        </div>

        <div style={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
          {[
            { label: "Active employees", value: String(activeCount) },
            { label: "Rate per employee", value: `${fmt(PEPM_RATE_USD)} / month` },
          ].map((row) => (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: "var(--muted-foreground)", fontSize: 13 }}>{row.label}</span>
              <span style={{ color: "var(--foreground)", fontWeight: 600, fontSize: 13, fontFamily: "'DM Mono',monospace" }}>{row.value}</span>
            </div>
          ))}
          <div style={{ height: 1, background: "var(--border)", margin: "12px 0" }}/>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--muted-foreground)", fontWeight: 700, fontSize: 14 }}>Monthly total</span>
            <div style={{ textAlign: "right" }}>
              <p style={{ color: "var(--primary)", fontWeight: 800, fontSize: 20, fontFamily: "'DM Mono',monospace", margin: 0 }}>
                {activeCount > 0 ? fmt(monthlyTotal) : "$0.00"}
              </p>
              {activeCount > 0 && (
                <p style={{ color: "var(--muted-foreground)", fontSize: 10, fontFamily: "'DM Mono',monospace", margin: 0 }}>
                  ≈ L${(monthlyTotal * LRD_DISPLAY_RATE).toFixed(2)}
                </p>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 10, color: "var(--muted-foreground)", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>
            Pricing reference — {fmt(PEPM_RATE_USD)}/employee · no minimum
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
            {TIERS.map((tier, i) => {
              const prevMax       = [0, 5, 10, 25, 50][i];
              const isCurrentTier = activeCount <= tier.count && activeCount > prevMax;
              return (
                <div key={tier.count} style={{
                  borderRadius: 10, padding: "10px 8px", textAlign: "center",
                  background: isCurrentTier ? "color-mix(in oklch, var(--primary) 15%, var(--card))" : "var(--background)",
                  border: `1px solid ${isCurrentTier ? "var(--primary)" : "var(--border)"}`,
                  transition: "all 0.2s",
                }}>
                  <p style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: isCurrentTier ? "var(--primary)" : "var(--muted-foreground)", margin: "0 0 3px" }}>{tier.label}</p>
                  <p style={{ fontSize: 13, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: isCurrentTier ? "var(--foreground)" : "var(--muted-foreground)", margin: "0 0 2px" }}>
                    {fmt(tier.count * PEPM_RATE_USD)}/mo
                  </p>
                  <p style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: isCurrentTier ? "color-mix(in oklch, var(--primary) 50%, transparent)" : "var(--border)", margin: 0 }}>{tier.count} emp</p>
                </div>
              );
            })}
          </div>
        </div>

        {billingBypassed ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "color-mix(in oklch, var(--primary) 12%, transparent)", border: "1px solid color-mix(in oklch, var(--primary) 30%, transparent)",
            borderRadius: 12, padding: "14px 18px",
          }}>
            <CheckCircle2 size={16} color="var(--primary)"/>
            <div>
              <p style={{ color: "var(--primary)", fontWeight: 700, fontSize: 13, margin: 0 }}>Billing managed by Slipdesk</p>
              <p style={{ color: "color-mix(in oklch, var(--primary) 50%, transparent)", fontSize: 12, margin: 0 }}>Your account has unlimited access. No payment required.</p>
            </div>
          </div>
        ) : (
          <>
            <button onClick={handlePayNow} disabled={activeCount === 0} style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "14px", borderRadius: 12, border: "none",
              background: activeCount > 0 ? "var(--accent)" : "color-mix(in oklch, var(--accent) 40%, transparent)",
              color: "var(--accent-foreground)", fontWeight: 800, fontSize: 14, cursor: activeCount === 0 ? "not-allowed" : "pointer",
              transition: "opacity 0.15s",
            }}
              onMouseEnter={(e) => { if (activeCount > 0) e.currentTarget.style.opacity = "0.88"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
              <CreditCard size={16}/>
              {activeCount > 0 ? `Pay ${fmt(monthlyTotal)} via Flutterwave` : "Add employees to calculate your bill"}
            </button>
            <p style={{ textAlign: "center", fontSize: 11, color: "var(--muted-foreground)", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <ShieldCheck size={12} color="var(--muted-foreground)"/> Secured by Flutterwave · Card, Orange Money & Bank Transfer
            </p>
          </>
        )}
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "24px", marginBottom: 16, animation: "fadeUp 0.5s ease 0.2s both" }}>
        <p style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 15, margin: "0 0 16px" }}>What&apos;s included</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            "Unlimited pay runs per month",
            "LRA Income Tax auto-calculation",
            "NASSCORP compliance built-in",
            "Dual-currency USD & LRD",
            "CSV bulk employee import",
            "PDF payslip generation",
            "Company logo on all payslips",
            "Email support",
          ].map((f) => (
            <div key={f} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <CheckCircle2 size={13} color="var(--primary)" style={{ flexShrink: 0 }}/>
              <span style={{ color: "var(--muted-foreground)", fontSize: 13 }}>{f}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "24px", marginBottom: 16, animation: "fadeUp 0.55s ease 0.25s both" }}>
        <p style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 15, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={14} color="var(--muted-foreground)"/> Payment History
        </p>
        {paymentHistory.length === 0 ? (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <FileText size={28} color="var(--border)" style={{ margin: "0 auto 10px", display: "block" }}/>
            <p style={{ color: "var(--muted-foreground)", fontSize: 13 }}>No payments yet</p>
            <p style={{ color: "var(--border)", fontSize: 11, fontFamily: "'DM Mono',monospace" }}>Your payment history will appear here after your first payment</p>
          </div>
        ) : (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 100px 80px", gap: 14, paddingBottom: 10, borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
              {["Date","Period","Employees","Amount","Status"].map((h) => (
                <p key={h} style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{h}</p>
              ))}
            </div>
            {paymentHistory.map((record) => (
              <div key={record.id} style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 80px 100px 80px",
                gap: 14, padding: "12px 0", borderBottom: "1px solid var(--background)",
                alignItems: "center",
              }}>
                <p style={{ fontSize: 12, fontFamily: "'DM Mono',monospace", color: "var(--muted-foreground)", margin: 0 }}>{fmtDate(record.date)}</p>
                <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>{record.periodLabel}</p>
                <p style={{ fontSize: 12, fontFamily: "'DM Mono',monospace", color: "var(--muted-foreground)", margin: 0 }}>{record.employees}</p>
                <p style={{ fontSize: 12, fontFamily: "'DM Mono',monospace", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>{fmt(record.amount)}</p>
                <span style={{
                  fontSize: 10, fontFamily: "'DM Mono',monospace", fontWeight: 700,
                  padding: "2px 8px", borderRadius: 20,
                  color: STATUS_COLOR[record.status],
                  background: `color-mix(in oklch, ${STATUS_COLOR[record.status]} 15%, transparent)`,
                  border: `1px solid color-mix(in oklch, ${STATUS_COLOR[record.status]} 30%, transparent)`,
                }}>
                  {record.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {MOCK_MODE && (
        <div style={{
          background: "color-mix(in oklch, var(--warning) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--warning) 30%, transparent)",
          borderRadius: 16, padding: "20px 22px", animation: "fadeUp 0.6s ease 0.3s both",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <RefreshCw size={16} color="var(--warning)" style={{ flexShrink: 0, marginTop: 2 }}/>
            <div>
              <p style={{ color: "var(--warning)", fontWeight: 700, fontSize: 13, margin: "0 0 6px" }}>Ready to go live?</p>
              <p style={{ color: "color-mix(in oklch, var(--warning) 50%, transparent)", fontSize: 12, margin: "0 0 10px" }}>Running in demo mode — no real charges are made. To accept real payments:</p>
              <ol style={{ color: "color-mix(in oklch, var(--warning) 50%, transparent)", fontSize: 11, paddingLeft: 16, margin: 0 }}>
                {[
                  "Sign up at flutterwave.com and complete KYB verification",
                  "Get your live API keys from the Flutterwave dashboard",
                  "Set MOCK_MODE = false in src/lib/billing.ts",
                  "Add NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY to .env.local",
                ].map((step, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}

      {showCheckout && checkoutPayload && (
        <FlutterwaveCheckout
          payload={checkoutPayload}
          onSuccess={(res) => { handlePaymentSuccess(res); setShowCheckout(false); }}
          onClose={() => setShowCheckout(false)}
        />
      )}
    </div>
  );
}
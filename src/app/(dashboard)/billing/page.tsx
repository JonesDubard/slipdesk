"use client";

import { useMemo, useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import PageSkeleton from "@/components/PageSkeleton";
import {
  CheckCircle2, Users, DollarSign, ShieldCheck,
  Clock, AlertTriangle, Lock, ChevronDown, ChevronUp,
  Copy, Check, Loader2, ExternalLink,
} from "lucide-react";

// ─── Plan definitions with CORRECT per-tier features ─────────────────────────
const PLANS = [
  {
    id:    "basic" as const,
    name:  "Basic",
    price: 50,
    max:   80,
    label: "Up to 80 employees",
    color: "#3B82F6",
    popular: false,
    features: [
      "Up to 80 active employees",
      "Unlimited pay runs per month",
      "LRA income tax auto-calculation",
      "NASSCORP compliance built-in",
      "PDF payslip generation",
      "CSV bulk employee import",
      "Email support (48hr response)",
    ],
  },
  {
    id:    "standard" as const,
    name:  "Standard",
    price: 300,
    max:   499,
    label: "Up to 499 employees",
    color: "#50C878",
    popular: true,
    features: [
      "Up to 499 active employees",
      "Everything in Basic",
      "Dual-currency USD & LRD payroll",
      "Company logo on all payslips",
      "Priority email support (24hr)",
      "Bulk payslip download",
      "Department-level reporting",
    ],
  },
  {
    id:    "premium" as const,
    name:  "Premium",
    price: 500,
    max:   Infinity,
    label: "Unlimited employees",
    color: "#8B5CF6",
    popular: false,
    features: [
      "Unlimited active employees",
      "Everything in Standard",
      "Dedicated account manager",
      "Custom onboarding session",
      "Priority phone support",
      "Custom report exports",
      "Multi-location support",
    ],
  },
] as const;

type PlanId = "basic" | "standard" | "premium";

// ─── MTN MoMo number (yours — update this) ────────────────────────────────────
const SLIPDESK_MOMO_NUMBER = "0881936033"; // Dee's MTN MoMo number for testing — replace with my own when I have MTN
const SLIPDESK_MOMO_NAME   = "Slipdesk";

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Small reusable components ────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      title="Copy"
      style={{
        background: "none", border: "none", cursor: "pointer",
        padding: "2px 6px", borderRadius: 6,
        color: copied ? "var(--primary)" : "var(--muted-foreground)",
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: 12, transition: "color 0.2s",
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    trial:      { bg: "#FEF3C7", color: "#92400E", label: "Trial"      },
    active:     { bg: "#D1FAE5", color: "#065F46", label: "Active"     },
    past_due:   { bg: "#FEE2E2", color: "#991B1B", label: "Past Due"   },
    cancelled:  { bg: "#F3F4F6", color: "#6B7280", label: "Cancelled"  },
  };
  const s = map[status] ?? map.trial;
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 700,
      padding: "2px 10px", borderRadius: 20,
      letterSpacing: "0.04em", textTransform: "uppercase",
    }}>
      {s.label}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function BillingPage() {
  const { employees, company, loading } = useApp();

  const activeCount = useMemo(
    () => employees.filter((e) => e.isActive).length,
    [employees]
  );

  // Which plan card is selected in the UI (default to company's current tier)
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(
    company.subscriptionTier ?? "basic"
  );
  // Payment flow state
  const [payStep,      setPayStep]      = useState<"idle" | "instructions" | "submitting" | "done">("idle");
  const [receiptNote,  setReceiptNote]  = useState("");
  const [submitError,  setSubmitError]  = useState("");
  const [pendingPayment, setPendingPayment] = useState<{ id: string; amount: number; month: string } | null>(null);
  // FAQ accordion
  const [openFaq,      setOpenFaq]      = useState<string | null>(null);
  const [faqs,         setFaqs]         = useState<{ id: string; question: string; answer: string }[]>([]);

  // Load FAQs
  useEffect(() => {
    fetch("/api/faqs")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setFaqs(data); })
      .catch(() => {});
  }, []);

  // Keep selectedPlan in sync once company loads
  useEffect(() => {
    if (company.subscriptionTier) setSelectedPlan(company.subscriptionTier);
  }, [company.subscriptionTier]);

  if (loading) return <PageSkeleton />;

  const companyName    = company.name || "Your Company";
  const billingBypass  = company.billingBypass;
  const isLocked       = company.isLocked;
  const currentPlan    = PLANS.find((p) => p.id === company.subscriptionTier) ?? PLANS[0];
  const chosenPlan     = PLANS.find((p) => p.id === selectedPlan) ?? PLANS[0];

  // Trial expiry helpers
  const trialExpiry    = company.trialExpiresAt ? new Date(company.trialExpiresAt) : null;
  const trialDaysLeft  = trialExpiry
    ? Math.max(0, Math.ceil((trialExpiry.getTime() - Date.now()) / 86_400_000))
    : 0;
  const onTrial        = company.subscriptionStatus === "trial" && trialDaysLeft > 0;

  // ── Handlers ────────────────────────────────────────────────────────────────
  async function handleStartPayment() {
    setSubmitError("");
    setPayStep("instructions");

    // Create a pending payment record immediately
    try {
      const res = await fetch("/api/payments/manual", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tierRequested: selectedPlan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create payment");
      setPendingPayment({ id: data.paymentId, amount: data.amount, month: data.month });
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
      setPayStep("idle");
    }
  }

  async function handleConfirmPayment() {
    if (!pendingPayment) return;
    setPayStep("submitting");
    setSubmitError("");
    try {
      const res = await fetch("/api/payments/confirm", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: pendingPayment.id, receiptNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit");
      setPayStep("done");
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
      setPayStep("instructions");
    }
  }

  // ── Locked state ─────────────────────────────────────────────────────────
  if (isLocked) {
    return (
      <div style={{ padding: 32, maxWidth: 600, margin: "0 auto", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{
          background: "#FEF2F2", border: "2px solid #FCA5A5",
          borderRadius: 20, padding: 40, textAlign: "center",
        }}>
          <Lock size={40} color="#EF4444" style={{ margin: "0 auto 16px" }} />
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#991B1B", margin: "0 0 8px" }}>
            Account Locked
          </h2>
          <p style={{ color: "#7F1D1D", fontSize: 14, margin: "0 0 20px" }}>
            {company.lockedReason || "Your account has been locked. Please contact support to resolve this."}
          </p>
          <a
            href="mailto:helloslipdesk@gmail.com"
            style={{
              display: "inline-block", padding: "12px 28px",
              background: "#EF4444", color: "#fff",
              borderRadius: 10, fontWeight: 700, fontSize: 14,
              textDecoration: "none",
            }}
          >
            Contact Support
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", maxWidth: 900, margin: "0 auto", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;600&display=swap');
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        .plan-card { transition: all 0.18s ease; cursor: pointer; }
        .plan-card:hover { transform: translateY(-2px); }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28, animation: "fadeUp 0.3s ease" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.02em", color: "var(--foreground)" }}>
              Billing
            </h1>
            <p style={{ color: "var(--muted-foreground)", fontSize: 13, marginTop: 5, fontFamily: "'DM Mono',monospace" }}>
              {companyName} · {activeCount} active employee{activeCount !== 1 ? "s" : ""}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StatusBadge status={company.subscriptionStatus} />
            {onTrial && (
              <span style={{
                background: "#FEF3C7", color: "#92400E",
                fontSize: 11, fontWeight: 600, padding: "3px 10px",
                borderRadius: 20, display: "flex", alignItems: "center", gap: 5,
              }}>
                <Clock size={11} /> {trialDaysLeft}d left
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Billing bypass banner */}
      {billingBypass && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          background: "color-mix(in oklch, var(--primary) 12%, transparent)",
          border: "1px solid color-mix(in oklch, var(--primary) 30%, transparent)",
          borderRadius: 14, padding: "16px 20px", marginBottom: 24,
        }}>
          <CheckCircle2 size={18} color="var(--primary)" />
          <div>
            <p style={{ color: "var(--primary)", fontWeight: 700, fontSize: 13, margin: 0 }}>
              Billing managed by Slipdesk
            </p>
            <p style={{ color: "color-mix(in oklch, var(--primary) 60%, transparent)", fontSize: 12, margin: "2px 0 0" }}>
              Your account has unlimited access. No payment required.
            </p>
          </div>
        </div>
      )}

      {/* Trial warning */}
      {onTrial && !billingBypass && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 12,
          background: "#FFFBEB", border: "1px solid #FCD34D",
          borderRadius: 14, padding: "14px 18px", marginBottom: 24,
        }}>
          <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ color: "#92400E", fontWeight: 700, fontSize: 13, margin: 0 }}>
              Trial ends in {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""}
            </p>
            <p style={{ color: "#B45309", fontSize: 12, margin: "3px 0 0" }}>
              Subscribe before your trial expires to keep running payroll without interruption.
            </p>
          </div>
        </div>
      )}

      {/* Current plan summary */}
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 16, padding: "18px 22px", marginBottom: 28,
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: currentPlan.color + "20",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <ShieldCheck size={20} color={currentPlan.color} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted-foreground)", fontFamily: "'DM Mono',monospace" }}>CURRENT PLAN</p>
            <p style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 800, color: "var(--foreground)" }}>
              {currentPlan.name}
              <span style={{ fontSize: 13, fontWeight: 400, color: "var(--muted-foreground)", marginLeft: 6 }}>
                {fmt(currentPlan.price)}/mo
              </span>
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--foreground)", fontFamily: "'DM Mono',monospace" }}>
              {activeCount}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: "var(--muted-foreground)" }}>Active employees</p>
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--foreground)", fontFamily: "'DM Mono',monospace" }}>
              {fmt(currentPlan.price)}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: "var(--muted-foreground)" }}>Monthly fee</p>
          </div>
        </div>
      </div>

      {/* Plan selector — only show when not on bypass */}
      {!billingBypass && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px", color: "var(--foreground)" }}>
            {company.subscriptionStatus === "active" ? "Change plan" : "Choose your plan"}
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 28 }}>
            {PLANS.map((plan) => {
              const isSelected = selectedPlan === plan.id;
              const isCurrent  = company.subscriptionTier === plan.id;
              return (
                <div
                  key={plan.id}
                  className="plan-card"
                  onClick={() => { setSelectedPlan(plan.id); setPayStep("idle"); }}
                  style={{
                    background:   isSelected ? plan.color + "15" : "var(--card)",
                    border:       isSelected ? `2px solid ${plan.color}` : "2px solid var(--border)",
                    borderRadius: 16, padding: 20, position: "relative",
                  }}
                >
                  {plan.popular && (
                    <div style={{
                      position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                      background: plan.color, color: "#fff",
                      fontSize: 10, fontWeight: 700, padding: "3px 12px",
                      borderRadius: 20, whiteSpace: "nowrap", letterSpacing: "0.06em",
                    }}>
                      MOST POPULAR
                    </div>
                  )}
                  <div style={{ fontSize: 15, fontWeight: 800, color: "var(--foreground)", marginBottom: 6 }}>
                    {plan.name}
                  </div>
                  <div style={{ fontFamily: "'DM Mono',monospace" }}>
                    <span style={{ fontSize: 26, fontWeight: 800, color: isSelected ? plan.color : "var(--foreground)" }}>
                      ${plan.price}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>/mo</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", margin: "6px 0 14px" }}>
                    {plan.label}
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {plan.features.map((f) => (
                      <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 6 }}>
                        <CheckCircle2 size={12} color={plan.color} style={{ flexShrink: 0, marginTop: 2 }} />
                        <span style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.4 }}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  {isCurrent && (
                    <div style={{
                      marginTop: 12, fontSize: 11, fontWeight: 700,
                      color: plan.color, textAlign: "center",
                    }}>
                      ✓ Current plan
                    </div>
                  )}
                  {isSelected && !isCurrent && (
                    <div style={{
                      marginTop: 12, fontSize: 11, fontWeight: 700,
                      color: plan.color, textAlign: "center",
                    }}>
                      ● Selected
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Payment flow */}
          {payStep === "idle" && (
            <div style={{
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 16, padding: 24,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>
                    {chosenPlan.name} Plan — {fmt(chosenPlan.price)}/month
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>
                    Pay via MTN Mobile Money · Manual confirmation within 24hrs
                  </p>
                </div>
                <button
                  onClick={handleStartPayment}
                  style={{
                    padding: "12px 28px", borderRadius: 10,
                    background: chosenPlan.color, color: "#fff",
                    fontWeight: 700, fontSize: 14, border: "none",
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  Pay with Mobile Money
                </button>
              </div>
            </div>
          )}

          {payStep === "instructions" && pendingPayment && (
            <div style={{
              background: "var(--card)", border: "2px solid #50C878",
              borderRadius: 16, padding: 28,
            }}>
              <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 800, color: "var(--foreground)" }}>
                📱 Send your Mobile Money payment
              </h3>

              {/* Step-by-step instructions */}
              {[
                {
                  n: "1",
                  title: "Dial *126*1# on your phone",
                  body: "Go to Send Money or Pay Merchant.",
                },
                {
                  n: "2",
                  title: "Send payment to this number",
                  body: (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <code style={{
                        background: "#F0FDF4", border: "1px solid #BBF7D0",
                        padding: "6px 14px", borderRadius: 8,
                        fontSize: 18, fontWeight: 800, letterSpacing: 2, color: "#15803D",
                        fontFamily: "'DM Mono',monospace",
                      }}>
                        {SLIPDESK_MOMO_NUMBER}
                      </code>
                      <CopyButton text={SLIPDESK_MOMO_NUMBER} />
                      <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>({SLIPDESK_MOMO_NAME})</span>
                    </div>
                  ),
                },
                {
                  n: "3",
                  title: "Amount to send",
                  body: (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <code style={{
                        background: "#F0FDF4", border: "1px solid #BBF7D0",
                        padding: "6px 14px", borderRadius: 8,
                        fontSize: 18, fontWeight: 800, color: "#15803D",
                        fontFamily: "'DM Mono',monospace",
                      }}>
                        {fmt(pendingPayment.amount)}
                      </code>
                      <CopyButton text={String(pendingPayment.amount)} />
                    </div>
                  ),
                },
                {
                  n: "4",
                  title: "Use your company name as the reference",
                  body: `Type "${companyName}" in the note/reference field.`,
                },
              ].map((step) => (
                <div key={step.n} style={{ display: "flex", gap: 16, marginBottom: 20 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: "#50C878", color: "#002147",
                    fontWeight: 800, fontSize: 13, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {step.n}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "var(--foreground)" }}>{step.title}</p>
                    {typeof step.body === "string"
                      ? <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>{step.body}</p>
                      : step.body}
                  </div>
                </div>
              ))}

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20, marginTop: 4 }}>
                <label style={{ display: "block", fontWeight: 700, fontSize: 13, color: "var(--foreground)", marginBottom: 8 }}>
                  After paying — enter your MoMo transaction ID
                  <span style={{ fontWeight: 400, color: "var(--muted-foreground)", marginLeft: 6 }}>(optional but speeds up confirmation)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1234567890"
                  value={receiptNote}
                  onChange={(e) => setReceiptNote(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 14px",
                    border: "1px solid var(--border)", borderRadius: 10,
                    fontSize: 14, background: "var(--background)",
                    color: "var(--foreground)", boxSizing: "border-box",
                    fontFamily: "'DM Mono',monospace",
                  }}
                />
                {submitError && (
                  <p style={{ color: "#EF4444", fontSize: 12, marginTop: 8 }}>{submitError}</p>
                )}
                <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                  <button
                    onClick={handleConfirmPayment}
                    style={{
                      padding: "11px 24px", borderRadius: 10,
                      background: "#50C878", color: "#002147",
                      fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer",
                    }}
                  >
                    I have paid — notify Slipdesk
                  </button>
                  <button
                    onClick={() => { setPayStep("idle"); setPendingPayment(null); }}
                    style={{
                      padding: "11px 20px", borderRadius: 10,
                      border: "1px solid var(--border)", background: "none",
                      color: "var(--muted-foreground)", fontSize: 14, cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {payStep === "submitting" && (
            <div style={{
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 16, padding: 40, textAlign: "center",
            }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                <Loader2 size={32} className="animate-spin" color="var(--primary)" />
              </div>
              <p style={{ fontSize: 14, color: "var(--muted-foreground)", margin: 0 }}>
                Submitting your payment notification…
              </p>
            </div>
          )}

          {payStep === "done" && (
            <div style={{
              background: "#F0FDF4", border: "2px solid #86EFAC",
              borderRadius: 16, padding: 32, textAlign: "center",
            }}>
              <CheckCircle2 size={40} color="#16A34A" style={{ margin: "0 auto 14px" }} />
              <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: "#14532D" }}>
                Payment notification sent!
              </h3>
              <p style={{ color: "#166534", fontSize: 13, margin: "0 0 6px" }}>
                We&apos;ll confirm your payment and activate your <strong>{chosenPlan.name}</strong> plan within <strong>24 hours</strong>.
              </p>
              <p style={{ color: "#15803D", fontSize: 12, margin: 0 }}>
                You&apos;ll receive a confirmation email at {company.email || "your registered email"}.
              </p>
            </div>
          )}
        </>
      )}

      {/* FAQ Section */}
      {faqs.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px", color: "var(--foreground)" }}>
            Frequently Asked Questions
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {faqs.map((faq) => (
              <div
                key={faq.id}
                style={{
                  background: "var(--card)", border: "1px solid var(--border)",
                  borderRadius: 14, overflow: "hidden",
                }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === faq.id ? null : faq.id)}
                  style={{
                    width: "100%", padding: "16px 20px",
                    background: "none", border: "none",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{faq.question}</span>
                  {openFaq === faq.id
                    ? <ChevronUp size={16} color="var(--muted-foreground)" />
                    : <ChevronDown size={16} color="var(--muted-foreground)" />}
                </button>
                {openFaq === faq.id && (
                  <div style={{ padding: "0 20px 18px", fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contact */}
      <div style={{
        marginTop: 32, padding: "18px 22px",
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 14, display: "flex", alignItems: "center",
        justifyContent: "space-between", flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>Need help with billing?</p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted-foreground)" }}>
            Email us at helloslipdesk@gmail.com — we respond within 24 hours.
          </p>
        </div>
        <a
          href="mailto:helloslipdesk@gmail.com"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "9px 18px", borderRadius: 10,
            border: "1px solid var(--border)", color: "var(--foreground)",
            fontWeight: 600, fontSize: 13, textDecoration: "none",
          }}
        >
          <ExternalLink size={13} /> Email Support
        </a>
      </div>
    </div>
  );
}
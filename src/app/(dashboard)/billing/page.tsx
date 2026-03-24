"use client";

/**
 * Slipdesk — Billing Page
 * Place at: src/app/(dashboard)/billing/page.tsx
 *
 * Pricing: $0.75 PEPM · No minimum — early adopter rate
 */

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  CreditCard, CheckCircle2, Clock, AlertTriangle,
  Users, DollarSign, ArrowRight, FileText, Zap,
  ShieldCheck, RefreshCw, TrendingUp,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEMO_USER = { email: "admin@slipdesk.lr", name: "Admin User", phone: "+231770000001" };

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-LR", { year: "numeric", month: "short", day: "numeric" })
    : "—";

const LRD_DISPLAY_RATE = 185.44;

const STATUS_STYLES: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700",
  failed:  "bg-red-100 text-red-700",
  pending: "bg-amber-100 text-amber-700",
};

function PlanBadge({ planId }: { planId: BillingProfile["planId"] }) {
  const map: Record<string, { style: string; label: string }> = {
    trial:     { style: "bg-blue-100 text-blue-700",       label: "Free Trial"  },
    active:    { style: "bg-emerald-100 text-emerald-700", label: "Active"      },
    past_due:  { style: "bg-red-100 text-red-700",         label: "Past Due"    },
    cancelled: { style: "bg-slate-100 text-slate-500",     label: "Cancelled"   },
  };
  const { style, label } = map[planId];
  return (
    <span className={`text-xs font-mono font-semibold px-3 py-1 rounded-full ${style}`}>
      {label}
    </span>
  );
}

const TIERS = [
  { count: 5,   label: "Starter"  },
  { count: 10,  label: "Small"    },
  { count: 25,  label: "Growing"  },
  { count: 50,  label: "Mid-size" },
  { count: 100, label: "Large"    },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { employees, company } = useApp();
  const activeCount    = employees.filter((e) => e.isActive).length;
  const billingBypassed = company?.billingBypass === true; 
  const companyDisplay = company?.name || "Your Company";

  const [planId,          setPlanId]          = useState<BillingProfile["planId"]>("trial");
  const [paymentHistory,  setPaymentHistory]  = useState<PaymentRecord[]>([]);
  const [totalPaid,       setTotalPaid]       = useState(0);
  const [nextBillingDate, setNextBillingDate] = useState<string | null>(null);
  const [showCheckout,    setShowCheckout]    = useState(false);
  const [checkoutPayload, setCheckoutPayload] = useState<CheckoutPayload | null>(null);

  // $0.75 × employees, no floor
  const monthlyTotal = useMemo(
    () => Math.round(activeCount * PEPM_RATE_USD * 100) / 100,
    [activeCount],
  );

  const currentMonth = new Date().toLocaleString("default", { month: "long", year: "numeric" });
  const onTrial      = planId === "trial";

  // ✅ Fix: typed as number so daysLeft !== 1 comparison works correctly
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
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Billing</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          {companyDisplay} · {fmt(PEPM_RATE_USD)}/employee/month · Early adopter rate
          {MOCK_MODE && (
            <span className="ml-2 text-xs bg-amber-100 text-amber-600 font-mono px-2 py-0.5 rounded-full">
              Demo Mode
            </span>
          )}
        </p>
      </div>

      {/* Early adopter notice */}
      <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4">
        <TrendingUp className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
        <p className="text-emerald-700 text-xs leading-relaxed">
          <span className="font-semibold">
            Early adopter pricing locked at {fmt(PEPM_RATE_USD)}/employee/month.
          </span>{" "}
          This rate is guaranteed for your account as long as your subscription stays active.
          Pay only for what you use — no minimums, no contracts.
        </p>
      </div>
      
      
      {/* Trial banner */}
      {!billingBypassed && onTrial && (
        <div className="flex items-start gap-4 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4">
          <Zap className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-blue-800 text-sm">
              Free trial — {daysLeft} {daysLeft !== 1 ? "days" : "day"} remaining
            </p>
            <p className="text-blue-600 text-xs mt-0.5 leading-relaxed">
              Your first pay run is on us. After that:{" "}
              <strong>{fmt(PEPM_RATE_USD)} per active employee per month</strong>
              {activeCount > 0 && (
                <>
                  {" "}— that&apos;s{" "}
                  <strong>{fmt(monthlyTotal)}/month</strong> for your{" "}
                  {activeCount} employee{activeCount !== 1 ? "s" : ""}
                </>
              )}
            
              . No minimum charge.
            </p>
          </div>
          <button
            onClick={handlePayNow}
            disabled={activeCount === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl
                       bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40
                       disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            Activate <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
     
      {/* Past due banner */}
      {!billingBypassed && planId === "past_due" && (
        <div className="flex items-start gap-4 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-red-800 text-sm">Payment overdue</p>
            <p className="text-red-600 text-xs mt-0.5">
              Your account is past due. Pay now to restore full access.
            </p>
          </div>
          <button
            onClick={handlePayNow}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 whitespace-nowrap"
          >
            Pay now
          </button>
        </div>
      )}

      {/* No employees */}
      {activeCount === 0 && (
        <div className="flex items-start gap-4 bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4">
          <Users className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-slate-700 text-sm">No active employees yet</p>
            <p className="text-slate-500 text-xs mt-0.5">
              Add employees on the <strong>Employees</strong> page and your bill will update automatically.
            </p>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-mono text-slate-400 uppercase tracking-wider">Plan</p>
            <ShieldCheck className="w-4 h-4 text-slate-300" />
          </div>
          <PlanBadge planId={planId} />
        </div>

        <div className="bg-[#002147] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-mono text-white/40 uppercase tracking-wider">This Month</p>
            <DollarSign className="w-4 h-4 text-[#50C878]" />
          </div>
          <p className="text-xl font-bold font-mono text-white">
            {activeCount > 0 ? fmt(monthlyTotal) : "$0.00"}
          </p>
          <p className="text-xs text-white/40 mt-0.5">
            {activeCount > 0
              ? `≈ L$${(monthlyTotal * LRD_DISPLAY_RATE).toFixed(2)}`
              : "Add employees to calculate"}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-mono text-slate-400 uppercase tracking-wider">Active</p>
            <Users className="w-4 h-4 text-slate-300" />
          </div>
          <p className="text-xl font-bold font-mono text-slate-800">{activeCount}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {employees.length} total · {employees.length - activeCount} inactive
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-mono text-slate-400 uppercase tracking-wider">Total Paid</p>
            <CreditCard className="w-4 h-4 text-slate-300" />
          </div>
          <p className="text-xl font-bold font-mono text-slate-800">{fmt(totalPaid)}</p>
          <p className="text-xs text-slate-400 mt-0.5">lifetime</p>
        </div>
      </div>

      {/* Billing breakdown */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div>
            <h2 className="font-semibold text-slate-800">Current billing cycle</h2>
            <p className="text-slate-400 text-sm mt-0.5">{currentMonth}</p>
          </div>
          {planId !== "trial" && nextBillingDate && (
            <div className="text-right">
              <p className="text-xs text-slate-400 font-mono">Next billing date</p>
              <p className="text-sm font-semibold text-slate-700">{fmtDate(nextBillingDate)}</p>
            </div>
          )}
        </div>

        <div className="bg-slate-50 rounded-xl p-5 space-y-3 mb-5">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600">Active employees</span>
            <span className="font-mono font-semibold text-slate-800">{activeCount}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600">Rate per employee</span>
            <span className="font-mono font-semibold text-slate-800">{fmt(PEPM_RATE_USD)} / month</span>
          </div>
          <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
            <span className="font-semibold text-slate-700">Monthly total</span>
            <div className="text-right">
              <p className="font-mono font-bold text-[#002147] text-lg">
                {activeCount > 0 ? fmt(monthlyTotal) : "$0.00"}
              </p>
              {activeCount > 0 && (
                <p className="text-xs text-slate-400 font-mono">
                  ≈ L${(monthlyTotal * LRD_DISPLAY_RATE).toFixed(2)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Pricing reference */}
        <div className="mb-5">
          <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-3">
            Pricing reference — {fmt(PEPM_RATE_USD)}/employee · no minimum
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {TIERS.map((tier, i) => {
              const prevMax       = [0, 5, 10, 25, 50][i];
              const isCurrentTier = activeCount <= tier.count && activeCount > prevMax;
              const tierFee       = tier.count * PEPM_RATE_USD;
              return (
                <div
                  key={tier.count}
                  className={`rounded-xl px-3 py-2.5 text-center border transition-all
                    ${isCurrentTier ? "bg-[#002147] border-[#002147]" : "bg-white border-slate-200"}`}
                >
                  <p className={`text-xs font-mono ${isCurrentTier ? "text-[#50C878]" : "text-slate-400"}`}>
                    {tier.label}
                  </p>
                  <p className={`font-bold font-mono text-sm ${isCurrentTier ? "text-white" : "text-slate-700"}`}>
                    {fmt(tierFee)}/mo
                  </p>
                  <p className={`text-[10px] font-mono ${isCurrentTier ? "text-white/50" : "text-slate-400"}`}>
                    {tier.count} emp
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {billingBypassed ? (
  <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4">
    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
    <div>
      <p className="font-semibold text-emerald-800 text-sm">Billing managed by Slipdesk</p>
      <p className="text-emerald-600 text-xs mt-0.5">
        Your account has unlimited access. No payment required.
      </p>
    </div>
  </div>
) : (
  <button
    onClick={handlePayNow}
    disabled={activeCount === 0}
    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl
               bg-[#F5A623] text-white font-bold hover:bg-[#e09415]
               disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
  >
    <CreditCard className="w-4 h-4" />
    {activeCount > 0
      ? `Pay ${fmt(monthlyTotal)} via Flutterwave`
      : "Add employees to calculate your bill"}
  </button>
)}
        <p className="text-center text-xs text-slate-400 mt-3 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3 h-3" />
          Secured by Flutterwave · Card, Orange Money &amp; Bank Transfer
        </p>
      </div>

      {/* What's included */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-800 mb-4">What&apos;s included</h2>
        <div className="grid sm:grid-cols-2 gap-3">
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
            <div key={f} className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#50C878] flex-shrink-0" />
              <span className="text-sm text-slate-600">{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Payment history */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-800 mb-5 flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" /> Payment History
        </h2>
        {paymentHistory.length === 0 ? (
          <div className="text-center py-10">
            <FileText className="w-8 h-8 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No payments yet</p>
            <p className="text-slate-300 text-xs mt-1">
              Your payment history will appear here after your first payment
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-5 gap-4 px-3 pb-2 border-b border-slate-100">
              {["Date", "Period", "Employees", "Amount", "Status"].map((h) => (
                <p key={h} className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  {h}
                </p>
              ))}
            </div>
            {paymentHistory.map((record) => (
              <div
                key={record.id}
                className="grid grid-cols-5 gap-4 px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors items-center"
              >
                <p className="text-xs text-slate-600 font-mono">{fmtDate(record.date)}</p>
                <p className="text-xs text-slate-600">{record.periodLabel}</p>
                <p className="text-xs font-mono text-slate-600">{record.employees}</p>
                <p className="text-xs font-mono font-semibold text-slate-800">{fmt(record.amount)}</p>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full w-fit ${STATUS_STYLES[record.status]}`}>
                  {record.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Go-live note */}
      {MOCK_MODE && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <RefreshCw className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 text-sm">Ready to go live?</p>
              <p className="text-amber-600 text-xs mt-1">
                Running in demo mode — no real charges are made. To accept real payments:
              </p>
              <ol className="text-amber-600 text-xs mt-2 space-y-1 list-decimal list-inside">
                <li>Sign up at flutterwave.com and complete KYB verification</li>
                <li>Get your live API keys from the Flutterwave dashboard</li>
                <li>
                  Set{" "}
                  <code className="bg-amber-100 px-1 rounded">MOCK_MODE = false</code> in{" "}
                  <code className="bg-amber-100 px-1 rounded">src/lib/billing.ts</code>
                </li>
                <li>
                  Add{" "}
                  <code className="bg-amber-100 px-1 rounded">NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY</code> to{" "}
                  <code className="bg-amber-100 px-1 rounded">.env.local</code>
                </li>
                <li>
                  Create{" "}
                  <code className="bg-amber-100 px-1 rounded">src/app/api/billing/verify/route.ts</code> for
                  server-side verification
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Checkout modal */}
      {showCheckout && checkoutPayload && (
        <FlutterwaveCheckout
          payload={checkoutPayload}
          onSuccess={(res) => {
            handlePaymentSuccess(res);
            setShowCheckout(false);
          }}
          onClose={() => setShowCheckout(false)}
        />
      )}
    </div>
  );
}
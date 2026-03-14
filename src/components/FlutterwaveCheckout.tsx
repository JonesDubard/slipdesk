"use client";

/**
 * Slipdesk — FlutterwaveCheckout
 * Mock payment modal that mirrors the real Flutterwave inline checkout.
 * When MOCK_MODE = false, this is replaced by the real Flutterwave JS SDK popup.
 *
 * Paste into: src/components/FlutterwaveCheckout.tsx
 */

import { useState } from "react";
import {
  X,
  CreditCard,
  Smartphone,
  Building2,
  CheckCircle2,
  XCircle,
  Loader,
  ShieldCheck,
  ChevronRight,
  Lock,
} from "lucide-react";
import {
  MOCK_MODE,
  LIBERIA_PAYMENT_METHODS,
  mockFlutterwavePayment,
  verifyTransaction,
  type CheckoutPayload,
  type FlwPaymentResponse,
} from "@/lib/billing";

// ─── Types ────────────────────────────────────────────────────────────────────

type CheckoutStep = "method" | "details" | "processing" | "success" | "failed";

// ─── Method icons ─────────────────────────────────────────────────────────────

const METHOD_ICONS = {
  card:                CreditCard,
  mobile_money_franco: Smartphone,
  ussd:                Building2,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function FlutterwaveCheckout({
  payload,
  onSuccess,
  onClose,
}: {
  payload:   CheckoutPayload;
  onSuccess: (response: FlwPaymentResponse) => void;
  onClose:   () => void;
}) {
  const [step,          setStep]          = useState<CheckoutStep>("method");
  const [selectedMethod,setSelectedMethod]= useState<string>("card");
  const [cardNumber,    setCardNumber]    = useState("4111 1111 1111 1111");
  const [cardExpiry,    setCardExpiry]    = useState("12/26");
  const [cardCvv,       setCardCvv]       = useState("123");
  const [cardName,      setCardName]      = useState(payload.name);
  const [mobileNumber,  setMobileNumber]  = useState("");
  const [response,      setResponse]      = useState<FlwPaymentResponse | null>(null);
  const [error,         setError]         = useState("");

  async function handlePay() {
    setStep("processing");
    setError("");

    try {
      const res = await mockFlutterwavePayment(payload);
      setResponse(res);

      if (res.status === "successful") {
        const verify = await verifyTransaction(res.transaction_id, payload.amount);
        if (verify.verified) {
          setStep("success");
          onSuccess(res);
        } else {
          setError("Payment received but verification failed. Contact support.");
          setStep("failed");
        }
      } else {
        setError("Payment was not completed. Please try again.");
        setStep("failed");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStep("failed");
    }
  }

  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={step === "processing" ? undefined : onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* ── Header ── */}
        <div className="bg-[#F5A623] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Flutterwave-style logo mark */}
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
              <span className="text-[#F5A623] font-black text-sm">fw</span>
            </div>
            <div>
              <p className="text-white font-bold text-sm">
                {MOCK_MODE ? "Flutterwave (Demo)" : "Flutterwave"}
              </p>
              <p className="text-white/70 text-xs">Secure payment</p>
            </div>
          </div>
          {step !== "processing" && (
            <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* ── Amount summary ── */}
        <div className="bg-[#FFF8EC] border-b border-amber-100 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 font-mono">{payload.description}</p>
              <p className="text-slate-700 text-sm font-medium mt-0.5">{payload.periodLabel}</p>
            </div>
            <p className="text-2xl font-black text-[#002147]">{fmt(payload.amount)}</p>
          </div>
          {MOCK_MODE && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-100 rounded-lg px-3 py-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
              Demo mode — no real charges will be made
            </div>
          )}
        </div>

        {/* ── Step: method selection ── */}
        {step === "method" && (
          <div className="px-6 py-5">
            <p className="text-sm font-semibold text-slate-700 mb-4">Choose payment method</p>
            <div className="space-y-2">
              {LIBERIA_PAYMENT_METHODS.map((method) => {
                const Icon = METHOD_ICONS[method.id as keyof typeof METHOD_ICONS] ?? CreditCard;
                const selected = selectedMethod === method.id;
                return (
                  <button
                    key={method.id}
                    onClick={() => setSelectedMethod(method.id)}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border-2 transition-all text-left
                      ${selected
                        ? "border-[#F5A623] bg-amber-50"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
                      ${selected ? "bg-[#F5A623]/20" : "bg-slate-100"}`}>
                      <Icon className={`w-4 h-4 ${selected ? "text-[#F5A623]" : "text-slate-400"}`} />
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${selected ? "text-slate-800" : "text-slate-600"}`}>
                        {method.label}
                      </p>
                      <p className="text-xs text-slate-400">{method.note}</p>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0
                      ${selected ? "border-[#F5A623] bg-[#F5A623]" : "border-slate-300"}`}>
                      {selected && <div className="w-full h-full rounded-full bg-white scale-50 transform" />}
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setStep("details")}
              className="mt-5 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl
                         bg-[#F5A623] text-white font-bold hover:bg-[#e09415] transition-colors"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Step: payment details ── */}
        {step === "details" && (
          <div className="px-6 py-5 space-y-4">
            <button
              onClick={() => setStep("method")}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              ← Change method
            </button>

            {/* Card fields */}
            {selectedMethod === "card" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                    Card Number
                  </label>
                  <input
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="1234 5678 9012 3456"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl
                               focus:outline-none focus:ring-2 focus:ring-[#F5A623] font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                      Expiry
                    </label>
                    <input
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      placeholder="MM/YY"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl
                                 focus:outline-none focus:ring-2 focus:ring-[#F5A623] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                      CVV
                    </label>
                    <input
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value)}
                      placeholder="123"
                      type="password"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl
                                 focus:outline-none focus:ring-2 focus:ring-[#F5A623] font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                    Name on Card
                  </label>
                  <input
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    placeholder="Full name"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl
                               focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
                  />
                </div>
              </div>
            )}

            {/* Mobile money fields */}
            {selectedMethod === "mobile_money_franco" && (
              <div className="space-y-3">
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-orange-800 mb-1">Orange Money</p>
                  <p className="text-xs text-orange-600">
                    Enter your Orange Money number. You'll receive a USSD prompt to approve the payment.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                    Mobile Number
                  </label>
                  <input
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="+231 770 000 000"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl
                               focus:outline-none focus:ring-2 focus:ring-[#F5A623] font-mono"
                  />
                </div>
              </div>
            )}

            {/* Bank transfer */}
            {selectedMethod === "ussd" && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-blue-800">Bank Transfer</p>
                <p className="text-xs text-blue-600">
                  After clicking Pay, you'll receive bank account details to transfer exactly{" "}
                  <strong>{fmt(payload.amount)}</strong> using your bank's mobile app or internet banking.
                </p>
                <p className="text-xs text-blue-500 font-mono">
                  Reference: {payload.reference}
                </p>
              </div>
            )}

            <button
              onClick={handlePay}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl
                         bg-[#F5A623] text-white font-bold hover:bg-[#e09415] transition-colors"
            >
              <Lock className="w-4 h-4" />
              Pay {fmt(payload.amount)}
            </button>

            <div className="flex items-center justify-center gap-1.5 text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="text-xs">256-bit SSL encrypted</span>
            </div>
          </div>
        )}

        {/* ── Step: processing ── */}
        {step === "processing" && (
          <div className="px-6 py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
              <Loader className="w-8 h-8 text-[#F5A623] animate-spin" />
            </div>
            <p className="font-semibold text-slate-800 text-base mb-1">Processing payment…</p>
            <p className="text-slate-400 text-sm">Please wait. Do not close this window.</p>
            {MOCK_MODE && (
              <p className="text-xs text-amber-500 font-mono mt-4">Simulating Flutterwave API…</p>
            )}
          </div>
        )}

        {/* ── Step: success ── */}
        {step === "success" && response && (
          <div className="px-6 py-10 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-9 h-9 text-emerald-500" />
            </div>
            <p className="font-bold text-slate-800 text-lg mb-1">Payment Successful!</p>
            <p className="text-slate-400 text-sm mb-6">
              {fmt(response.amount)} received. Your subscription is active.
            </p>
            <div className="bg-slate-50 rounded-xl p-4 text-left space-y-2 mb-6">
              {[
                { label: "Transaction ID", value: response.transaction_id },
                { label: "Reference",      value: response.tx_ref },
                { label: "Amount",         value: fmt(response.amount) },
                { label: "Status",         value: "Successful ✓" },
              ].map((r) => (
                <div key={r.label} className="flex justify-between text-sm">
                  <span className="text-slate-400 font-mono text-xs">{r.label}</span>
                  <span className="text-slate-700 font-mono text-xs font-medium">{r.value}</span>
                </div>
              ))}
            </div>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-[#002147] text-white font-semibold text-sm
                         hover:bg-[#002147]/80 transition-colors"
            >
              Back to Billing
            </button>
          </div>
        )}

        {/* ── Step: failed ── */}
        {step === "failed" && (
          <div className="px-6 py-10 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-9 h-9 text-red-500" />
            </div>
            <p className="font-bold text-slate-800 text-lg mb-1">Payment Failed</p>
            <p className="text-slate-400 text-sm mb-6">{error}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("details")}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm
                           font-medium hover:bg-slate-50 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-[#002147] text-white text-sm font-semibold
                           hover:bg-[#002147]/80 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
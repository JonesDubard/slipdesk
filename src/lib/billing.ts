/**
 * Slipdesk — Billing Logic & Mock Flutterwave Integration
 * =========================================================
 * HOW TO GO LIVE:
 * 1. Sign up at https://flutterwave.com and get your API keys
 * 2. Replace FLUTTERWAVE_CONFIG.publicKey with your real public key
 * 3. Set MOCK_MODE = false
 * 4. Add your secret key to .env.local as FLUTTERWAVE_SECRET_KEY
 * 5. That's it — all the logic below stays the same.
 *
 * Paste into: src/lib/billing.ts
 */

// ─── Toggle this to go live ───────────────────────────────────────────────────
export const MOCK_MODE = true;

// ─── Flutterwave config ───────────────────────────────────────────────────────
export const FLUTTERWAVE_CONFIG = {
  publicKey:   MOCK_MODE ? "FLWPUBK_TEST-MOCK-KEY" : process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY!,
  redirectUrl: typeof window !== "undefined" ? `${window.location.origin}/billing/callback` : "",
  currency:    "USD" as const,
  country:     "LR"  as const,
};

// ─── PEPM pricing ─────────────────────────────────────────────────────────────
// Early adopter rate — will move to $1.00 once traction is established
export const PEPM_RATE_USD   = 0.75;
export const TRIAL_RUNS      = 1;
export const FREE_TRIAL_DAYS = 30;

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlanId = "trial" | "active" | "past_due" | "cancelled";

export interface BillingProfile {
  planId:              PlanId;
  activeEmployees:     number;
  trialRunsUsed:       number;
  trialRunsAllowed:    number;
  trialExpiresAt:      string;
  lastPaymentDate:     string | null;
  lastPaymentAmount:   number | null;
  nextBillingDate:     string | null;
  totalPaid:           number;
  paymentHistory:      PaymentRecord[];
}

export interface PaymentRecord {
  id:           string;
  date:         string;
  amount:       number;
  currency:     string;
  employees:    number;
  status:       "success" | "failed" | "pending";
  reference:    string;
  method:       string;
  periodLabel:  string;
}

export interface CheckoutPayload {
  amount:       number;
  currency:     string;
  email:        string;
  name:         string;
  phone:        string;
  reference:    string;
  description:  string;
  employees:    number;
  periodLabel:  string;
}

// ─── Calculations ─────────────────────────────────────────────────────────────

/** $0.75 per active employee — no minimum floor during early adopter phase */
export function calcMonthlyFee(activeEmployees: number): number {
  return Math.round(activeEmployees * PEPM_RATE_USD * 100) / 100;
}

export function calcFeeBreakdown(activeEmployees: number) {
  const total = calcMonthlyFee(activeEmployees);
  return {
    activeEmployees,
    ratePerEmployee: PEPM_RATE_USD,
    totalUSD:        total,
    totalLRD:        Math.round(total * 185.44 * 100) / 100,
  };
}

export function isOnTrial(profile: BillingProfile): boolean {
  if (profile.planId !== "trial") return false;
  const expiry = new Date(profile.trialExpiresAt);
  return expiry > new Date() && profile.trialRunsUsed < profile.trialRunsAllowed;
}

export function trialDaysRemaining(profile: BillingProfile): number {
  const expiry = new Date(profile.trialExpiresAt);
  const now    = new Date();
  const diff   = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

export function generateReference(prefix = "SLIP"): string {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

// ─── Mock Flutterwave ─────────────────────────────────────────────────────────

export interface FlwPaymentResponse {
  status:         "successful" | "cancelled" | "failed";
  tx_ref:         string;
  transaction_id: string;
  amount:         number;
  currency:       string;
  customer: {
    email: string;
    name:  string;
  };
}

export async function mockFlutterwavePayment(
  payload: CheckoutPayload
): Promise<FlwPaymentResponse> {
  await new Promise((r) => setTimeout(r, 2000));
  const success = Math.random() > 0.1;
  if (!success) {
    return {
      status: "failed", tx_ref: payload.reference,
      transaction_id: `MOCK-FAIL-${Date.now()}`,
      amount: payload.amount, currency: payload.currency,
      customer: { email: payload.email, name: payload.name },
    };
  }
  return {
    status: "successful", tx_ref: payload.reference,
    transaction_id: `MOCK-TXN-${Date.now()}`,
    amount: payload.amount, currency: payload.currency,
    customer: { email: payload.email, name: payload.name },
  };
}

export async function verifyTransaction(
  transactionId: string,
  expectedAmount: number
): Promise<{ verified: boolean; message: string }> {
  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 500));
    return { verified: true, message: "Mock verification passed" };
  }
  try {
    const res = await fetch(`/api/billing/verify?id=${transactionId}&amount=${expectedAmount}`);
    return await res.json();
  } catch {
    return { verified: false, message: "Verification request failed" };
  }
}

// ─── Mock billing profile ─────────────────────────────────────────────────────

const TRIAL_EXPIRY = new Date();
TRIAL_EXPIRY.setDate(TRIAL_EXPIRY.getDate() + FREE_TRIAL_DAYS);

export const MOCK_BILLING_PROFILE: BillingProfile = {
  planId:             "trial",
  activeEmployees:    6,
  trialRunsUsed:      0,
  trialRunsAllowed:   TRIAL_RUNS,
  trialExpiresAt:     TRIAL_EXPIRY.toISOString(),
  lastPaymentDate:    null,
  lastPaymentAmount:  null,
  nextBillingDate:    null,
  totalPaid:          0,
  paymentHistory:     [],
};

// ─── Payment methods available in Liberia via Flutterwave ────────────────────
export const LIBERIA_PAYMENT_METHODS = [
  { id: "card",                label: "Credit / Debit Card", note: "Visa, Mastercard",        icon: "💳" },
  { id: "mobile_money_franco", label: "Orange Money",        note: "Liberia mobile money",    icon: "📱" },
  { id: "ussd",                label: "Bank Transfer",       note: "Local Liberian banks",    icon: "🏦" },
] as const;

export function hasBillingBypass(profile: { billing_bypass?: boolean }): boolean {
  return profile?.billing_bypass === true;
}
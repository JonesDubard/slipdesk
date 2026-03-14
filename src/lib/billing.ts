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
// Replace with your real keys from https://dashboard.flutterwave.com/settings/apis
export const FLUTTERWAVE_CONFIG = {
  publicKey:   MOCK_MODE ? "FLWPUBK_TEST-MOCK-KEY" : process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY!,
  redirectUrl: typeof window !== "undefined" ? `${window.location.origin}/billing/callback` : "",
  currency:    "USD" as const,
  country:     "LR"  as const,  // Liberia
};

// ─── PEPM pricing ─────────────────────────────────────────────────────────────
export const PEPM_RATE_USD   = 1.50;
export const TRIAL_RUNS      = 1;     // number of free pay runs before billing starts
export const FREE_TRIAL_DAYS = 30;

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlanId = "trial" | "active" | "past_due" | "cancelled";

export interface BillingProfile {
  planId:              PlanId;
  activeEmployees:     number;
  trialRunsUsed:       number;
  trialRunsAllowed:    number;
  trialExpiresAt:      string;       // ISO date
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

/**
 * In MOCK_MODE this simulates the full Flutterwave payment flow:
 *   1. Shows a fake payment modal (handled in FlutterwaveCheckout.tsx)
 *   2. Returns a mock transaction response after a delay
 *
 * When MOCK_MODE = false this calls the real Flutterwave inline JS SDK.
 * The response shape is identical either way.
 */
export interface FlwPaymentResponse {
  status:       "successful" | "cancelled" | "failed";
  tx_ref:       string;
  transaction_id: string;
  amount:       number;
  currency:     string;
  customer: {
    email: string;
    name:  string;
  };
}

export async function mockFlutterwavePayment(
  payload: CheckoutPayload
): Promise<FlwPaymentResponse> {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 2000));

  // 90% success rate in mock mode so you can see both states
  const success = Math.random() > 0.1;

  if (!success) {
    return {
      status:         "failed",
      tx_ref:         payload.reference,
      transaction_id: `MOCK-FAIL-${Date.now()}`,
      amount:         payload.amount,
      currency:       payload.currency,
      customer:       { email: payload.email, name: payload.name },
    };
  }

  return {
    status:         "successful",
    tx_ref:         payload.reference,
    transaction_id: `MOCK-TXN-${Date.now()}`,
    amount:         payload.amount,
    currency:       payload.currency,
    customer:       { email: payload.email, name: payload.name },
  };
}

/**
 * Verifies a transaction server-side.
 * In MOCK_MODE: returns mock verification.
 * In LIVE mode: calls your Next.js API route which calls Flutterwave's verify endpoint.
 *
 * HOW TO GO LIVE:
 * Create src/app/api/billing/verify/route.ts and call:
 * GET https://api.flutterwave.com/v3/transactions/{id}/verify
 * with Authorization: Bearer FLUTTERWAVE_SECRET_KEY
 */
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
// In production this comes from Supabase profiles table.

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
  {
    id:    "card",
    label: "Credit / Debit Card",
    note:  "Visa, Mastercard",
    icon:  "💳",
  },
  {
    id:    "mobile_money_franco",
    label: "Orange Money",
    note:  "Liberia mobile money",
    icon:  "📱",
  },
  {
    id:    "ussd",
    label: "Bank Transfer",
    note:  "Local Liberian banks",
    icon:  "🏦",
  },
] as const;
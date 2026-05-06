// lib/billing.ts (complete, with limit helpers added)

import { createClient } from '@/lib/supabase/client';

// ─── Toggle this to go live ───────────────────────────────────────────────
export const MOCK_MODE = true;

// ─── Flutterwave config ───────────────────────────────────────────────────
export const FLUTTERWAVE_CONFIG = {
  publicKey:   MOCK_MODE ? "FLWPUBK_TEST-MOCK-KEY" : process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY!,
  redirectUrl: typeof window !== "undefined" ? `${window.location.origin}/billing/callback` : "",
  currency:    "USD" as const,
  country:     "LR"  as const,
};

// ─── Tiered pricing ───────────────────────────────────────────────────────
export const TIERED_PRICING = {
  basic:    { maxEmployees: 80,       price: 50  },
  standard: { maxEmployees: 499,      price: 300 },
  premium:  { maxEmployees: Infinity, price: 500 },
} as const;

export type PricingTier = keyof typeof TIERED_PRICING;

export function getPricingTier(employeeCount: number): PricingTier {
  if (employeeCount <= TIERED_PRICING.basic.maxEmployees)    return "basic";
  if (employeeCount <= TIERED_PRICING.standard.maxEmployees) return "standard";
  return "premium";
}

export function calculateMonthlyFee(employeeCount: number): number {
  return TIERED_PRICING[getPricingTier(employeeCount)].price;
}

export const TRIAL_RUNS      = 1;
export const FREE_TRIAL_DAYS = 30;

// ─── Types ────────────────────────────────────────────────────────────────
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

// ─── Trial logic ──────────────────────────────────────────────────────────
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

// ─── Mock Flutterwave ─────────────────────────────────────────────────────
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

// ─── Mock billing profile ─────────────────────────────────────────────────
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

// ─── Payment methods ──────────────────────────────────────────────────────
export const LIBERIA_PAYMENT_METHODS = [
  { id: "card",                label: "Credit / Debit Card", note: "Visa, Mastercard",        icon: "💳" },
  { id: "mobile_money_franco", label: "Orange Money",        note: "Liberia mobile money",    icon: "📱" },
  { id: "ussd",                label: "Bank Transfer",       note: "Local Liberian banks",    icon: "🏦" },
] as const;

export function hasBillingBypass(profile: { billing_bypass?: boolean }): boolean {
  return profile?.billing_bypass === true;
}

// ══════════════════════════════════════════════════════════════════════════
// PAYSLIP GENERATION LIMIT HELPERS (added for fraud prevention)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Returns the first and last day of the current calendar month as ISO strings.
 */
function getCurrentBillingPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  return { start, end };
}

/**
 * Fetch all distinct employee IDs that have had at least one payslip
 * generated in the current calendar month.
 */
export async function getDistinctEmployeeIdsGeneratedThisMonth(
  companyId: string
): Promise<string[]> {
  const supabase = createClient();
  const { start, end } = getCurrentBillingPeriod();

  const { data, error } = await (supabase as any)
    .from('payslip_generations')
    .select('employee_id')
    .eq('company_id', companyId)
    .gte('billing_period_start', start)
    .lte('billing_period_start', end);

  if (error) {
    console.error('Failed to fetch payslip generations:', error);
    return [];
  }

  // Extract employee IDs and narrow to string[]
  const ids: string[] = data?.map((d: any) => d.employee_id as string) ?? [];
  const uniqueIds = Array.from(new Set(ids));
  return uniqueIds;
}

export async function canGeneratePayslips(
  companyId: string,
  tier: 'basic' | 'standard' | 'premium',
  billingBypass: boolean,
  requestedEmployeeIds: string[]
): Promise<{
  allowed: boolean;
  currentCount: number;
  limit: number;
  blockedIds: string[];
  message?: string;
}> {
  if (billingBypass) {
    return { allowed: true, currentCount: 0, limit: Infinity, blockedIds: [] };
  }

  const limit = tier === 'basic' ? 80 : tier === 'standard' ? 499 : Infinity;

  // Who has already had a payslip generated this month?
  const alreadyGenerated = await getDistinctEmployeeIdsGeneratedThisMonth(companyId);
  const currentSet = new Set(alreadyGenerated);

  // Which of the requested employees are NOT already counted?
  const newIds = requestedEmployeeIds.filter((id) => !currentSet.has(id));

  // How many spots are left?
  const spotsLeft = limit - currentSet.size;

  if (newIds.length <= spotsLeft) {
    return {
      allowed: true,
      currentCount: currentSet.size,
      limit,
      blockedIds: [],
    };
  }

  // Which specific employees are blocked?
  const blockedIds = newIds.slice(spotsLeft);
  const allowedNewIds = newIds.slice(0, spotsLeft);

  return {
    allowed: false,
    currentCount: currentSet.size,
    limit,
    blockedIds,
    message: spotsLeft <= 0
      ? `You've reached your ${tier} plan limit of ${limit} employees this month. Upgrade to generate more payslips.`
      : `You can only generate payslips for ${spotsLeft} more employee(s) this month (${currentSet.size} already done, limit ${limit}). Upgrade to continue.`,
  };
}

/**
 * Record that a payslip was generated for an employee.
 * Call this AFTER a successful PDF download.
 */
export async function recordPayslipGeneration(
  companyId: string,
  employeeId: string
): Promise<void> {
  const supabase = createClient();
  const { start } = getCurrentBillingPeriod();

  const { error } = await (supabase as any)
    .from('payslip_generations')
    .upsert(
      {
        company_id: companyId,
        employee_id: employeeId,
        billing_period_start: start,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,employee_id,billing_period_start' }
    );

  if (error) {
    console.error('Failed to record payslip generation:', error);
  }
}
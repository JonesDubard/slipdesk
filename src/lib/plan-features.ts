/**
 * Slipdesk — Plan Feature Gates
 * Single source of truth for what each tier can access.
 *
 * Internal DB tiers are `basic | standard | premium` (unchanged for backward
 * compatibility). Public-facing plan names are Starter / Professional /
 * Enterprise. This module maps between the two and encodes the full feature
 * matrix so feature gating stays consistent everywhere.
 *
 * Import `canUse` / `useFeature` anywhere in the app.
 */

import type { SubscriptionTier } from "@/context/AppContext";

// ─── Public plan identity ──────────────────────────────────────────────────

/** Public plan names mapped from the internal subscription tiers. */
export const PLAN_LABELS: Record<SubscriptionTier, string> = {
  basic: "Starter",
  standard: "Professional",
  premium: "Enterprise",
};

export interface PlanMeta {
  tier: SubscriptionTier;
  name: string;
  price: number;
  /** Infinity = unlimited */
  maxEmployees: number;
  tagline: string;
  /** Human-readable feature bullets shown on pricing/plan pages. */
  features: string[];
  popular?: boolean;
}

export const PLANS: Record<SubscriptionTier, PlanMeta> = {
  basic: {
    tier: "basic",
    name: "Starter",
    price: 50,
    maxEmployees: 80,
    tagline: "Everything a small team needs to run compliant payroll.",
    features: [
      "Employee Management",
      "Payroll Management",
      "Unlimited Payroll Runs",
      "Payroll History",
      "PDF Payslips",
      "LRA Calculations",
      "NASSCORP Calculations",
      "CSV Employee Import",
      "Basic Dashboard",
      "Email Support",
    ],
  },
  standard: {
    tier: "standard",
    name: "Professional",
    price: 300,
    maxEmployees: 500,
    popular: true,
    tagline: "Approvals, analytics and branding for growing organizations.",
    features: [
      "Department Management",
      "Branch Management",
      "Payroll Approval Workflow",
      "Payroll Analytics",
      "Company Branding",
      "Bulk Payslip Generation",
      "Compliance Dashboard",
      "Department Reports",
      "Payroll Calendar",
      "Priority Support",
    ],
  },
  premium: {
    tier: "premium",
    name: "Enterprise",
    price: 500,
    maxEmployees: Infinity,
    tagline: "Multi-branch control, audit trails and dedicated support.",
    features: [
      "Multi-branch Organizations",
      "Advanced Role Permissions",
      "Audit Trail",
      "Executive Analytics",
      "Compliance History",
      "API Access",
      "Custom Reports",
      "Dedicated Onboarding",
      "Dedicated Account Manager",
      "Priority Phone Support",
    ],
  },
};

/** Ordered tiers, cheapest → most capable. Handy for "upgrade" logic. */
export const TIER_ORDER: SubscriptionTier[] = ["basic", "standard", "premium"];

export function tierRank(tier: SubscriptionTier): number {
  return TIER_ORDER.indexOf(tier);
}

// ─── Feature catalogue ─────────────────────────────────────────────────────

export type Feature =
  // ── Legacy keys (kept for backward compatibility) ──
  | "companyLogo"
  | "dualCurrency"
  | "bulkDownload"
  | "departmentReports"
  | "dedicatedManager"
  | "customReports"
  | "multiLocation"
  // ── Core (all plans) ──
  | "employeeManagement"
  | "payrollManagement"
  | "unlimitedPayrollRuns"
  | "payrollHistory"
  | "pdfPayslips"
  | "lraCalculations"
  | "nasscorpCalculations"
  | "csvImport"
  | "basicDashboard"
  // ── Professional+ ──
  | "departmentManagement"
  | "branchManagement"
  | "approvalWorkflow"
  | "payrollAnalytics"
  | "companyBranding"
  | "bulkPayslips"
  | "complianceDashboard"
  | "payrollCalendar"
  // ── Enterprise ──
  | "multiBranch"
  | "advancedRoles"
  | "auditTrail"
  | "executiveAnalytics"
  | "complianceHistory"
  | "apiAccess"
  | "dedicatedOnboarding";

/**
 * The minimum tier that unlocks each feature. A tier gets a feature if its
 * rank is >= the minimum tier's rank.
 */
const FEATURE_MIN_TIER: Record<Feature, SubscriptionTier> = {
  // Legacy
  companyLogo: "standard",
  dualCurrency: "basic", // dual currency is core to Slipdesk; available to all
  bulkDownload: "standard",
  departmentReports: "standard",
  dedicatedManager: "premium",
  customReports: "premium",
  multiLocation: "premium",
  // Core
  employeeManagement: "basic",
  payrollManagement: "basic",
  unlimitedPayrollRuns: "basic",
  payrollHistory: "basic",
  pdfPayslips: "basic",
  lraCalculations: "basic",
  nasscorpCalculations: "basic",
  csvImport: "basic",
  basicDashboard: "basic",
  // Professional+
  departmentManagement: "standard",
  branchManagement: "standard",
  approvalWorkflow: "standard",
  payrollAnalytics: "standard",
  companyBranding: "standard",
  bulkPayslips: "standard",
  complianceDashboard: "standard",
  payrollCalendar: "standard",
  // Enterprise
  multiBranch: "premium",
  advancedRoles: "premium",
  auditTrail: "premium",
  executiveAnalytics: "premium",
  complianceHistory: "premium",
  apiAccess: "premium",
  dedicatedOnboarding: "premium",
};

export function canUse(feature: Feature, tier: SubscriptionTier): boolean {
  const min = FEATURE_MIN_TIER[feature];
  if (min === undefined) return false;
  return tierRank(tier) >= tierRank(min);
}

/** The minimum public plan name that unlocks a feature (for upsell copy). */
export function requiredPlanName(feature: Feature): string {
  return PLAN_LABELS[FEATURE_MIN_TIER[feature]];
}

/**
 * billing_bypass accounts always resolve to the most capable tier so internal
 * / comped accounts get everything.
 */
export function getEffectiveTier(
  tier: SubscriptionTier,
  billingBypass: boolean
): SubscriptionTier {
  return billingBypass ? "premium" : tier;
}

export function planFor(tier: SubscriptionTier): PlanMeta {
  return PLANS[tier];
}

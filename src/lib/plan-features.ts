/**
 * Slipdesk — Plan Feature Gates
 * Single source of truth for what each tier can access.
 * Import `canUse` anywhere in the app.
 */

import type { SubscriptionTier } from "@/context/AppContext";

type Feature =
  | "companyLogo"       // logo on payslips
  | "dualCurrency"      // LRD + USD payroll
  | "bulkDownload"      // bulk payslip PDF download
  | "departmentReports" // department-level reporting
  | "dedicatedManager"  // account manager
  | "customReports"     // custom exports
  | "multiLocation";    // multi-location support

const FEATURE_GATES: Record<Feature, SubscriptionTier[]> = {
  companyLogo:       ["standard", "premium"],
  dualCurrency:      ["standard", "premium"],
  bulkDownload:      ["standard", "premium"],
  departmentReports: ["standard", "premium"],
  dedicatedManager:  ["premium"],
  customReports:     ["premium"],
  multiLocation:     ["premium"],
};

export function canUse(feature: Feature, tier: SubscriptionTier): boolean {
  // billing_bypass accounts always get everything
  return FEATURE_GATES[feature].includes(tier);
}

export function getEffectiveTier(
  tier: SubscriptionTier,
  billingBypass: boolean
): SubscriptionTier {
  return billingBypass ? "premium" : tier;
}
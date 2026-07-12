/**
 * Single source of truth for pricing-page claims vs live product capability.
 * Used by E2E / contract tests so marketing UI cannot drift from reality silently.
 */

import { PLANS, canUse, type Feature } from "@/lib/plan-features";
import type { SubscriptionTier } from "@/context/AppContext";

export type CapabilityStatus =
  | "implemented" // real product surface, usable
  | "partial" // exists but incomplete / ungated / overstated
  | "marketing-only" // support/service claim, no product feature
  | "missing"; // claimed but no product surface

export interface PricingCapability {
  /** Exact bullet text as shown on the marketing pricing cards (minus "Everything in X"). */
  label: string;
  tier: SubscriptionTier;
  /** Feature key when one exists in plan-features. */
  feature?: Feature;
  status: CapabilityStatus;
  /** Dashboard route or API surface that proves the capability (if any). */
  route?: string;
  /** Whether canUse() is enforced for this feature in the app today. */
  gated: boolean;
  notes: string;
}

/** Marketing-only intro lines that are not product features. */
export const MARKETING_PREFIX_LINES = [
  "Everything in Starter, plus:",
  "Everything in Professional, plus:",
] as const;

export const PRICING_CAPABILITIES: PricingCapability[] = [
  // ── Starter ──────────────────────────────────────────────────────────────
  {
    label: "Employee Management",
    tier: "basic",
    feature: "employeeManagement",
    status: "implemented",
    route: "/employees",
    gated: false,
    notes: "Full CRUD on /employees; headcount limited by plan.",
  },
  {
    label: "Payroll Management",
    tier: "basic",
    feature: "payrollManagement",
    status: "implemented",
    route: "/payroll",
    gated: false,
    notes: "Pay runs + calculation engine.",
  },
  {
    label: "Unlimited Payroll Runs",
    tier: "basic",
    feature: "unlimitedPayrollRuns",
    status: "partial",
    route: "/payroll",
    gated: false,
    notes: "Runs unlimited; PDF generation capped by monthly employee headcount.",
  },
  {
    label: "Payroll History",
    tier: "basic",
    feature: "payrollHistory",
    status: "implemented",
    route: "/payroll",
    gated: false,
    notes: "pay_runs history on payroll page.",
  },
  {
    label: "PDF Payslips",
    tier: "basic",
    feature: "pdfPayslips",
    status: "implemented",
    route: "/payroll",
    gated: false,
    notes: "PayslipPDF generation; headcount monthly limit applies.",
  },
  {
    label: "LRA Calculations",
    tier: "basic",
    feature: "lraCalculations",
    status: "implemented",
    route: "/payroll",
    gated: false,
    notes: "calcPaye in slipdesk-payroll-engine.",
  },
  {
    label: "NASSCORP Calculations",
    tier: "basic",
    feature: "nasscorpCalculations",
    status: "implemented",
    route: "/payroll",
    gated: false,
    notes: "calcNasscorp in slipdesk-payroll-engine.",
  },
  {
    label: "CSV Employee Import",
    tier: "basic",
    feature: "csvImport",
    status: "implemented",
    route: "/employees",
    gated: false,
    notes: "CSV upload on employees page; canUse(csvImport) unused.",
  },
  {
    label: "Basic Dashboard",
    tier: "basic",
    feature: "basicDashboard",
    status: "implemented",
    route: "/dashboard",
    gated: false,
    notes: "Dashboard page available on all tiers.",
  },
  {
    label: "Email Support",
    tier: "basic",
    status: "marketing-only",
    gated: false,
    notes: "Mailto / support page only — no ticket system by plan.",
  },

  // ── Professional ─────────────────────────────────────────────────────────
  {
    label: "Department Management",
    tier: "standard",
    feature: "departmentManagement",
    status: "implemented",
    route: "/organization",
    gated: true,
    notes: "CRUD on /organization; assign via employee department field.",
  },
  {
    label: "Branch Management",
    tier: "standard",
    feature: "branchManagement",
    status: "implemented",
    route: "/organization",
    gated: true,
    notes: "CRUD on /organization; assign via employee branch field.",
  },
  {
    label: "Payroll Approval Workflow",
    tier: "standard",
    feature: "approvalWorkflow",
    status: "implemented",
    route: "/payroll",
    gated: false,
    notes: "Status transitions + RBAC exist; canUse(approvalWorkflow) not enforced.",
  },
  {
    label: "Payroll Analytics",
    tier: "standard",
    feature: "payrollAnalytics",
    status: "implemented",
    route: "/analytics",
    gated: true,
    notes: "Route gated via canUse(payrollAnalytics); some charts still synthetic.",
  },
  {
    label: "Company Branding",
    tier: "standard",
    feature: "companyBranding",
    status: "implemented",
    route: "/settings",
    gated: true,
    notes: "Logo, colors, footers gated; colors applied to payslip PDFs.",
  },
  {
    label: "Bulk Payslip Generation",
    tier: "standard",
    feature: "bulkPayslips",
    status: "implemented",
    route: "/payroll",
    gated: false,
    notes: "Bulk download exists; canUse(bulkPayslips) unused so Starter can use it.",
  },
  {
    label: "Compliance Dashboard",
    tier: "standard",
    feature: "complianceDashboard",
    status: "implemented",
    route: "/compliance",
    gated: true,
    notes: "Gated route with live compliance checks.",
  },
  {
    label: "Department Reports",
    tier: "standard",
    feature: "departmentReports",
    status: "implemented",
    route: "/reports",
    gated: true,
    notes: "Department report locked unless Pro+.",
  },
  {
    label: "Payroll Calendar",
    tier: "standard",
    feature: "payrollCalendar",
    status: "implemented",
    route: "/payroll/calendar",
    gated: true,
    notes: "Month grid with payday + pay-run dots; GET /api/payroll/calendar.",
  },
  {
    label: "Priority Support",
    tier: "standard",
    status: "marketing-only",
    gated: false,
    notes: "Same support channels for all plans.",
  },

  // ── Enterprise ───────────────────────────────────────────────────────────
  {
    label: "Multi-branch Organizations",
    tier: "premium",
    feature: "multiBranch",
    status: "implemented",
    route: "/organization",
    gated: true,
    notes: "Branch registry + Enterprise branch-summary analytics panel.",
  },
  {
    label: "Advanced Role Permissions",
    tier: "premium",
    feature: "advancedRoles",
    status: "implemented",
    route: "/team",
    gated: true,
    notes: "Nav gated; team invite + RBAC implemented.",
  },
  {
    label: "Audit Trail",
    tier: "premium",
    feature: "auditTrail",
    status: "implemented",
    route: "/audit",
    gated: true,
    notes: "Gated /audit with audit_log writes.",
  },
  {
    label: "Executive Analytics",
    tier: "premium",
    feature: "executiveAnalytics",
    status: "implemented",
    route: "/analytics",
    gated: true,
    notes: "GET /api/analytics/executive + Enterprise UI panel.",
  },
  {
    label: "Compliance History",
    tier: "premium",
    feature: "complianceHistory",
    status: "implemented",
    route: "/compliance",
    gated: true,
    notes: "Snapshots via compliance_snapshots + history table UI.",
  },
  {
    label: "API Access",
    tier: "premium",
    feature: "apiAccess",
    status: "implemented",
    route: "/settings",
    gated: true,
    notes: "API keys + GET /api/v1/employees Bearer auth.",
  },
  {
    label: "Custom Reports",
    tier: "premium",
    feature: "customReports",
    status: "implemented",
    route: "/reports",
    gated: true,
    notes: "Column picker / group-by custom report builder.",
  },
  {
    label: "Dedicated Onboarding",
    tier: "premium",
    feature: "dedicatedOnboarding",
    status: "marketing-only",
    gated: false,
    notes: "Service claim only.",
  },
  {
    label: "Dedicated Account Manager",
    tier: "premium",
    status: "marketing-only",
    gated: false,
    notes: "Service claim only.",
  },
  {
    label: "Priority Phone Support",
    tier: "premium",
    status: "marketing-only",
    gated: false,
    notes: "Support phone/WhatsApp not plan-gated.",
  },
];

/** Exact feature bullets expected on marketing pricing cards per public plan name. */
export function marketingFeatureBullets(tier: SubscriptionTier): string[] {
  const labels = PRICING_CAPABILITIES.filter((c) => c.tier === tier).map((c) => c.label);
  if (tier === "standard") return ["Everything in Starter, plus:", ...labels];
  if (tier === "premium") return ["Everything in Professional, plus:", ...labels];
  return labels;
}

export function planLabelsFromSourceOfTruth(): Record<SubscriptionTier, string[]> {
  return {
    basic: PLANS.basic.features,
    standard: ["Everything in Starter, plus:", ...PLANS.standard.features],
    premium: ["Everything in Professional, plus:", ...PLANS.premium.features],
  };
}

/** Nav routes that should appear only when the tier unlocks the feature. */
export const GATED_NAV_ROUTES: { href: string; feature: Feature; minTier: SubscriptionTier }[] = [
  { href: "/analytics", feature: "payrollAnalytics", minTier: "standard" },
  { href: "/compliance", feature: "complianceDashboard", minTier: "standard" },
  { href: "/audit", feature: "auditTrail", minTier: "premium" },
  { href: "/team", feature: "advancedRoles", minTier: "premium" },
];

export function assertFeatureGateMatchesMatrix(feature: Feature, tier: SubscriptionTier): boolean {
  return canUse(feature, tier);
}

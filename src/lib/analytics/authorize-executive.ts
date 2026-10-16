import { canUse, getEffectiveTier } from "@/lib/plan-features";
import { can, type Role } from "@/lib/rbac";
import type { SubscriptionTier } from "@/context/AppContext";

export type ExecutiveAccessDecision =
  | { ok: true; companyId: string; role: Role }
  | { ok: false; status: 403; error: string; code?: "PLAN_GATE" };

/**
 * Company comes from chooseCompanyForUser. Missing or ambiguous access fails
 * closed. The plan gate and analytics:executive permission stay in that order.
 */
export function authorizeExecutiveAnalytics(input: {
  decision: { companyId: string; role: Role } | null;
  subscriptionTier: SubscriptionTier | null;
  billingBypass: boolean;
}): ExecutiveAccessDecision {
  if (!input.decision) return { ok: false, status: 403, error: "Company not found" };
  const tier = getEffectiveTier(input.subscriptionTier || "basic", input.billingBypass);
  if (!canUse("executiveAnalytics", tier)) {
    return { ok: false, status: 403, error: "Upgrade required", code: "PLAN_GATE" };
  }
  if (!can(input.decision.role, "analytics:executive")) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, companyId: input.decision.companyId, role: input.decision.role };
}

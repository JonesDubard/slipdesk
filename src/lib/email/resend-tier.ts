/**
 * Resend plan selection for Slipdesk.
 *
 * Free tier (3k emails/mo, 100/day) is used until at least one company has a
 * paying subscription (status = active). Operators can force Pro via env.
 *
 * Domain verification is manual in the Resend dashboard — not handled here.
 */

export type ResendPlanTier = "free" | "pro";

export interface ResendTierDecision {
  plan: ResendPlanTier;
  reason: string;
  /** Soft daily cap used for batching / warnings (Resend free = 100/day). */
  dailySoftCap: number;
}

/**
 * Decide which Resend commercial tier Slipdesk should operate under.
 * `hasPayingCustomer` should be true when any company has subscription_status = 'active'.
 */
export function resolveResendPlan(opts: {
  hasPayingCustomer: boolean;
  forcePlan?: string | null;
}): ResendTierDecision {
  const forced = (opts.forcePlan ?? process.env.RESEND_PLAN_TIER ?? "").trim().toLowerCase();
  if (forced === "pro" || forced === "free") {
    return {
      plan: forced,
      reason: `Forced via RESEND_PLAN_TIER=${forced}`,
      dailySoftCap: forced === "pro" ? 10_000 : 100,
    };
  }
  if (opts.hasPayingCustomer) {
    return {
      plan: "pro",
      reason: "At least one company has an active (paying) subscription",
      dailySoftCap: 10_000,
    };
  }
  return {
    plan: "free",
    reason: "No paying customers yet — using Resend Free tier",
    dailySoftCap: 100,
  };
}

/** Whether a batch of N emails fits under the current soft daily cap. */
export function fitsDailyCap(count: number, plan: ResendTierDecision): boolean {
  return count <= plan.dailySoftCap;
}

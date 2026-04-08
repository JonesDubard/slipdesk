export const TIERED_PRICING = {
  basic: { maxEmployees: 80, price: 50 },
  standard: { maxEmployees: 499, price: 300 },
  premium: { maxEmployees: Infinity, price: 500 },
} as const;

export type PricingTier = keyof typeof TIERED_PRICING;

export function getPricingTier(employeeCount: number): PricingTier {
  if (employeeCount <= TIERED_PRICING.basic.maxEmployees) return "basic";
  if (employeeCount <= TIERED_PRICING.standard.maxEmployees) return "standard";
  return "premium";
}

export function calculateMonthlyFee(employeeCount: number): number {
  return TIERED_PRICING[getPricingTier(employeeCount)].price;
}
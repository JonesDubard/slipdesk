import { describe, it, expect } from "vitest";
import { PLANS, canUse, getEffectiveTier } from "@/lib/plan-features";
import { visibleNavItems } from "@/lib/nav";
import {
  PRICING_CAPABILITIES,
  marketingFeatureBullets,
  GATED_NAV_ROUTES,
} from "@/lib/pricing/capability-matrix";

describe("pricing capability matrix", () => {
  it("covers every PLANS bullet with a capability row", () => {
    for (const tier of ["basic", "standard", "premium"] as const) {
      for (const label of PLANS[tier].features) {
        const row = PRICING_CAPABILITIES.find((c) => c.tier === tier && c.label === label);
        expect(row, `Missing capability row for ${tier}: ${label}`).toBeTruthy();
      }
    }
  });

  it("keeps marketing bullets aligned with PLANS source of truth", () => {
    expect(marketingFeatureBullets("basic")).toEqual(PLANS.basic.features);
    expect(marketingFeatureBullets("standard")).toEqual([
      "Everything in Starter, plus:",
      ...PLANS.standard.features,
    ]);
    expect(marketingFeatureBullets("premium")).toEqual([
      "Everything in Professional, plus:",
      ...PLANS.premium.features,
    ]);
  });

  it("documents which claimed features are missing or marketing-only", () => {
    const gaps = PRICING_CAPABILITIES.filter(
      (c) => c.status === "missing" || c.status === "marketing-only",
    );
    expect(gaps.map((g) => `${g.tier}:${g.label}:${g.status}`)).toEqual([
      "basic:Email Support:marketing-only",
      "standard:Priority Support:marketing-only",
      "premium:Dedicated Onboarding:marketing-only",
      "premium:Dedicated Account Manager:marketing-only",
      "premium:Priority Phone Support:marketing-only",
    ]);
  });

  it("flags partial features that overstate backend capability", () => {
    const partial = PRICING_CAPABILITIES.filter((c) => c.status === "partial").map((c) => c.label);
    expect(partial).toEqual([
      "Unlimited Payroll Runs",
    ]);
  });
});

describe("plan feature gates vs nav (UI matches backend)", () => {
  it("hides Pro/Enterprise nav on Starter", () => {
    const hrefs = visibleNavItems("basic", false, "company_owner").map((i) => i.href);
    expect(hrefs).not.toContain("/analytics");
    expect(hrefs).not.toContain("/compliance");
    expect(hrefs).not.toContain("/audit");
    expect(hrefs).not.toContain("/team");
    expect(hrefs).not.toContain("/organization");
    expect(hrefs).not.toContain("/payroll/calendar");
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/employees");
    expect(hrefs).toContain("/payroll");
    expect(hrefs).toContain("/reports");
  });

  it("shows Pro routes on Professional, still hides Enterprise audit/team", () => {
    const hrefs = visibleNavItems("standard", false, "company_owner").map((i) => i.href);
    expect(hrefs).toContain("/analytics");
    expect(hrefs).toContain("/compliance");
    expect(hrefs).toContain("/organization");
    expect(hrefs).toContain("/payroll/calendar");
    expect(hrefs).not.toContain("/audit");
    expect(hrefs).not.toContain("/team");
  });

  it("shows Enterprise routes on premium or billing bypass", () => {
    const premium = visibleNavItems("premium", false, "company_owner").map((i) => i.href);
    expect(premium).toContain("/audit");
    expect(premium).toContain("/team");

    const bypass = visibleNavItems("basic", true, "company_owner").map((i) => i.href);
    expect(bypass).toContain("/audit");
    expect(bypass).toContain("/team");
    expect(getEffectiveTier("basic", true)).toBe("premium");
  });

  it("canUse matches gated nav matrix", () => {
    for (const route of GATED_NAV_ROUTES) {
      expect(canUse(route.feature, "basic")).toBe(false);
      expect(canUse(route.feature, route.minTier)).toBe(true);
      expect(canUse(route.feature, "premium")).toBe(true);
    }
  });
});

describe("pricing economics for email (payslip attachments)", () => {
  it("estimates Resend cost stays low vs subscription revenue at early volume", () => {
    // 20 active companies × 40 employees × 1 payslip email / month = 800 emails
    const emailsPerMonth = 20 * 40;
    const resendFreeCap = 3000;
    const resendProCost = 20; // USD for 50k emails
    const avgStarterRevenue = 20 * 50; // USD if all Starter

    expect(emailsPerMonth).toBeLessThan(resendFreeCap);
    expect(resendProCost / avgStarterRevenue).toBeLessThan(0.05);
  });
});

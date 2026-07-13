import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/** Mirrors PLANS + marketing prefixes — keep in sync with plan-features.ts */
const STARTER_FEATURES = [
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
];

const PROFESSIONAL_FEATURES = [
  "Everything in Starter, plus:",
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
];

const ENTERPRISE_FEATURES = [
  "Everything in Professional, plus:",
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
];

test.describe("Marketing pricing page E2E", () => {
  async function openPricing(page: import("@playwright/test").Page) {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.locator("#pricing").scrollIntoViewIfNeeded();
    await expect(page.locator("#pricing")).toBeVisible({ timeout: 15_000 });
    return page.locator("#pricing");
  }

  test("renders three plan cards with prices and employee limits", async ({ page }) => {
    const pricing = await openPricing(page);

    await expect(pricing.getByText("Starter", { exact: true }).first()).toBeVisible();
    await expect(pricing.getByText("Professional", { exact: true }).first()).toBeVisible();
    await expect(pricing.getByText("Enterprise", { exact: true }).first()).toBeVisible();

    await expect(pricing.getByText("$50", { exact: true })).toBeVisible();
    await expect(pricing.getByText("$300", { exact: true })).toBeVisible();
    await expect(pricing.getByText("$500", { exact: true })).toBeVisible();

    await expect(pricing.getByText("Up to 80 employees")).toBeVisible();
    await expect(pricing.getByText("Up to 500 employees")).toBeVisible();
    await expect(pricing.getByText("Unlimited employees")).toBeVisible();
  });

  test("Starter card lists every Starter feature", async ({ page }) => {
    const pricing = await openPricing(page);
    for (const feature of STARTER_FEATURES) {
      await expect(pricing.getByText(feature, { exact: true })).toBeVisible();
    }
  });

  test("Professional card lists every Professional feature", async ({ page }) => {
    const pricing = await openPricing(page);
    for (const feature of PROFESSIONAL_FEATURES) {
      await expect(pricing.getByText(feature, { exact: true })).toBeVisible();
    }
  });

  test("Enterprise card lists every Enterprise feature", async ({ page }) => {
    const pricing = await openPricing(page);
    for (const feature of ENTERPRISE_FEATURES) {
      await expect(pricing.getByText(feature, { exact: true })).toBeVisible();
    }
  });

  test("Choose plan CTAs buy plan (not signup)", async ({ page }) => {
    const pricing = await openPricing(page);
    await expect(pricing.locator('a[href="/signup"]')).toHaveCount(0);
    await expect(pricing.getByRole("link", { name: /buy starter/i })).toBeVisible();
    await expect(pricing.getByRole("link", { name: /buy professional/i })).toBeVisible();
    await expect(pricing.getByRole("link", { name: /buy enterprise/i })).toBeVisible();
  });

  test("all-plans footer claims dual-currency, PDF payslips, and feature gating", async ({ page }) => {
    const pricing = await openPricing(page);
    await expect(pricing).toContainText("dual-currency");
    await expect(pricing).toContainText("PDF payslips");
    await expect(pricing).toContainText("Feature gating is enforced per plan");
  });
});

test.describe("Auth-gated feature routes (backend enforcement)", () => {
  const protectedRoutes = [
    "/dashboard",
    "/employees",
    "/payroll",
    "/payroll/calendar",
    "/organization",
    "/analytics",
    "/compliance",
    "/reports",
    "/audit",
    "/team",
    "/settings",
    "/billing",
  ];

  for (const route of protectedRoutes) {
    test(`${route} redirects unauthenticated users`, async ({ page }) => {
      const response = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
      // Soft-nav / middleware may redirect; allow short settle
      await page.waitForTimeout(500);
      const url = page.url();
      const stillOnRoute = new URL(url).pathname === route || new URL(url).pathname.startsWith(`${route}/`);
      const status = response?.status() ?? 0;
      // Accept redirect to login/home OR a non-200 that indicates blocked access
      expect(stillOnRoute && status === 200 ? false : true).toBeTruthy();
    });
  }
});

test.describe("Public marketing surfaces for claimed support channels", () => {
  test("support page exposes contact email", async ({ page }) => {
    await page.goto(`${BASE}/support`);
    await expect(page.getByRole("link", { name: /helloslipdesk@gmail\.com/i }).first()).toBeVisible();
  });
});

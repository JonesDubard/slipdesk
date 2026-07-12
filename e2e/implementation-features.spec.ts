import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

test.describe("Payslip email API (mocked Resend)", () => {
  test("rejects unauthenticated email-payslips requests", async ({ request }) => {
    const res = await request.post(`${BASE}/api/payroll/email-payslips`, {
      data: { attachments: [] },
    });
    expect(res.status()).toBe(401);
  });

  test("login page remains reachable while email feature is live", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.getByText(/sign in|email/i).first()).toBeVisible();
  });
});

test.describe("New gap feature routes — auth gated", () => {
  const gated = [
    "/payroll/calendar",
    "/organization",
    "/compliance",
    "/reports",
    "/settings",
    "/team",
  ];

  for (const route of gated) {
    test(`${route} is not publicly accessible`, async ({ page }) => {
      const response = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(400);
      const pathname = new URL(page.url()).pathname;
      const stillOnRoute = pathname === route || pathname.startsWith(`${route}/`);
      const status = response?.status() ?? 0;
      expect(stillOnRoute && status === 200).toBeFalsy();
    });
  }
});

test.describe("Pricing still lists previously missing five", () => {
  test("marketing claims Payroll Calendar through Custom Reports", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.locator("#pricing").scrollIntoViewIfNeeded();
    const pricing = page.locator("#pricing");
    for (const feature of [
      "Payroll Calendar",
      "Multi-branch Organizations",
      "Compliance History",
      "API Access",
      "Custom Reports",
    ]) {
      await expect(pricing.getByText(feature, { exact: true })).toBeVisible();
    }
  });
});

test.describe("Public v1 API requires Bearer key", () => {
  test("GET /api/v1/employees without key returns 401", async ({ request }) => {
    const res = await request.get(`${BASE}/api/v1/employees`);
    expect(res.status()).toBe(401);
  });
});

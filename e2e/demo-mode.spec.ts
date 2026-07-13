import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const DEMO_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "true";

test.describe("Acquisition CTAs (no free trial)", () => {
  test("landing primary CTA explores interactive demo", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const explore = page.getByRole("link", { name: /explore interactive demo/i }).first();
    await expect(explore).toBeVisible({ timeout: 20_000 });
    await expect(explore).toHaveAttribute("href", "/demo");
    await expect(page.getByText(/see slipdesk/i).first()).toBeVisible();
  });

  test("pricing cards buy plan (not signup)", async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.locator("#pricing").scrollIntoViewIfNeeded();
    const pricing = page.locator("#pricing");
    await expect(pricing).toBeVisible({ timeout: 15_000 });
    await expect(pricing.locator('a[href="/signup"]')).toHaveCount(0);
    await expect(pricing.getByRole("link", { name: /buy starter/i }).first()).toBeVisible();
  });

  test("signup page explains invite-only access", async ({ page }) => {
    await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/invite-only/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: /interactive demo/i }).first()).toBeVisible();
  });
});

test.describe("Demo enter flow", () => {
  test("GET /demo redirects into enter or off state", async ({ page }) => {
    await page.goto(`${BASE}/demo`, { waitUntil: "commit" });
    await page.waitForURL(
      (url) => {
        const path = url.pathname;
        return (
          path === "/" ||
          path.startsWith("/dashboard") ||
          path.startsWith("/demo") ||
          url.searchParams.has("demo")
        );
      },
      { timeout: 20_000 },
    );
    const url = page.url();
    if (DEMO_ENABLED) {
      const path = new URL(url).pathname;
      expect(
        path.startsWith("/dashboard") ||
          path.startsWith("/demo") ||
          url.includes("demo="),
      ).toBeTruthy();
    } else {
      expect(url.includes("demo=off") || new URL(url).pathname === "/").toBeTruthy();
    }
  });

  test("demo session API respects enable flag", async ({ request }) => {
    const res = await request.post(`${BASE}/api/demo/session`);
    if (DEMO_ENABLED) {
      expect([200, 401, 503]).toContain(res.status());
    } else {
      expect(res.status()).toBe(403);
    }
  });

  test("mutating org API without auth still 401", async ({ request }) => {
    const res = await request.post(`${BASE}/api/org/units`, {
      data: { kind: "departments", name: "Demo Test Dept" },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("Demo read-only (requires seeded demo)", () => {
  test.skip(!DEMO_ENABLED, "NEXT_PUBLIC_ENABLE_DEMO_MODE is not true");

  test("demo session blocks employee create API", async ({ page, request }) => {
    await page.goto(`${BASE}/demo/enter`, { waitUntil: "networkidle" });
    await page.waitForURL(/dashboard/, { timeout: 25_000 }).catch(() => undefined);
    await page.waitForTimeout(1000);
    const cookies = await page.context().cookies();
    expect(cookies.length).toBeGreaterThan(0);

    const res = await request.post(`${BASE}/api/employees`, {
      data: {},
      headers: {
        Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      },
    });
    const status = res.status();
    expect([403, 400]).toContain(status);
    if (status === 403) {
      const body = await res.json();
      expect(body.code === "DEMO_READONLY" || /demo|locked|read-only/i.test(String(body.error))).toBeTruthy();
    }
  });

  test("dashboard shows demo banner", async ({ page }) => {
    await page.goto(`${BASE}/demo/enter`, { waitUntil: "networkidle" });
    await page.waitForURL(/dashboard/, { timeout: 25_000 }).catch(() => undefined);
    await expect(
      page.getByText(/read-only demo of ABC Construction/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});

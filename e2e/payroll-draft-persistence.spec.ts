import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const LIVE = "https://slipdesk.com";
const LOCAL = "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

async function draftApiStatus(request: APIRequestContext, base: string) {
  const res = await request.get(`${base}/api/payroll/runs?active=true`);
  return { status: res.status(), body: (await res.text()).slice(0, 240) };
}

test.describe("Production fingerprint — is draft persistence actually deployed?", () => {
  test("slipdesk.com /api/payroll/runs exists (401/403) and is not 404", async ({ request }) => {
    const calendar = await request.get(`${LIVE}/api/payroll/calendar?year=2026&month=9`);
    const drafts = await draftApiStatus(request, LIVE);

    console.log(`LIVE calendar status: ${calendar.status()}`);
    console.log(`LIVE /api/payroll/runs status: ${drafts.status}`);
    console.log(`LIVE /api/payroll/runs body: ${drafts.body}`);

    // Calendar exists on master. Drafts only exist on release/pre-meeting-v0.2.1+.
    expect(calendar.status(), "calendar route should exist on production").toBe(401);
    expect(
      drafts.status,
      `slipdesk.com returned ${drafts.status} for /api/payroll/runs — 404 means this production deploy does not include draft persistence`,
    ).not.toBe(404);
    expect([401, 403]).toContain(drafts.status);
  });
});

test.describe("Localhost comparison (if dev server is up)", () => {
  test("localhost /api/payroll/runs vs live", async ({ request }) => {
    let local: { status: number; body: string } | null = null;
    try {
      local = await draftApiStatus(request, LOCAL);
    } catch (err) {
      console.log(`LOCALHOST unreachable: ${err instanceof Error ? err.message : err}`);
      test.skip(true, "localhost:3000 is not running");
      return;
    }

    const live = await draftApiStatus(request, LIVE);
    console.log(`LOCAL /api/payroll/runs status: ${local.status}`);
    console.log(`LIVE  /api/payroll/runs status: ${live.status}`);
    console.log(
      local.status === live.status
        ? "localhost and slipdesk.com behave the same for unauthenticated draft API."
        : `MISMATCH: localhost=${local.status} live=${live.status}. This is the deploy/env clue.`,
    );

    expect(local.status, "this branch's local API must include draft routes").not.toBe(404);
    expect([401, 403]).toContain(local.status);
  });
});

async function login(page: Page, base: string) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function startOrOpenDraft(page: Page) {
  await page.goto("/payroll", { waitUntil: "domcontentloaded" });
  const startBtn = page.getByRole("button", { name: /start pay run/i });
  const startVisible = await startBtn.isVisible().catch(() => false);
  if (startVisible) {
    await startBtn.click();
  }
  await expect(page.getByText(/start pay run/i)).toHaveCount(0, { timeout: 20_000 });
}

test.describe("Payroll draft restore (requires E2E_EMAIL / E2E_PASSWORD)", () => {
  test.skip(!EMAIL || !PASSWORD, "Set E2E_EMAIL and E2E_PASSWORD to run the logged-in restore flow");

  test("live: edit → other tab → back → draft still open", async ({ page, request }) => {
    const api = await draftApiStatus(request, LIVE);
    console.log(`Precondition LIVE /api/payroll/runs: ${api.status}`);
    test.skip(api.status === 404, "Draft API is not on slipdesk.com — restore cannot work until this branch is the production deploy");

    await login(page, LIVE);
    await startOrOpenDraft(page);

    const overtime = page.locator('input[type="number"]').first();
    await expect(overtime).toBeVisible({ timeout: 20_000 });
    await overtime.fill("7");
    await overtime.blur();

    await expect(page.getByText(/^Saved$|^Saving|^Draft autosave enabled$/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(1800);

    await page.goto("/employees", { waitUntil: "domcontentloaded" });
    await page.goto("/payroll", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("button", { name: /start pay run/i })).toHaveCount(0);
    await expect(overtime).toBeVisible();
    await expect(overtime).toHaveValue("7");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /start pay run/i })).toHaveCount(0);
    await expect(page.locator('input[type="number"]').first()).toHaveValue("7");
  });
});

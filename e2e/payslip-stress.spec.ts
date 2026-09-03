import { test, expect } from "@playwright/test";
import { createWriteStream, readFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const LIVE = "https://slipdesk.com";
const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";
const CSV = resolve("e2e/fixtures/stress-employee.csv");
const OUT_DIR = resolve("e2e/output");
const OUT_PDF = resolve(OUT_DIR, "stress-payslip.pdf");

function pdfPageCount(buf: Buffer): number {
  const text = buf.toString("latin1");
  const countMatch = text.match(/\/Type\s*\/Pages[\s\S]{0,200}\/Count\s+(\d+)/);
  if (countMatch) return Number(countMatch[1]);
  const pages = text.match(/\/Type\s*\/Page(?!s)/g);
  return pages?.length ?? 0;
}

test.describe("Live stress payslip", () => {
  test.skip(!EMAIL || !PASSWORD, "Set E2E_EMAIL and E2E_PASSWORD");
  test.setTimeout(120_000);

  test("import multi-deduction employee and download payslip PDF", async ({ page }) => {
    mkdirSync(OUT_DIR, { recursive: true });

    await page.goto(`${LIVE}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator("button.w-full", { hasText: /^Sign In$/ }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });

    await page.goto(`${LIVE}/payroll`, { waitUntil: "domcontentloaded" });
    const startBtn = page.getByRole("button", { name: /start pay run/i });
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click();
    }
    await expect(page.getByRole("button", { name: /import csv/i })).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /import csv/i }).click();
    await page.locator('input[type="file"][accept=".csv"]').setInputFiles(CSV);
    await page.getByRole("button", { name: /import 1 employee/i }).click();

    const row = page.locator("table tbody tr", { hasText: "Montgomery-Williams" }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      row.getByRole("button", { name: /^pdf$/i }).click(),
    ]);
    await download.saveAs(OUT_PDF);

    const buf = readFileSync(OUT_PDF);
    const pages = pdfPageCount(buf);
    console.log(`STRESS_PDF path: ${OUT_PDF}`);
    console.log(`STRESS_PDF bytes: ${buf.length}`);
    console.log(`STRESS_PDF pages: ${pages}`);
    console.log(`STRESS_PDF name: ${download.suggestedFilename()}`);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pages).toBeGreaterThan(0);
  });
});

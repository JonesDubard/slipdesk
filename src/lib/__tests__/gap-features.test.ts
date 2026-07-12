import { describe, it, expect } from "vitest";
import { buildPayrollCalendarMonth, getCurrentPeriod } from "@/lib/payroll/periods";
import { buildCustomReport, groupByBranch } from "@/lib/reporting";
import { generateApiKeyPlaintext, hashApiKey } from "@/lib/api-keys";
import { canUse } from "@/lib/plan-features";
import { computePayroll } from "@/lib/reporting";
import type { Employee } from "@/context/AppContext";

describe("payroll calendar", () => {
  it("builds a month grid with payday on last day", () => {
    const cal = buildPayrollCalendarMonth(2026, 7, [
      { id: "r1", payDate: "2026-07-31", periodStart: "2026-07-01", periodEnd: "2026-07-31" },
    ], new Date("2026-07-12T12:00:00Z"));
    expect(cal.month).toBe(7);
    expect(cal.currentPeriod.payDate).toBe("2026-07-31");
    const payday = cal.weeks.flat().find((d) => d.date === "2026-07-31");
    expect(payday?.isPayDate).toBe(true);
    expect(payday?.runIds).toContain("r1");
  });

  it("getCurrentPeriod returns ISO dates", () => {
    const p = getCurrentPeriod(new Date("2026-03-15T12:00:00Z"));
    expect(p.start).toMatch(/^2026-03-01/);
    expect(p.end).toMatch(/^2026-03-3/);
  });
});

describe("custom reports + branch grouping", () => {
  const employees = [
    {
      id: "1", employeeNumber: "E1", fullName: "Ada", firstName: "Ada", lastName: "Lovelace",
      department: "Eng", branch: "Monrovia", county: "Montserrado", currency: "USD", rate: 1000,
      standardHours: 160, isActive: true, isArchived: false, allowances: 0,
    },
    {
      id: "2", employeeNumber: "E2", fullName: "Grace", firstName: "Grace", lastName: "Hopper",
      department: "Ops", branch: "Gbarnga", county: "Bong", currency: "USD", rate: 800,
      standardHours: 160, isActive: true, isArchived: false, allowances: 0,
    },
  ] as unknown as Employee[];

  it("groups by branch", () => {
    const rows = computePayroll(employees);
    const g = groupByBranch(rows);
    expect(g.map((x) => x.key).sort()).toEqual(["Gbarnga", "Monrovia"]);
  });

  it("builds custom column report", () => {
    const rows = computePayroll(employees);
    const built = buildCustomReport(rows, ["employeeNumber", "fullName", "branch"]);
    expect(built.headers).toEqual(["Emp #", "Name", "Branch"]);
    expect(built.dataRows).toHaveLength(2);
  });
});

describe("api keys", () => {
  it("hashes deterministically and prefixes sk_live_", () => {
    const a = generateApiKeyPlaintext();
    expect(a.plaintext.startsWith("sk_live_")).toBe(true);
    expect(hashApiKey(a.plaintext)).toBe(a.hash);
    expect(hashApiKey(a.plaintext)).not.toBe(hashApiKey("other"));
  });
});

describe("remaining feature gates", () => {
  it("unlocks the five features on the correct tiers", () => {
    expect(canUse("payrollCalendar", "basic")).toBe(false);
    expect(canUse("payrollCalendar", "standard")).toBe(true);
    expect(canUse("multiBranch", "standard")).toBe(false);
    expect(canUse("multiBranch", "premium")).toBe(true);
    expect(canUse("complianceHistory", "premium")).toBe(true);
    expect(canUse("apiAccess", "premium")).toBe(true);
    expect(canUse("customReports", "premium")).toBe(true);
  });
});

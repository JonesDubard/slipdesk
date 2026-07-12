import { describe, it, expect } from "vitest";
import { resolveResendPlan, fitsDailyCap } from "@/lib/email/resend-tier";
import { aggregateExecutiveMetrics } from "@/lib/analytics/executive";
import { roleFamily, can, normalizeRole } from "@/lib/rbac";
import { canUse, getEffectiveTier } from "@/lib/plan-features";
import { visibleNavItems } from "@/lib/nav";

describe("resolveResendPlan", () => {
  it("stays on free when no paying customers", () => {
    const d = resolveResendPlan({ hasPayingCustomer: false, forcePlan: "" });
    expect(d.plan).toBe("free");
    expect(d.dailySoftCap).toBe(100);
  });

  it("upgrades to pro when a paying customer exists", () => {
    const d = resolveResendPlan({ hasPayingCustomer: true, forcePlan: "" });
    expect(d.plan).toBe("pro");
  });

  it("respects forced plan override", () => {
    expect(resolveResendPlan({ hasPayingCustomer: false, forcePlan: "pro" }).plan).toBe("pro");
    expect(resolveResendPlan({ hasPayingCustomer: true, forcePlan: "free" }).plan).toBe("free");
  });

  it("enforces free soft daily cap", () => {
    const free = resolveResendPlan({ hasPayingCustomer: false, forcePlan: "free" });
    expect(fitsDailyCap(80, free)).toBe(true);
    expect(fitsDailyCap(101, free)).toBe(false);
  });
});

describe("executive analytics aggregates", () => {
  it("summarizes headcount and departments", () => {
    const m = aggregateExecutiveMetrics({
      companyName: "Acme",
      employees: [
        { id: "1", department: "Finance", branch: "Monrovia", is_active: true, basic_salary: 1000 },
        { id: "2", department: "Finance", branch: "Gbarnga", is_active: true, basic_salary: 800 },
        { id: "3", department: "Ops", branch: "Monrovia", is_active: false, is_archived: true, basic_salary: 500 },
      ],
      payRuns: [{ id: "r1", status: "paid", total_gross: 1800, total_net: 1500, period_end: "2026-07-31" }],
    });
    expect(m.headcount.active).toBe(2);
    expect(m.headcount.departments).toBe(1);
    expect(m.headcount.branches).toBe(2);
    expect(m.payroll.latestGross).toBe(1800);
    expect(m.byDepartment[0].name).toBe("Finance");
  });
});

describe("RBAC families", () => {
  it("maps admin / manager / employee families", () => {
    expect(roleFamily("company_owner")).toBe("admin");
    expect(roleFamily("payroll_officer")).toBe("manager");
    expect(roleFamily("employee")).toBe("employee");
    expect(can(normalizeRole("employee"), "payroll:view")).toBe(false);
    expect(can(normalizeRole("admin"), "users:manage")).toBe(true);
  });
});

describe("feature gates for new org surfaces", () => {
  it("hides organization and team on Starter", () => {
    const hrefs = visibleNavItems("basic", false, "company_owner").map((i) => i.href);
    expect(hrefs).not.toContain("/organization");
    expect(hrefs).not.toContain("/team");
    expect(canUse("departmentManagement", "basic")).toBe(false);
    expect(canUse("executiveAnalytics", "basic")).toBe(false);
  });

  it("shows organization on Professional, team+exec on Enterprise", () => {
    const pro = visibleNavItems("standard", false, "company_owner").map((i) => i.href);
    expect(pro).toContain("/organization");
    expect(pro).not.toContain("/team");
    expect(canUse("executiveAnalytics", "standard")).toBe(false);

    const ent = visibleNavItems("premium", false, "company_owner").map((i) => i.href);
    expect(ent).toContain("/team");
    expect(canUse("executiveAnalytics", getEffectiveTier("premium", false))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { accessDecisionFromRecords } from "@/lib/auth/resolve-app-company";
import { authorizeExecutiveAnalytics } from "@/lib/analytics/authorize-executive";
import {
  attendanceApplyCallerGate,
  employeesInAuthorizedCompany,
  payRunInAuthorizedCompany,
} from "@/lib/payroll/apply-attendance-access";
import {
  paidRunInCompany,
  payslipNotifyCallerGate,
  recipientsInCompany,
} from "@/lib/payroll/notify-payslips-access";
import { authorizeCompanyPermission } from "@/lib/auth/authorize-company-permission";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function decision(opts: Parameters<typeof accessDecisionFromRecords>[0]) {
  return accessDecisionFromRecords(opts);
}

describe("executive analytics authorization", () => {
  it("uses the invited company when the user also owns a blank signup company", () => {
    const resolved = decision({
      owned: { id: "blank-owned", name: "" },
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "executive", status: "active" }],
    });
    const gate = authorizeExecutiveAnalytics({
      decision: resolved,
      subscriptionTier: "premium",
      billingBypass: true,
    });
    expect(gate).toEqual({ ok: true, companyId: ORG, role: "executive" });
    expect(gate.ok && gate.companyId).not.toBe("blank-owned");
  });

  it("fails closed when a named company and a membership have no profile selection", () => {
    const resolved = decision({
      owned: { id: "owned-real", name: "Owned Co" },
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "executive", status: "active" }],
    });
    expect(authorizeExecutiveAnalytics({
      decision: resolved,
      subscriptionTier: "premium",
      billingBypass: true,
    })).toEqual({ ok: false, status: 403, error: "Company not found" });
  });

  it("fails closed when the user has no company", () => {
    expect(authorizeExecutiveAnalytics({
      decision: decision({ owned: null, profileCompanyId: null, memberships: [] }),
      subscriptionTier: "premium",
      billingBypass: true,
    })).toEqual({ ok: false, status: 403, error: "Company not found" });
  });

  it("keeps a premium owner authorized and rejects an employee", () => {
    const owner = authorizeExecutiveAnalytics({
      decision: decision({
        owned: { id: ORG, name: "Slip Desk" },
        profileCompanyId: null,
        memberships: [],
      }),
      subscriptionTier: "premium",
      billingBypass: false,
    });
    expect(owner).toMatchObject({ ok: true, companyId: ORG, role: "company_owner" });

    const employee = authorizeExecutiveAnalytics({
      decision: decision({
        owned: null,
        profileCompanyId: null,
        memberships: [{ companyId: ORG, role: "employee", status: "active" }],
      }),
      subscriptionTier: "premium",
      billingBypass: true,
    });
    expect(employee).toEqual({ ok: false, status: 403, error: "Forbidden" });
  });
});

describe("apply attendance authorization", () => {
  const paid = { companyId: ORG, status: "paid" };

  it("lets payroll staff apply a paid run in their own company", () => {
    const access = decision({
      owned: { id: ORG, name: "Slip Desk" },
      profileCompanyId: null,
      memberships: [],
    });
    const caller = attendanceApplyCallerGate(access);
    expect(caller).toEqual({ proceed: true, companyId: ORG });
    expect(payRunInAuthorizedCompany(paid, ORG)).toBe(true);
    expect(employeesInAuthorizedCompany([ORG, ORG], ORG)).toBe(true);
  });

  it("lets an invited hr manager apply attendance only for the invited company", () => {
    const access = decision({
      owned: { id: "blank-owned", name: "" },
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "hr_manager", status: "active" }],
    });
    expect(attendanceApplyCallerGate(access)).toEqual({ proceed: true, companyId: ORG });
    expect(payRunInAuthorizedCompany({ companyId: OTHER, status: "paid" }, ORG)).toBe(false);
  });

  it("rejects another company's pay run id", () => {
    expect(payRunInAuthorizedCompany({ companyId: OTHER, status: "paid" }, ORG)).toBe(false);
    expect(payRunInAuthorizedCompany(null, ORG)).toBe(false);
  });

  it("rejects an employee and any role that cannot edit payroll or attendance", () => {
    const employee = decision({
      owned: null,
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "employee", status: "active" }],
    });
    expect(attendanceApplyCallerGate(employee)).toEqual({
      proceed: false,
      status: 403,
      error: "Forbidden",
    });
    const executive = decision({
      owned: null,
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "executive", status: "active" }],
    });
    expect(attendanceApplyCallerGate(executive).proceed).toBe(false);
  });

  it("rejects a missing or ambiguous company before a pay run is considered", () => {
    expect(attendanceApplyCallerGate(null)).toEqual({
      proceed: false,
      status: 403,
      error: "Forbidden",
    });
    const ambiguous = decision({
      owned: { id: "owned-real", name: "Owned Co" },
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "hr_manager", status: "active" }],
    });
    expect(ambiguous).toBeNull();
    expect(attendanceApplyCallerGate(ambiguous).proceed).toBe(false);
  });

  it("rejects employee rows that belong to a different company than the pay run", () => {
    expect(employeesInAuthorizedCompany([ORG, OTHER], ORG)).toBe(false);
    expect(employeesInAuthorizedCompany([ORG], ORG)).toBe(true);
  });
});

describe("payslip notification authorization", () => {
  it("lets payroll staff notify their own paid run", () => {
    const access = decision({
      owned: { id: "blank-owned", name: "" },
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "payroll_officer", status: "active" }],
    });
    expect(payslipNotifyCallerGate(access)).toEqual({ proceed: true, companyId: ORG });
    expect(paidRunInCompany({ companyId: ORG, status: "paid" }, ORG)).toBe(true);
    expect(recipientsInCompany([ORG], 1, ORG)).toBe(true);
  });

  it("rejects another company's pay run and recipients before any email", () => {
    expect(paidRunInCompany({ companyId: OTHER, status: "paid" }, ORG)).toBe(false);
    expect(recipientsInCompany([OTHER], 1, ORG)).toBe(false);
    expect(recipientsInCompany([ORG], 2, ORG)).toBe(false);
  });

  it("rejects an unauthorized role and ambiguous company access", () => {
    const employee = decision({
      owned: null,
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "employee", status: "active" }],
    });
    expect(payslipNotifyCallerGate(employee).proceed).toBe(false);
    expect(payslipNotifyCallerGate(null)).toEqual({ proceed: false, status: 403, error: "Forbidden" });
    const ambiguous = decision({
      owned: { id: "owned-real", name: "Owned Co" },
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "payroll_officer", status: "active" }],
    });
    expect(ambiguous).toBeNull();
    expect(payslipNotifyCallerGate(ambiguous).proceed).toBe(false);
  });
});

describe("calendar, compliance, and employee access", () => {
  it("allows payroll viewers and compliance viewers only their resolved company", () => {
    const payroll = decision({
      owned: { id: "blank-owned", name: "" },
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "payroll_officer", status: "active" }],
    });
    expect(authorizeCompanyPermission(payroll, "payroll:view")).toEqual({
      proceed: true,
      companyId: ORG,
      role: "payroll_officer",
    });

    const auditor = decision({
      owned: null,
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "auditor", status: "active" }],
    });
    expect(authorizeCompanyPermission(auditor, "payroll:view")).toMatchObject({
      proceed: false,
      error: "Forbidden",
    });
    expect(authorizeCompanyPermission(auditor, "compliance:view")).toEqual({
      proceed: true,
      companyId: ORG,
      role: "auditor",
    });
  });

  it("rejects unauthorized roles and ambiguous company access", () => {
    const executive = decision({
      owned: null,
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "executive", status: "active" }],
    });
    expect(authorizeCompanyPermission(executive, "compliance:view").proceed).toBe(false);
    expect(authorizeCompanyPermission(executive, "employee:view").proceed).toBe(false);
    expect(authorizeCompanyPermission(null, "payroll:view")).toEqual({
      proceed: false,
      status: 403,
      error: "No company",
    });
    const ambiguous = decision({
      owned: { id: "owned-real", name: "Owned Co" },
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "hr_manager", status: "active" }],
    });
    expect(authorizeCompanyPermission(ambiguous, "employee:view").proceed).toBe(false);
  });

  it("lists and adds employees on the invited company, not the blank signup company", () => {
    const hr = decision({
      owned: { id: "blank-owned", name: "" },
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "hr_manager", status: "active" }],
    });
    expect(authorizeCompanyPermission(hr, "employee:view", "Company not found")).toMatchObject({
      proceed: true,
      companyId: ORG,
    });
    expect(authorizeCompanyPermission(hr, "employee:create", "Company not found")).toMatchObject({
      proceed: true,
      companyId: ORG,
    });
    const employee = decision({
      owned: { id: "blank-owned", name: "" },
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "employee", status: "active" }],
    });
    expect(authorizeCompanyPermission(employee, "employee:view", "Company not found").proceed).toBe(false);
  });
});

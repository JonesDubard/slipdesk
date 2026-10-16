import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { accessDecisionFromRecords } from "@/lib/auth/resolve-app-company";
import {
  employeeOrStaffCanRead,
  leavePolicyVisible,
  staffCanReadCompanyRow,
} from "@/lib/auth/hr-select-policy";
import { can } from "@/lib/rbac";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const root = process.cwd();

const ROUTES = [
  "src/app/api/hr/leave/route.ts",
  "src/app/api/hr/attendance/route.ts",
  "src/app/api/hr/attendance-config/route.ts",
  "src/app/api/hr/notifications/route.ts",
  "src/app/api/hr/notifications/[id]/retry/route.ts",
  "src/app/api/hr/employees/[id]/portal-credentials/route.ts",
  "src/app/api/hr/employees/[id]/portal-invite/route.ts",
  "src/app/api/payroll/validate/route.ts",
  "src/app/api/hr/change-requests/route.ts",
  "src/app/api/hr/change-requests/[id]/route.ts",
  "src/app/api/payroll/runs/route.ts",
  "src/app/api/payroll/runs/[id]/route.ts",
  "src/app/api/payroll/runs/[id]/finalize/route.ts",
  "src/app/api/payroll/runs/consolidated/route.ts",
  "src/app/api/analytics/executive/route.ts",
  "src/app/api/payroll/apply-attendance/route.ts",
  "src/app/api/payroll/notify-payslips/route.ts",
  "src/app/api/payroll/email-payslips/route.ts",
  "src/app/api/payroll/calendar/route.ts",
  "src/app/api/compliance/snapshots/route.ts",
  "src/app/api/employees/route.ts",
];

describe("shared company access", () => {
  it("keeps an invited hr_manager on the invited company when they also own a blank company", () => {
    expect(accessDecisionFromRecords({
      owned: { id: "blank-owned", name: "" },
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "hr_manager", status: "active" }],
    })).toEqual({ companyId: ORG, role: "hr_manager" });
  });

  it("leaves a named owned company and a membership unresolved without a profile selection", () => {
    expect(accessDecisionFromRecords({
      owned: { id: "owned-real", name: "Owned Co" },
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "hr_manager", status: "active" }],
    })).toBeNull();
  });

  it("keeps a single-company owner as company_owner", () => {
    expect(accessDecisionFromRecords({
      owned: { id: ORG, name: "Slip Desk" },
      profileCompanyId: null,
      memberships: [],
    })).toEqual({ companyId: ORG, role: "company_owner" });
  });

  it("does not grant payroll or HR access when the user has no company", () => {
    expect(accessDecisionFromRecords({
      owned: null,
      profileCompanyId: null,
      memberships: [],
    })).toBeNull();
    expect(can("employee", "payroll:view")).toBe(false);
    expect(can("employee", "leave:review")).toBe(false);
    expect(can("auditor", "payroll:edit")).toBe(false);
    expect(can("auditor", "leave:review")).toBe(false);
    expect(can("hr_manager", "leave:review")).toBe(true);
    expect(can("company_owner", "payroll:view")).toBe(true);
  });

  it("points every payroll and HR route at the shared resolver", () => {
    const payrollResolver = readFileSync(join(root, "src/lib/payroll/resolve-payroll-access.ts"), "utf8");
    expect(payrollResolver).toContain("resolveAppCompanyAccess");
    expect(payrollResolver).not.toContain(".limit(1)");

    for (const route of ROUTES) {
      const source = readFileSync(join(root, route), "utf8");
      expect(source, route).toContain("resolveAppCompanyAccess");
      expect(source, route).not.toContain("eq(\"owner_id\"");
      expect(source, route).not.toContain(".limit(1)");
    }
  });
});

describe("tenant SELECT predicates", () => {
  it("denies company A staff a row that belongs to company B", () => {
    expect(staffCanReadCompanyRow(true, OTHER, ORG)).toBe(false);
    expect(employeeOrStaffCanRead({
      isStaff: true,
      rowCompanyId: OTHER,
      myCompanyId: ORG,
      rowEmployeeId: "employee-b",
      myEmployeeId: "employee-a",
    })).toBe(false);
    expect(leavePolicyVisible({
      isStaff: true,
      rowCompanyId: OTHER,
      myCompanyId: ORG,
      employeeCompanyId: ORG,
    })).toBe(false);
  });

  it("allows staff their own company and an employee only their own row or policy", () => {
    expect(staffCanReadCompanyRow(true, ORG, ORG)).toBe(true);
    expect(employeeOrStaffCanRead({
      isStaff: false,
      rowCompanyId: ORG,
      myCompanyId: null,
      rowEmployeeId: "employee-a",
      myEmployeeId: "employee-a",
    })).toBe(true);
    expect(employeeOrStaffCanRead({
      isStaff: false,
      rowCompanyId: ORG,
      myCompanyId: ORG,
      rowEmployeeId: "employee-b",
      myEmployeeId: "employee-a",
    })).toBe(false);
    expect(leavePolicyVisible({
      isStaff: false,
      rowCompanyId: OTHER,
      myCompanyId: null,
      employeeCompanyId: ORG,
    })).toBe(false);
    expect(leavePolicyVisible({
      isStaff: false,
      rowCompanyId: ORG,
      myCompanyId: null,
      employeeCompanyId: ORG,
    })).toBe(true);
  });
});

describe("migration 0025", () => {
  const sql = readFileSync(join(root, "supabase/migrations/0025_tenant_scope_hr_select_policies.sql"), "utf8");

  const policies = [
    "leave_requests_select",
    "leave_events_select",
    "attendance_select",
    "ot_select",
    "leave_policies_select",
    "leave_balances_select",
    "leave_ledger_select",
    "weekly_ot_select",
    "att_config_select",
    "reminder_log_select",
    "scheduler_runs_select",
    "payroll_val_select",
    "notif_prefs_select_own",
  ];

  it("recreates each SELECT policy with a company predicate and does not open writes", () => {
    for (const name of policies) {
      expect(sql, name).toContain(`drop policy if exists ${name}`);
      expect(sql, name).toContain(`create policy ${name}`);
    }
    const companyScopes = sql.split("company_id = public.my_company_id()").length - 1;
    expect(companyScopes).toBe(policies.length);
    expect(sql).not.toContain("my_employee_id() is not null");
    expect(sql).not.toContain("for insert");
    expect(sql).not.toContain("for update");
    expect(sql).not.toContain("for all");
    expect(sql).not.toContain("create table");
  });

  it("keeps employee self-access on tables that store employee_id", () => {
    expect(sql).toContain("employee_id = public.my_employee_id()");
    expect(sql).toContain("lr.employee_id = public.my_employee_id()");
    expect(sql).toContain("where e.id = public.my_employee_id()");
  });
});

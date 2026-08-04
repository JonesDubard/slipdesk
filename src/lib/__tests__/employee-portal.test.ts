import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateTemporaryPin,
  validatePasswordPolicy,
  isScryptHash,
} from "@/lib/employee-portal/password";
import { ACTIVE_AUTH_METHOD } from "@/lib/employee-portal/auth-method";
import { OtpAuthUnsupported } from "@/lib/employee-portal/otp";
import { normalizeLiberianPhone, employeePortalEmail } from "@/lib/employee-portal/phone";
import { assertOwnEmployee, canReviewChangeRequests, type LinkedEmployee } from "@/lib/employee-portal/session";
import {
  validateChangeRequestPayload,
  snapshotOldValue,
  approvedPatchFromRequest,
  isChangeRequestFieldType,
} from "@/lib/employee-portal/change-requests";
import { mergePayslipCache, MAX_CACHED_PAYSLIPS } from "@/lib/employee-portal/offline-cache";
import { aggregateNasscorpLines, toUsd } from "@/lib/employee-portal/nasscorp";
import { canManagePortalCredentials } from "@/lib/employee-portal/hr-access";
import { can, normalizeRole } from "@/lib/rbac";
import type { EmployeePayslip } from "@/lib/employee-portal/payslips";

const me: LinkedEmployee = {
  id: "emp-self",
  companyId: "co-1",
  userId: "user-1",
  employeeNumber: "E001",
  fullName: "Ada Lovelace",
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "0775123456",
  phoneE164: "+231775123456",
  email: "",
  address: "Broad Street",
  county: "Montserrado",
  jobTitle: "Engineer",
  department: "IT",
  paymentMethod: "bank_transfer",
  bankName: "GT Bank",
  accountNumber: "123",
  bankBranch: "Monrovia",
  momoNumber: "",
  nasscorpNumber: "N-1",
};

describe("password/PIN hashing", () => {
  it("stores scrypt hashes and verifies correctly (never plaintext)", () => {
    const pin = "48291037";
    const hash = hashPassword(pin);
    expect(isScryptHash(hash)).toBe(true);
    expect(hash).not.toContain(pin);
    expect(verifyPassword(pin, hash)).toBe(true);
    expect(verifyPassword("000000", hash)).toBe(false);
  });

  it("generates temporary PINs and enforces policy", () => {
    const pin = generateTemporaryPin(8);
    expect(pin).toMatch(/^\d{8}$/);
    expect(validatePasswordPolicy("12345")).toBeTruthy();
    expect(validatePasswordPolicy("123456")).toBeNull();
  });
});

describe("AuthMethod abstraction", () => {
  it("uses password as the active method; OTP stub is unsupported", async () => {
    expect(ACTIVE_AUTH_METHOD).toBe("password");
    const otp = new OtpAuthUnsupported();
    const res = await otp.authenticate();
    expect(res.ok).toBe(false);
    expect(res.status).toBe(501);
  });
});

describe("phone as username (no SMS)", () => {
  it("normalizes Liberian phones", () => {
    expect(normalizeLiberianPhone("0775123456")).toBe("+231775123456");
    expect(employeePortalEmail("a-b")).toBe("emp_ab@employees.slipdesk.internal");
  });
});

describe("data isolation authorization", () => {
  it("rejects cross-employee access attempts", () => {
    expect(assertOwnEmployee(null).ok).toBe(false);
    const cross = assertOwnEmployee(me, "emp-other");
    expect(cross.ok).toBe(false);
    if (!cross.ok) expect(cross.status).toBe(403);
    expect(assertOwnEmployee(me, "emp-self").ok).toBe(true);
  });

  it("scopes employee RBAC to portal permissions only", () => {
    const role = normalizeRole("employee");
    expect(can(role, "portal:view_own")).toBe(true);
    expect(can(role, "employee:view")).toBe(false);
    expect(can(role, "portal:review_changes")).toBe(false);
  });

  it("allows HR to manage portal credentials and review changes", () => {
    expect(canManagePortalCredentials("hr_manager")).toBe(true);
    expect(canManagePortalCredentials("company_owner")).toBe(true);
    expect(canManagePortalCredentials("employee")).toBe(false);
    expect(canReviewChangeRequests("hr_manager")).toBe(true);
  });
});

describe("change requests never auto-apply", () => {
  it("validates payloads and builds patches only for approved path", () => {
    expect(isChangeRequestFieldType("address")).toBe(true);
    expect(validateChangeRequestPayload("address", { address: "12 Broad St Monrovia" })).toBeNull();
    expect(snapshotOldValue("phone", me)).toEqual({ phone: me.phone });
    expect(approvedPatchFromRequest("address", { address: "New Rd" })).toEqual({ address: "New Rd" });
  });
});

describe("offline payslip cache", () => {
  it("keeps only the last 3 viewed payslips", () => {
    const mk = (id: string): EmployeePayslip =>
      ({
        id,
        payRunId: "r",
        employeeId: "emp-self",
        periodLabel: id,
        payPeriodStart: "2026-01-01",
        payPeriodEnd: "2026-01-31",
        payDate: "2026-01-31",
        currency: "USD",
        rate: 1,
        regularHours: 160,
        overtimeHours: 0,
        holidayHours: 0,
        additionalEarnings: 0,
        exchangeRate: 1,
        grossPay: 100,
        incomeTax: 10,
        nasscorpEe: 4,
        nasscorpEr: 6,
        netPay: 86,
        employeeNumber: "E001",
        fullName: "Ada",
        jobTitle: "Eng",
        department: "IT",
        status: "paid",
      });
    let cache: EmployeePayslip[] = [];
    cache = mergePayslipCache(cache, mk("a"));
    cache = mergePayslipCache(cache, mk("b"));
    cache = mergePayslipCache(cache, mk("c"));
    cache = mergePayslipCache(cache, mk("d"));
    expect(cache).toHaveLength(MAX_CACHED_PAYSLIPS);
    expect(cache.map((p) => p.id)).toEqual(["d", "c", "b"]);
  });
});

describe("NASSCORP currency normalization", () => {
  it("converts LRD to USD via exchange rate", () => {
    expect(toUsd(18544, "LRD", 185.44)).toBeCloseTo(100, 5);
    const runMap = new Map([
      ["r1", { period_label: "Jan", pay_date: "2026-01-31" }],
      ["r2", { period_label: "Feb", pay_date: "2026-02-28" }],
    ]);
    const agg = aggregateNasscorpLines(
      [
        { id: "a", pay_run_id: "r1", nasscorp_ee: 4, nasscorp_er: 6, currency: "USD", exchange_rate: 185 },
        { id: "b", pay_run_id: "r2", nasscorp_ee: 1854.4, nasscorp_er: 2781.6, currency: "LRD", exchange_rate: 185.44 },
      ],
      runMap,
    );
    expect(agg.employeeContributionTotal).toBeCloseTo(14, 1);
    expect(agg.byCurrency).toHaveLength(2);
  });
});

describe("admin reset must not persist plaintext", () => {
  it("hash format never embeds the temporary PIN", () => {
    const temp = "91827364";
    const stored = hashPassword(temp);
    expect(stored.includes(temp)).toBe(false);
    expect(JSON.stringify({ action: "reset", hash: stored }).includes(temp)).toBe(false);
  });
});

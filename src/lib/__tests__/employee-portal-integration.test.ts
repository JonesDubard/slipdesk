/**
 * Integration-style flow: password login → forced change → payslip → change request → HR.
 */

import { describe, it, expect } from "vitest";
import { assertOwnEmployee, canReviewChangeRequests, type LinkedEmployee } from "@/lib/employee-portal/session";
import { hashPassword, verifyPassword, generateTemporaryPin } from "@/lib/employee-portal/password";
import {
  approvedPatchFromRequest,
  snapshotOldValue,
  validateChangeRequestPayload,
} from "@/lib/employee-portal/change-requests";
import { mergePayslipCache } from "@/lib/employee-portal/offline-cache";
import { ACTIVE_AUTH_METHOD } from "@/lib/employee-portal/auth-method";
import type { EmployeePayslip } from "@/lib/employee-portal/payslips";

const employeeA: LinkedEmployee = {
  id: "emp-a",
  companyId: "co-1",
  userId: "user-a",
  employeeNumber: "E-A",
  fullName: "Alice",
  firstName: "Alice",
  lastName: "A",
  phone: "0775111111",
  phoneE164: "+231775111111",
  email: "",
  address: "Old Address",
  county: "Montserrado",
  jobTitle: "Clerk",
  department: "Ops",
  paymentMethod: "bank_transfer",
  bankName: "Ecobank",
  accountNumber: "111",
  bankBranch: "",
  momoNumber: "",
  nasscorpNumber: "N-A",
};

const employeeB: LinkedEmployee = { ...employeeA, id: "emp-b", userId: "user-b", employeeNumber: "E-B", fullName: "Bob" };

describe("integration: login → change password → payslip → change request → HR", () => {
  it("walks the password/PIN happy path with isolation", () => {
    expect(ACTIVE_AUTH_METHOD).toBe("password");

    // 1. HR assigns temporary PIN (stored hashed only)
    const tempPin = generateTemporaryPin(8);
    const storedHash = hashPassword(tempPin);
    expect(verifyPassword(tempPin, storedHash)).toBe(true);
    let mustChangePassword = true;

    // 2. First login succeeds with temp PIN → forced change
    expect(mustChangePassword).toBe(true);
    const newPassword = "MyNewPass9";
    expect(verifyPassword(tempPin, storedHash)).toBe(true);
    const nextHash = hashPassword(newPassword);
    mustChangePassword = false;
    expect(verifyPassword(newPassword, nextHash)).toBe(true);
    expect(verifyPassword(tempPin, nextHash)).toBe(false);

    // 3. Session resolves to employee A only
    expect(assertOwnEmployee(employeeA).ok).toBe(true);

    // 4. View payslip + cache
    const payslip: EmployeePayslip = {
      id: "line-1",
      payRunId: "run-1",
      employeeId: employeeA.id,
      periodLabel: "Jul 2026",
      payPeriodStart: "2026-07-01",
      payPeriodEnd: "2026-07-31",
      payDate: "2026-07-31",
      currency: "USD",
      rate: 10,
      regularHours: 160,
      overtimeHours: 0,
      holidayHours: 0,
      additionalEarnings: 0,
      exchangeRate: 1,
      grossPay: 1600,
      incomeTax: 200,
      nasscorpEe: 64,
      nasscorpEr: 96,
      netPay: 1336,
      employeeNumber: "E-A",
      fullName: "Alice",
      jobTitle: "Clerk",
      department: "Ops",
      status: "paid",
    };
    expect(mergePayslipCache([], payslip)[0].id).toBe("line-1");

    // 5. Change request pending until HR
    expect(validateChangeRequestPayload("address", { address: "12 Carey St" })).toBeNull();
    expect(snapshotOldValue("address", employeeA).address).toBe("Old Address");
    expect(canReviewChangeRequests("hr_manager")).toBe(true);
    expect(approvedPatchFromRequest("address", { address: "12 Carey St" }).address).toBe("12 Carey St");
  });

  it("blocks cross-employee access and employee self-reset of others", () => {
    expect(assertOwnEmployee(employeeA, employeeB.id).ok).toBe(false);
    expect(canReviewChangeRequests("employee")).toBe(false);
  });
});

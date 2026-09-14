import { describe, expect, it } from "vitest";
import {
  buildDraftPayload,
  computeDraftTotals,
  parseDraftPayload,
} from "@/lib/payroll/draft-persistence";
import {
  DRAFT_AUTOSAVE_STATUSES,
  FINALIZED_PAY_RUN_STATUSES,
} from "@/lib/payroll/resolve-payroll-access";
import {
  bankDisbursementRows,
  buildDisbursementRows,
  mobileMoneyDisbursementRows,
  rowsFromFinalizedPayroll,
} from "@/lib/reports/disbursement";
import {
  lraExportRows,
  lraExportRowsFromFinalized,
  nasscorpExportRows,
  nasscorpExportRowsFromFinalized,
} from "@/lib/compliance/statutory-exports";
import { normalizeGender } from "@/lib/employee-gender";
import {
  estimatePayslipLayoutUnits,
  PAYSLIP_ONE_PAGE_MAX_UNITS,
} from "@/lib/payslip-layout";
import { computePayroll } from "@/lib/reporting";
import type { Employee } from "@/context/AppContext";

const baseEmployee = (overrides: Partial<Employee> = {}): Employee => ({
  id: "e1",
  employeeNumber: "EMP-1",
  firstName: "Ada",
  middleName: "",
  lastName: "Lovelace",
  fullName: "Ada Lovelace",
  jobTitle: "Dev",
  department: "Eng",
  email: "a@co.lr",
  phone: "",
  county: "Montserrado",
  startDate: "2024-01-01",
  employmentType: "full_time",
  currency: "USD",
  rate: 10,
  standardHours: 173.33,
  allowances: 50,
  nasscorpNumber: "NSC-1",
  paymentMethod: "bank_transfer",
  bankName: "Ecobank",
  accountNumber: "123",
  momoNumber: "",
  isActive: true,
  isArchived: false,
  branch: "Monrovia HQ",
  gender: "",
  ...overrides,
});

describe("payroll draft persistence", () => {
  it("round-trips draft payload", () => {
    const payload = buildDraftPayload({
      periodLabel: "Sep 2026",
      payDate: "2026-09-30",
      runType: "monthly",
      exchangeRate: 185.44,
      status: "draft",
      runStarted: true,
      lines: [],
    });
    const parsed = parseDraftPayload(payload);
    expect(parsed?.runStarted).toBe(true);
    expect(parsed?.lines).toEqual([]);
  });

  it("computes draft totals from calc lines", () => {
    const employees = [baseEmployee()];
    const rows = computePayroll(employees);
    const line = {
      id: "e1",
      employeeId: "e1",
      employeeNumber: "EMP-1",
      fullName: "Ada Lovelace",
      jobTitle: "Dev",
      department: "Eng",
      currency: "USD" as const,
      rate: 10,
      regularHours: 173.33,
      overtimeHours: 0,
      holidayHours: 0,
      additionalEarnings: 50,
      exchangeRate: 185.44,
      calc: rows[0].result,
    };
    const totals = computeDraftTotals([line], 185.44);
    expect(totals.employeeCount).toBe(1);
    expect(totals.totalGross).toBeGreaterThan(0);
  });

  it("blocks autosave on finalized statuses", () => {
    expect(DRAFT_AUTOSAVE_STATUSES).toContain("draft");
    expect(FINALIZED_PAY_RUN_STATUSES).toContain("paid");
    expect(DRAFT_AUTOSAVE_STATUSES).not.toContain("paid");
  });
});

describe("disbursement reports", () => {
  it("builds bank and momo export subsets from live employees", () => {
    const rows = buildDisbursementRows([
      baseEmployee(),
      baseEmployee({
        id: "e2",
        employeeNumber: "EMP-2",
        fullName: "Bob Mo",
        paymentMethod: "mtn_momo",
        momoNumber: "0770000001",
        accountNumber: "",
      }),
    ]);
    expect(bankDisbursementRows(rows)).toHaveLength(1);
    expect(mobileMoneyDisbursementRows(rows)).toHaveLength(1);
  });

  it("builds disbursement rows from finalized pay_run_lines without recalc", () => {
    const finalized = rowsFromFinalizedPayroll([
      {
        employeeNumber: "EMP-1",
        fullName: "Ada Lovelace",
        currency: "USD",
        grossPay: 2000,
        netPay: 1700,
        incomeTax: 200,
        nasscorpEe: 80,
        deductions: 20,
        paymentMethod: "bank_transfer",
        accountNumber: "123",
      },
    ]);
    expect(finalized[0].netSalary).toBe(1700);
    expect(bankDisbursementRows(finalized)).toHaveLength(1);
  });
});

describe("statutory exports", () => {
  it("maps LRA and NASSCORP rows from payroll compute", () => {
    const rows = computePayroll([baseEmployee()]);
    const employer = {
      companyName: "ACME",
      tin: "TIN-1",
      nasscorpRegNo: "NSS-EMP",
      periodLabel: "Sep 2026",
    };
    expect(lraExportRows(employer, rows)[0][0]).toBe("ACME");
    expect(nasscorpExportRows(employer, rows)[0][6]).toMatch(/\d/);
  });

  it("maps LRA and NASSCORP from finalized lines", () => {
    const employer = { companyName: "ACME", tin: "TIN-1", nasscorpRegNo: "NSS", periodLabel: "Sep 2026" };
    const line = {
      employeeNumber: "EMP-1",
      fullName: "Ada",
      currency: "USD",
      grossPay: 1000,
      netPay: 860,
      incomeTax: 100,
      nasscorpEe: 40,
      nasscorpEr: 60,
    };
    expect(lraExportRowsFromFinalized(employer, [line])[0][7]).toBe("100.00");
    expect(nasscorpExportRowsFromFinalized(employer, [line])[0][6]).toBe("40.00");
  });
});

describe("gender normalization", () => {
  it("maps unknown to prefer_not_to_say and rejects truly invalid values", () => {
    expect(normalizeGender("Male").value).toBe("male");
    expect(normalizeGender("").value).toBe("");
    expect(normalizeGender("unknown").value).toBe("prefer_not_to_say");
    expect(normalizeGender("invalid").error).toBeTruthy();
  });
});

describe("payslip one-page layout", () => {
  it("fits typical and stress-case payslips within layout budget", () => {
    const rows = computePayroll([baseEmployee()]);
    const typical = {
      id: "e1",
      employeeId: "e1",
      employeeNumber: "EMP-1",
      fullName: "Ada Lovelace",
      jobTitle: "Dev",
      department: "Eng",
      currency: "USD" as const,
      rate: 10,
      regularHours: 173.33,
      overtimeHours: 0,
      holidayHours: 0,
      additionalEarnings: 50,
      deductions: 0,
      deductionItems: [],
      exchangeRate: 185.44,
      calc: rows[0].result,
      paymentMethod: "bank_transfer" as const,
      bankName: "Ecobank",
      accountNumber: "123",
    };
    expect(estimatePayslipLayoutUnits(typical)).toBeLessThanOrEqual(PAYSLIP_ONE_PAGE_MAX_UNITS);

    const stress = {
      ...typical,
      fullName: "Christopher Alexander Montgomery-Williams III",
      overtimeHours: 12,
      holidayHours: 8,
      additionalEarnings: 200,
      deductions: 350,
      deductionItems: [
        { label: "Pay Advance", amount: 100 },
        { label: "Food", amount: 50 },
        { label: "Transport", amount: 75 },
        { label: "Loan", amount: 125 },
      ],
      paymentMethod: "mtn_momo" as const,
      mobileNumber: "0770000001",
    };
    expect(estimatePayslipLayoutUnits(stress)).toBeLessThanOrEqual(PAYSLIP_ONE_PAGE_MAX_UNITS);
  });
});

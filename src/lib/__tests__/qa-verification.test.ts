import { describe, expect, it } from "vitest";
import {
  buildDraftPayload,
  parseDraftPayload,
  computeDraftTotals,
} from "@/lib/payroll/draft-persistence";
import {
  DRAFT_AUTOSAVE_STATUSES,
  FINALIZED_PAY_RUN_STATUSES,
} from "@/lib/payroll/resolve-payroll-access";
import {
  employeeMatchesBranchName,
  filterEmployeesForBranchScope,
  parseBranchIdParam,
  branchScopeKey,
  ORG_WIDE_BRANCH_PARAM,
} from "@/lib/payroll/branch-scope";
import {
  bankDisbursementRows,
  buildDisbursementRows,
  mobileMoneyDisbursementRows,
  rowsFromFinalizedPayroll,
} from "@/lib/reports/disbursement";
import {
  lraExportRows,
  lraExportRowsFromFinalized,
  mapPayRunLineRowToFinalized,
  nasscorpExportRows,
  nasscorpExportRowsFromFinalized,
} from "@/lib/compliance/statutory-exports";
import { persistStatutoryBases } from "@/lib/payroll/statutory-bases";
import { calculatePayroll, roundCurrency } from "@/lib/slipdesk-payroll-engine";
import { normalizeGender } from "@/lib/employee-gender";
import {
  estimatePayslipLayoutUnits,
  PAYSLIP_ONE_PAGE_MAX_UNITS,
} from "@/lib/payslip-layout";
import { computePayroll } from "@/lib/reporting";
import { filterPayRunView } from "@/lib/payroll/grid-view-filter";
import type { Employee } from "@/context/AppContext";

const baseEmployee = (overrides: Partial<Employee> = {}): Employee => ({
  id: "e1",
  employeeNumber: "EMP-1",
  firstName: "Ada",
  middleName: "James",
  lastName: "Lovelace",
  fullName: "Ada James Lovelace",
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
  gender: "female",
  ...overrides,
});

describe("QA: payroll draft persistence", () => {
  it("round-trips draft payload after line edits", () => {
    const rows = computePayroll([baseEmployee()]);
    const line = {
      id: "e1",
      employeeId: "e1",
      employeeNumber: "EMP-1",
      fullName: "Ada James Lovelace",
      jobTitle: "Dev",
      department: "Eng",
      currency: "USD" as const,
      rate: 12,
      regularHours: 173.33,
      overtimeHours: 4,
      holidayHours: 0,
      additionalEarnings: 50,
      exchangeRate: 185.44,
      calc: rows[0].result,
      deductions: 25,
      deductionItems: [{ label: "Advance", amount: 25 }],
    };
    const payload = buildDraftPayload({
      periodLabel: "Sep 2026",
      payDate: "2026-09-30",
      runType: "monthly",
      exchangeRate: 185.44,
      status: "draft",
      runStarted: true,
      lines: [line],
    });
    const parsed = parseDraftPayload(payload);
    expect(parsed?.lines[0].rate).toBe(12);
    expect(parsed?.lines[0].overtimeHours).toBe(4);
    expect(computeDraftTotals(parsed!.lines, 185.44).employeeCount).toBe(1);
  });

  it("blocks autosave statuses on finalized runs", () => {
    expect(DRAFT_AUTOSAVE_STATUSES).not.toContain("paid");
    expect(FINALIZED_PAY_RUN_STATUSES).toContain("paid");
    expect(FINALIZED_PAY_RUN_STATUSES).toContain("archived");
  });
});

describe("QA: branch-scoped payroll helpers", () => {
  it("filters employees by branch name (case-insensitive)", () => {
    const emps = [
      baseEmployee(),
      baseEmployee({ id: "e2", employeeNumber: "EMP-2", branch: "Buchanan" }),
    ];
    expect(filterEmployeesForBranchScope(emps, "Monrovia HQ")).toHaveLength(1);
    expect(filterEmployeesForBranchScope(emps, null)).toHaveLength(2);
    expect(employeeMatchesBranchName(emps[1], "buchanan")).toBe(true);
  });

  it("parses org-wide branch query param", () => {
    expect(parseBranchIdParam("all")).toBe(null);
    expect(parseBranchIdParam("uuid-1")).toBe("uuid-1");
    expect(branchScopeKey(null)).toBe(ORG_WIDE_BRANCH_PARAM);
  });
});

describe("QA: disbursement and statutory exports", () => {
  it("splits bank vs mobile money subsets", () => {
    const rows = buildDisbursementRows([
      baseEmployee(),
      baseEmployee({
        id: "e2",
        employeeNumber: "EMP-2",
        paymentMethod: "mtn_momo",
        momoNumber: "0770000001",
        accountNumber: "",
      }),
    ]);
    expect(bankDisbursementRows(rows)).toHaveLength(1);
    expect(mobileMoneyDisbursementRows(rows)).toHaveLength(1);
  });

  it("builds exports from finalized lines without recalc", () => {
    const finalized = rowsFromFinalizedPayroll([
      {
        employeeNumber: "EMP-1",
        fullName: "Ada",
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
    const employer = { companyName: "ACME", tin: "TIN", nasscorpRegNo: "NSS", periodLabel: "Sep 2026" };
    expect(finalized[0].netSalary).toBe(1700);
    expect(lraExportRowsFromFinalized(employer, [{
      employeeNumber: "EMP-1",
      fullName: "Ada",
      currency: "USD",
      grossPay: 2000,
      netPay: 1720,
      incomeTax: 200,
      nasscorpEe: 80,
      nasscorpEr: 120,
    }])[0][7]).toBe("200.00");
    expect(nasscorpExportRowsFromFinalized(employer, [{
      employeeNumber: "EMP-1",
      fullName: "Ada",
      currency: "USD",
      grossPay: 2000,
      netPay: 1720,
      incomeTax: 200,
      nasscorpEe: 80,
      nasscorpEr: 120,
    }])[0][6]).toBe("80.00");
  });

  it("keeps finalized LRA Taxable Income on the PAYE base when extras + OT + holiday are present", () => {
    const employee = baseEmployee({ rate: 12, standardHours: 173.33, allowances: 150 });
    const result = calculatePayroll({
      employeeId: employee.id,
      currency: "USD",
      rate: 12,
      regularHours: 173.33,
      overtimeHours: 6,
      holidayHours: 8,
      exchangeRate: 185.44,
      additionalEarnings: 150,
    });
    const employer = { companyName: "ACME", tin: "TIN", nasscorpRegNo: "NSS", periodLabel: "Sep 2026" };
    const payeBase = roundCurrency(result.regularSalary + result.overtimePay + result.holidayPay);
    const persisted = persistStatutoryBases(result);
    const live = lraExportRows(employer, [{
      employee, result, usd: {
        gross: result.grossPay, net: result.netPay, incomeTax: result.Paye.taxInBase,
        nasscorpEe: result.nasscorp.employeeContribution, nasscorpEr: result.nasscorp.employerContribution,
      },
    }]);
    const finalized = lraExportRowsFromFinalized(employer, [mapPayRunLineRowToFinalized({
      employee_number: employee.employeeNumber,
      full_name: employee.fullName,
      currency: "USD",
      gross_pay: result.grossPay,
      additional_earnings: result.additionalEarnings,
      income_tax: result.Paye.taxInBase,
      nasscorp_ee: result.nasscorp.employeeContribution,
      nasscorp_er: result.nasscorp.employerContribution,
      net_pay: result.netPay,
      taxable_pay: persisted.taxable_pay,
      nasscorp_base: persisted.nasscorp_base,
      rate: 12,
      regular_hours: 173.33,
    })]);

    expect(result.grossPay).toBeGreaterThan(payeBase);
    expect(payeBase).toBeGreaterThan(result.nasscorp.base);
    expect(live[0][6]).toBe(payeBase.toFixed(2));
    expect(finalized[0][6]).toBe(payeBase.toFixed(2));
    expect(finalized[0][6]).toBe(live[0][6]);
    expect(finalized[0][5]).toBe(result.grossPay.toFixed(2));
  });

  it("keeps finalized NASSCORP Contribution Base on regularSalary so EE/ER stay 4%/6%", () => {
    const employee = baseEmployee({ rate: 12, standardHours: 173.33, allowances: 150 });
    const result = calculatePayroll({
      employeeId: employee.id,
      currency: "USD",
      rate: 12,
      regularHours: 173.33,
      overtimeHours: 6,
      holidayHours: 8,
      exchangeRate: 185.44,
      additionalEarnings: 150,
    });
    const employer = { companyName: "ACME", tin: "TIN", nasscorpRegNo: "NSS", periodLabel: "Sep 2026" };
    const persisted = persistStatutoryBases(result);
    const live = nasscorpExportRows(employer, [{
      employee, result, usd: {
        gross: result.grossPay, net: result.netPay, incomeTax: result.Paye.taxInBase,
        nasscorpEe: result.nasscorp.employeeContribution, nasscorpEr: result.nasscorp.employerContribution,
      },
    }]);
    const fallback = nasscorpExportRowsFromFinalized(employer, [mapPayRunLineRowToFinalized({
      employee_number: employee.employeeNumber,
      full_name: employee.fullName,
      currency: "USD",
      gross_pay: result.grossPay,
      additional_earnings: result.additionalEarnings,
      income_tax: result.Paye.taxInBase,
      nasscorp_ee: result.nasscorp.employeeContribution,
      nasscorp_er: result.nasscorp.employerContribution,
      net_pay: result.netPay,
      rate: 12,
      regular_hours: 173.33,
    })]);
    const persistedRows = nasscorpExportRowsFromFinalized(employer, [mapPayRunLineRowToFinalized({
      employee_number: employee.employeeNumber,
      full_name: employee.fullName,
      currency: "USD",
      gross_pay: result.grossPay,
      additional_earnings: result.additionalEarnings,
      income_tax: result.Paye.taxInBase,
      nasscorp_ee: result.nasscorp.employeeContribution,
      nasscorp_er: result.nasscorp.employerContribution,
      net_pay: result.netPay,
      taxable_pay: persisted.taxable_pay,
      nasscorp_base: persisted.nasscorp_base,
      rate: 12,
      regular_hours: 173.33,
    })]);
    const reportedBase = Number(persistedRows[0][8]);

    expect(reportedBase).toBe(result.regularSalary);
    expect(reportedBase).not.toBe(result.grossPay);
    expect(live[0][8]).toBe(persistedRows[0][8]);
    expect(fallback[0][8]).toBe(persistedRows[0][8]);
    expect(result.nasscorp.employeeContribution).toBe(roundCurrency(reportedBase * 0.04));
    expect(result.nasscorp.employerContribution).toBe(roundCurrency(reportedBase * 0.06));
  });
});

describe("QA: gender CSV normalization", () => {
  it("accepts gender aliases and allows blank", () => {
    expect(normalizeGender("Female").value).toBe("female");
    expect(normalizeGender("").value).toBe("");
    expect(normalizeGender("invalid").error).toBeTruthy();
  });
});

describe("QA: one-page payslip layout budget", () => {
  it("fits long name with 4+ deduction items", () => {
    const rows = computePayroll([baseEmployee({ rate: 15, allowances: 200 })]);
    const stress = {
      id: "e1",
      employeeId: "e1",
      employeeNumber: "EMP-1",
      fullName: "Christopher Alexander Montgomery-Williams III",
      jobTitle: "Senior Operations Manager",
      department: "Operations",
      currency: "USD" as const,
      rate: 15,
      regularHours: 173.33,
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
      exchangeRate: 185.44,
      calc: rows[0].result,
      paymentMethod: "mtn_momo" as const,
      mobileNumber: "0770000001",
    };
    expect(estimatePayslipLayoutUnits(stress)).toBeLessThanOrEqual(PAYSLIP_ONE_PAGE_MAX_UNITS);
  });
});

describe("QA: payroll grid view filter/sort (pure)", () => {
  it("defaults to numeric employee-number order, not name", () => {
    const lines = [
      { id: "1", fullName: "Zara Zen", employeeNumber: "EMP-10", department: "Finance", paymentMethod: "bank_transfer" },
      { id: "2", fullName: "Ada Lovelace", employeeNumber: "EMP-1", department: "Operations", paymentMethod: "mtn_momo" },
      { id: "3", fullName: "Bob Mo", employeeNumber: "EMP-2", department: "Operations", paymentMethod: "cash" },
    ];
    const byNumber = filterPayRunView(lines);
    expect(byNumber.map((l) => l.employeeNumber)).toEqual(["EMP-1", "EMP-2", "EMP-10"]);
    const byName = filterPayRunView(lines, { sortBy: "name-asc" });
    expect(byName[0].fullName).toBe("Ada Lovelace");
    expect(byName[byName.length - 1].fullName).toBe("Zara Zen");
  });

  it("jumps to an employee number and keeps optional dept/method filters", () => {
    const lines = [
      { id: "1", fullName: "Zara Zen", employeeNumber: "EMP-452", department: "Finance", paymentMethod: "bank_transfer" },
      { id: "2", fullName: "Ada Lovelace", employeeNumber: "EMP-1", department: "Operations", paymentMethod: "mtn_momo" },
      { id: "3", fullName: "Bob Mo", employeeNumber: "EMP-2", department: "Operations", paymentMethod: "cash" },
    ];
    const jumped = filterPayRunView(lines, { nameQuery: "452" });
    expect(jumped.map((l) => l.employeeNumber)).toEqual(["EMP-452"]);
    const ops = filterPayRunView(lines, { department: "Operations" });
    expect(ops).toHaveLength(2);
    expect(ops.every((l) => l.department === "Operations")).toBe(true);
    const momo = filterPayRunView(lines, { paymentMethod: "mtn_momo" });
    expect(momo.map((l) => l.employeeNumber)).toEqual(["EMP-1"]);
    expect(lines).toHaveLength(3);
  });
});

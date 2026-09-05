import { describe, expect, it } from "vitest";
import type { FinalizedPayrollLine } from "@/lib/compliance/statutory-exports";
import {
  PAYROLL_DISBURSEMENT_HEADERS,
  PAYROLL_REGISTER_HEADERS,
  buildCustomReportFromFinalized,
  payrollDisbursementRows,
  payrollDisbursementTotalRows,
  payrollRegisterRows,
  payrollRegisterTotalRows,
  summarizeFinalizedPeriod,
} from "@/lib/reports/finalized-period-reports";
import { validateNasscorpFiling } from "@/lib/compliance/nasscorp/validate";
import { buildNasscorpFilingInput } from "@/lib/compliance/nasscorp/map";
import { LRA_OFFICIAL_FORMAT_STATUS, mapLraWorkingSchedule, validateLraMapping } from "@/lib/compliance/lra/mapping";

const line = (overrides: Partial<FinalizedPayrollLine> = {}): FinalizedPayrollLine => ({
  employeeNumber: "EMP-1",
  fullName: "Ada Lovelace",
  firstName: "Ada",
  lastName: "Lovelace",
  branch: "Monrovia",
  currency: "USD",
  grossPay: 2000,
  incomeTax: 200,
  nasscorpEe: 80,
  nasscorpEr: 120,
  deductions: 25,
  netPay: 1695,
  accountNumber: "123456",
  nasscorpNumber: "123456789",
  payDate: "2026-09-30",
  runType: "monthly",
  ...overrides,
});

describe("finalized payroll register", () => {
  it("maps required columns from finalized lines without recalc", () => {
    expect([...PAYROLL_REGISTER_HEADERS]).toEqual([
      "Employee ID #", "Employee Name", "Branch", "Gross Salary",
      "LRA Deduction", "NASSCORP Deduction", "Other Deduction",
      "Net Salary", "Currency", "Account #",
    ]);
    const row = payrollRegisterRows([line()])[0];
    expect(row).toEqual([
      "EMP-1", "Ada Lovelace", "Monrovia", "2000.00",
      "200.00", "80.00", "25.00", "1695.00", "USD", "123456",
    ]);
  });

  it("shows a dash for missing account and branch; keeps LRD amounts", () => {
    const row = payrollRegisterRows([line({
      employeeNumber: "EMP-2",
      fullName: "Ben Doe",
      branch: "",
      currency: "LRD",
      grossPay: 185440,
      incomeTax: 9000,
      nasscorpEe: 4000,
      deductions: 0,
      netPay: 172440,
      accountNumber: "",
    })])[0];
    expect(row[2]).toBe("—");
    expect(row[8]).toBe("LRD");
    expect(row[9]).toBe("—");
    expect(row[3]).toBe("185440.00");
  });
});

describe("finalized payroll disbursement", () => {
  it("lists payout fields only", () => {
    expect([...PAYROLL_DISBURSEMENT_HEADERS]).toEqual([
      "Employee ID #", "Employee Name", "Net Salary", "Currency", "Account #",
    ]);
    expect(payrollDisbursementRows([line()])[0]).toEqual([
      "EMP-1", "Ada Lovelace", "1695.00", "USD", "123456",
    ]);
  });
});

describe("finalized period summary", () => {
  it("totals net, LRA (PAYE), and employee NASSCORP from the same lines", () => {
    const lines = [
      line(),
      line({
        employeeNumber: "EMP-2",
        fullName: "Ben Doe",
        nasscorpNumber: "987654321",
        netPay: 800,
        incomeTax: 50,
        nasscorpEe: 20,
        deductions: 5,
      }),
    ];
    const summary = summarizeFinalizedPeriod(lines);
    expect(summary.totalNet).toBe(2495);
    expect(summary.totalLra).toBe(250);
    expect(summary.totalNasscorp).toBe(100);
    expect(payrollRegisterTotalRows(lines)[0][7]).toBe("2495.00");
    expect(payrollDisbursementTotalRows(lines)[0][2]).toBe("2495.00");
  });
});

describe("custom report from finalized payroll", () => {
  it("uses the same net as register and disbursement", () => {
    const lines = [line(), line({
      employeeNumber: "EMP-2", fullName: "Ben Doe", nasscorpNumber: "987654321",
      netPay: 800, incomeTax: 50, nasscorpEe: 20, deductions: 5,
    })];
    const custom = buildCustomReportFromFinalized(lines, ["employeeNumber", "net", "currency"]);
    expect(custom.dataRows[0][1]).toBe("1695.00");
    expect(custom.totalRows[0][1]).toBe("2495.00");
    expect(payrollRegisterTotalRows(lines)[0][7]).toBe("2495.00");
    expect(payrollDisbursementTotalRows(lines)[0][2]).toBe("2495.00");
  });

  it("does not invent values when grouping by branch", () => {
    const lines = [
      line({ branch: "Monrovia", netPay: 100, incomeTax: 10, nasscorpEe: 4, deductions: 0, grossPay: 114 }),
      line({ employeeNumber: "EMP-2", fullName: "Ben", branch: "Monrovia", nasscorpNumber: "111111111", netPay: 50, incomeTax: 5, nasscorpEe: 2, deductions: 0, grossPay: 57 }),
    ];
    const grouped = buildCustomReportFromFinalized(lines, ["branch", "net"], "branch");
    expect(grouped.dataRows).toHaveLength(1);
    expect(grouped.dataRows[0][1]).toBe("150.00");
  });
});

describe("statutory cards still map finalized data", () => {
  it("NASSCORP official validation still accepts a valid monthly line", () => {
    const input = buildNasscorpFilingInput({
      employerId: "1234567",
      employerName: "CHRES",
      payrollDate: "2026-09-30",
      lines: [line({ firstName: "Ada", lastName: "Lovelace" })],
    });
    expect(validateNasscorpFiling(input).ok).toBe(true);
  });

  it("LRA mapping uses finalized PAYE and does not claim an official format", () => {
    expect(LRA_OFFICIAL_FORMAT_STATUS).toBe("unconfirmed");
    const mapped = mapLraWorkingSchedule({
      employerName: "CHRES",
      employerTin: "TIN-1",
      periodLabel: "September 2026",
      lines: [line()],
    });
    expect(mapped[0].payeWithheld).toBe(200);
    expect(validateLraMapping({ employerTin: "", lines: [line()] }).readyForOfficialExport).toBe(false);
    expect(validateLraMapping({ employerTin: "", lines: [line()] }).errors.some((e) => e.code === "employer-tin")).toBe(true);
  });
});

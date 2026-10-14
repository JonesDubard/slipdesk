import { describe, expect, it } from "vitest";
import { calculatePayroll } from "@/lib/slipdesk-payroll-engine";
import { parsePayrollCSV } from "@/lib/csv/parse-payroll-csv";
import { parseEmployeeCSV } from "@/lib/csv/parse-employee-csv";
import {
  buildPayslipDeductionRows,
  buildPayslipEarningsRows,
  buildPayslipManualDeductionRows,
  formatDeductionItemLabel,
  formatLraPayslipNote,
  formatPayslipCurrencyLine,
  parseStoredDeductionItems,
  payslipUsedExchangeRate,
  type PayslipContentRow,
} from "@/lib/payslip-content";

const HEADER =
  "employee_number,first_name,middle_name,last_name,gender,job_title,department,branch,email,phone,county,start_date,employment_type,currency,rate,standard_hours,allowances,nasscorp_number,payment_method,bank_name,account_number,momo_number,regular_hours,overtime_hours,holiday_hours,ded_food,ded_salary_advance";

function flatten(rows: PayslipContentRow[]): string {
  return rows.map((r) => `${r.label}\n${r.note}`).join("\n");
}

describe("payslip deduction labels", () => {
  it("shows stored types such as Food and Salary Advance instead of a generic deduction", () => {
    const csv = `${HEADER}\nEMP-1,Ada,,Lovelace,female,Dev,Eng,HQ,,,Montserrado,2024-01-01,full_time,USD,10,173,0,,cash,,,,173,0,0,40,80`;
    const { rows } = parsePayrollCSV(csv);
    expect(rows[0].deductionItems.map((i) => i.label)).toEqual(["Food", "Salary Advance"]);

    const calc = calculatePayroll({
      employeeId: "e1",
      currency: "USD",
      rate: 10,
      regularHours: 173,
      overtimeHours: 0,
      holidayHours: 0,
      exchangeRate: 185.44,
    });
    const section = buildPayslipDeductionRows(
      {
        currency: "USD",
        exchangeRate: 185.44,
        deductions: rows[0].deductions,
        deductionItems: rows[0].deductionItems,
      },
      calc,
    );
    expect(section.map((r) => r.label)).toEqual([
      "NASSCORP (Employee 4%)",
      "Income Tax (LRA)",
      "Food",
      "Salary Advance",
    ]);
    expect(flatten(section)).not.toMatch(/recurring allowances/i);
    expect(section.some((r) => /deduction/i.test(r.label) && r.label !== "NASSCORP (Employee 4%)")).toBe(false);
  });

  it("keeps employee CSV ded_* types for payroll start (not a lump-only label)", () => {
    const csv = `${HEADER}\nEMP-1,Ada,,Lovelace,female,Dev,Eng,HQ,,,Montserrado,2024-01-01,full_time,USD,10,173,0,,cash,,,,173,0,0,40,80`;
    const parsed = parseEmployeeCSV(csv);
    expect(parsed[0].data.pendingDeductionItems?.map((i) => i.label)).toEqual(["Food", "Salary Advance"]);
    expect(parsed[0].data.pendingDeductions).toBe(120);
  });

  it("falls back to stored type/description when the label is a generic deduction", () => {
    expect(
      formatDeductionItemLabel({ label: "deduction", type: "Food", amount: 10 }),
    ).toBe("Food");
    expect(
      formatDeductionItemLabel({
        label: "Other Deductions",
        description: "Salary Advance",
        amount: 25,
      }),
    ).toBe("Salary Advance");
    expect(
      formatDeductionItemLabel({ label: "Deduction", note: "Transportation", amount: 5 }),
    ).toBe("Transportation");
  });

  it("does not invent a deduction name when the data has none", () => {
    const rows = buildPayslipManualDeductionRows({ deductions: 50, deductionItems: [] });
    expect(rows).toEqual([{ label: "", note: "", amount: 50 }]);
    expect(rows[0].label).not.toMatch(/food|salary advance|other deductions|recurring allowances/i);
    expect(
      formatDeductionItemLabel({ label: "deduction", amount: 12 }),
    ).toBe("deduction");
  });

  it("parses persisted deduction_items JSON without dropping type/description", () => {
    expect(
      parseStoredDeductionItems([
        { label: "deduction", type: "Food", amount: 30 },
        { label: "", description: "Salary Advance", amount: 70 },
      ]).map(formatDeductionItemLabel),
    ).toEqual(["Food", "Salary Advance"]);
  });
});

describe("payslip earnings vs deductions", () => {
  it("labels the allowances lump as Allowances, not Recurring allowances, and not as a deduction", () => {
    const calc = calculatePayroll({
      employeeId: "e1",
      currency: "USD",
      rate: 10,
      regularHours: 173,
      overtimeHours: 0,
      holidayHours: 0,
      exchangeRate: 185.44,
      additionalEarnings: 75,
    });
    const earnings = buildPayslipEarningsRows(
      { currency: "USD", rate: 10, regularHours: 173, overtimeHours: 0, holidayHours: 0 },
      calc,
    );
    const allowance = earnings.find((r) => r.amount === 75);
    expect(allowance?.label).toBe("Allowances");
    expect(flatten(earnings)).not.toMatch(/recurring allowances/i);

    const deductions = buildPayslipDeductionRows(
      { currency: "USD", exchangeRate: 185.44, deductions: 0, deductionItems: [] },
      calc,
    );
    expect(deductions.map((r) => r.label)).toEqual([
      "NASSCORP (Employee 4%)",
      "Income Tax (LRA)",
    ]);
    expect(flatten(deductions)).not.toMatch(/recurring allowances/i);
    expect(flatten(deductions)).not.toMatch(/allowances/i);
  });
});

describe("payslip exchange rate display", () => {
  it("shows the stored run rate when FX was used (USD / LRA conversion)", () => {
    expect(payslipUsedExchangeRate("USD")).toBe(true);
    expect(formatPayslipCurrencyLine("USD", 185.44)).toBe("USD (Rate: L$185.44 per $1)");
    const note = formatLraPayslipNote({
      taxInBase: 73.22,
      taxInLRD: 13578.12,
      currency: "USD",
      exchangeRate: 185.44,
    });
    expect(note).toBe("");
    expect(note).not.toContain("185.44");
    expect(note).not.toContain("L$");
  });

  it("does not show a live/API rate and omits FX on LRD slips where conversion was not used", () => {
    expect(payslipUsedExchangeRate("LRD")).toBe(false);
    expect(formatPayslipCurrencyLine("LRD", 185.44)).toBe("LRD");
    expect(formatPayslipCurrencyLine("USD", 190)).toContain("190");
    expect(formatPayslipCurrencyLine("USD", 190)).not.toContain("185.44");
  });
});

describe("payslip LRA text", () => {
  it("keeps the LRA amount and leaves the basis/note blank (no LRD, FX, or tax %)", () => {
    const calc = calculatePayroll({
      employeeId: "e1",
      currency: "USD",
      rate: 10,
      regularHours: 173.33,
      overtimeHours: 0,
      holidayHours: 0,
      exchangeRate: 185.44,
    });
    const [nasscorp, lra] = buildPayslipDeductionRows(
      { currency: "USD", exchangeRate: 185.44, deductions: 0, deductionItems: [] },
      calc,
    );
    expect(nasscorp.label).toBe("NASSCORP (Employee 4%)");
    expect(nasscorp.note).toMatch(/4%/);
    expect(lra.label).toBe("Income Tax (LRA)");
    expect(lra.amount).toBe(calc.Paye.taxInBase);
    expect(lra.note).toBe("");
    expect(lra.note).not.toMatch(/effective rate/i);
    expect(lra.note).not.toMatch(/%/);
    expect(lra.note).not.toMatch(/L\$/);
    expect(lra.note).not.toMatch(/Check LRA/i);
    expect(`${lra.label}\n${lra.note}`).not.toMatch(/effectiveRate/i);
  });
});

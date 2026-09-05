import { describe, expect, it } from "vitest";
import type { FinalizedPayrollLine } from "@/lib/compliance/statutory-exports";
import {
  NASSCORP_EMPLOYEE_HEADERS,
  NASSCORP_SHEET1,
  NASSCORP_SHEET2,
  NASSCORP_TOTAL_GROSS_LABEL,
  isNineDigitSsNumber,
  isSevenDigitEmployerId,
  payPeriodFromRunType,
} from "@/lib/compliance/nasscorp/spec";
import { buildNasscorpFilingInput } from "@/lib/compliance/nasscorp/map";
import { validateNasscorpFiling } from "@/lib/compliance/nasscorp/validate";
import {
  buildNasscorpWorkbook,
  excelDateSerial,
  readNasscorpWorkbook,
} from "@/lib/compliance/nasscorp/format";

const line = (overrides: Partial<FinalizedPayrollLine> = {}): FinalizedPayrollLine => ({
  employeeNumber: "EMP-1",
  fullName: "Ada Lovelace",
  firstName: "Ada",
  middleName: "",
  lastName: "Lovelace",
  currency: "USD",
  grossPay: 1850.5,
  netPay: 1600,
  incomeTax: 100,
  nasscorpEe: 60,
  nasscorpEr: 90,
  nasscorpNumber: "123456789",
  payDate: "2026-09-30",
  runType: "monthly",
  ...overrides,
});

function validInput(lines: FinalizedPayrollLine[] = [line(), line({
  employeeNumber: "EMP-2",
  fullName: "Ben Doe",
  firstName: "Ben",
  lastName: "Doe",
  nasscorpNumber: "987654321",
  grossPay: 2000,
})]) {
  return buildNasscorpFilingInput({
    employerId: "1234567",
    employerName: "CHRES",
    payrollDate: "2026-09-30",
    payrollType: 1,
    lines,
  });
}

describe("NASSCORP official identifiers", () => {
  it("accepts 7-digit EmployerID and 9-digit NASSCorpNo only", () => {
    expect(isSevenDigitEmployerId("1234567")).toBe(true);
    expect(isSevenDigitEmployerId("NASC-1234567")).toBe(false);
    expect(isNineDigitSsNumber("123456789")).toBe(true);
    expect(isNineDigitSsNumber("EMP-1")).toBe(false);
  });

  it("maps weekly / bi-weekly / monthly only — Bonus and Off-Cycle have no PayPeriod", () => {
    expect(payPeriodFromRunType("weekly")).toBe(1);
    expect(payPeriodFromRunType("bi_weekly")).toBe(2);
    expect(payPeriodFromRunType("monthly")).toBe(3);
    expect(payPeriodFromRunType("bonus")).toBeNull();
    expect(payPeriodFromRunType("off_cycle")).toBeNull();
  });
});

describe("NASSCORP filing validation", () => {
  it("allows a normal multi-employee monthly USD run", () => {
    const result = validateNasscorpFiling(validInput());
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("blocks missing 7-digit EmployerID and 9-digit SS number", () => {
    const bad = validateNasscorpFiling({
      ...validInput(),
      employerId: "NASC-99",
      employees: validInput([line({ nasscorpNumber: "EMP-1" })]).employees,
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.some((e) => e.code === "employer-id")).toBe(true);
    expect(bad.errors.some((e) => e.code === "ss-number")).toBe(true);
  });

  it("blocks mixed currency and duplicate NASSCorpNo", () => {
    const mixed = validateNasscorpFiling(validInput([
      line({ nasscorpNumber: "111111111", currency: "USD" }),
      line({ employeeNumber: "EMP-2", nasscorpNumber: "222222222", firstName: "Ben", lastName: "Doe", currency: "LRD" }),
    ]));
    expect(mixed.errors.some((e) => e.code === "mixed-currency")).toBe(true);

    const dup = validateNasscorpFiling(validInput([
      line({ nasscorpNumber: "111111111" }),
      line({ employeeNumber: "EMP-2", firstName: "Ben", lastName: "Doe", nasscorpNumber: "111111111" }),
    ]));
    expect(dup.errors.some((e) => e.code === "duplicate-ss")).toBe(true);
  });

  it("excludes Bonus payroll from NASSCORP because reporting is not applicable", () => {
    const bonus = validateNasscorpFiling(validInput([line({ runType: "bonus" })]));
    expect(bonus.ok).toBe(false);
    expect(bonus.errors.some((e) => e.code === "nasscorp-not-applicable")).toBe(true);
    expect(bonus.errors.some((e) => e.code === "unsupported-run-type")).toBe(false);
    expect(bonus.errors[0]?.message).toMatch(/NASSCORP reporting is not applicable to Bonus or Off-Cycle/i);
    expect(bonus.errors[0]?.message).toMatch(/Weekly, Bi-Weekly, and Monthly/i);
    expect(bonus.errors[0]?.message).not.toMatch(/PayPeriod code/i);
    expect(payPeriodFromRunType("bonus")).toBeNull();
  });

  it("excludes Off-Cycle payroll from NASSCORP because reporting is not applicable", () => {
    const offCycle = validateNasscorpFiling(validInput([line({ runType: "off_cycle" })]));
    expect(offCycle.ok).toBe(false);
    expect(offCycle.errors.some((e) => e.code === "nasscorp-not-applicable")).toBe(true);
    expect(offCycle.errors.some((e) => e.code === "unsupported-run-type")).toBe(false);
    expect(offCycle.errors[0]?.message).toMatch(/NASSCORP reporting is not applicable to Bonus or Off-Cycle/i);
    expect(offCycle.errors[0]?.message).not.toMatch(/PayPeriod code/i);
    expect(payPeriodFromRunType("off_cycle")).toBeNull();
  });

  it("blocks a monthly export that also contains Bonus or Off-Cycle lines", () => {
    const withBonus = validInput([
      line({ runType: "monthly", nasscorpNumber: "111111111" }),
      line({
        employeeNumber: "EMP-2",
        firstName: "Ben",
        lastName: "Doe",
        nasscorpNumber: "222222222",
        runType: "bonus",
      }),
    ]);
    const withOffCycle = validInput([
      line({ runType: "monthly", nasscorpNumber: "111111111" }),
      line({
        employeeNumber: "EMP-2",
        firstName: "Ben",
        lastName: "Doe",
        nasscorpNumber: "222222222",
        runType: "off_cycle",
      }),
    ]);
    expect(validateNasscorpFiling(withBonus).ok).toBe(false);
    expect(validateNasscorpFiling(withBonus).errors.some((e) => e.code === "nasscorp-not-applicable")).toBe(true);
    expect(validateNasscorpFiling(withOffCycle).ok).toBe(false);
    expect(() => buildNasscorpWorkbook(withBonus)).toThrow(/NASSCORP reporting is not applicable/i);
    expect(() => buildNasscorpWorkbook(withOffCycle)).toThrow(/NASSCORP reporting is not applicable/i);
  });

  it("blocks invalid PayrollType and missing names", () => {
    const noName = validateNasscorpFiling(validInput([line({ firstName: "", lastName: "" })]));
    expect(noName.errors.some((e) => e.code === "first-name")).toBe(true);
    expect(noName.errors.some((e) => e.code === "last-name")).toBe(true);
    const badType = validateNasscorpFiling({
      ...validInput(),
      payrollType: 3 as unknown as 1,
    });
    expect(badType.errors.some((e) => e.code === "payroll-type")).toBe(true);
  });
});

describe("NASSCORP official workbook", () => {
  it("writes Sheet1 / Sheet2 with official headers, GrossPay from finalized gross, and codes", () => {
    const input = validInput();
    const first = buildNasscorpWorkbook(input);
    const second = buildNasscorpWorkbook(input);
    expect(Buffer.from(first.buffer).equals(Buffer.from(second.buffer))).toBe(true);

    const read = readNasscorpWorkbook(first.buffer);
    expect(read.sheetNames).toEqual([NASSCORP_SHEET1, NASSCORP_SHEET2]);
    expect(read.headers).toEqual([...NASSCORP_EMPLOYEE_HEADERS]);
    expect(read.employer[0]).toBe("1234567");
    expect(read.employer[1]).toBe("CHRES");
    expect(read.employer[2]).toBe(2);
    expect(read.employer[3]).toBe(excelDateSerial("2026-09-30"));

    const ada = read.employees[0];
    expect(ada[0]).toBe("123456789");
    expect(ada[1]).toBe("Ada");
    expect(ada[3]).toBe("Lovelace");
    expect(ada[4]).toBe(1850.5);
    expect(ada[6]).toBe(3);
    expect(ada[7]).toBe(1);

    const total = read.employees.at(-1);
    expect(total?.[0]).toBe(NASSCORP_TOTAL_GROSS_LABEL);
    expect(total?.[4]).toBe(3850.5);
  });

  it("does not generate a NASSCORP file for Bonus or Off-Cycle payrolls", () => {
    expect(() => buildNasscorpWorkbook(validInput([line({ runType: "bonus" })]))).toThrow(
      /NASSCORP reporting is not applicable to Bonus or Off-Cycle/i,
    );
    expect(() => buildNasscorpWorkbook(validInput([line({ runType: "off_cycle" })]))).toThrow(
      /NASSCORP reporting is not applicable to Bonus or Off-Cycle/i,
    );
  });

  it("uses finalized gross_pay, not the internal 4%/6% contribution amounts", () => {
    const input = validInput([line({
      grossPay: 2500,
      nasscorpEe: 40,
      nasscorpEr: 60,
      nasscorpNumber: "111111111",
    })]);
    const read = readNasscorpWorkbook(buildNasscorpWorkbook(input).buffer);
    expect(read.employees[0][4]).toBe(2500);
    expect(read.employees[0]).not.toContain(40);
    expect(read.employees[0]).not.toContain(60);
  });

  it("scopes only the supplied finalized lines (selected period)", () => {
    const input = validInput([line({ nasscorpNumber: "111111111", grossPay: 100 })]);
    expect(input.employees).toHaveLength(1);
    expect(validateNasscorpFiling(input).ok).toBe(true);
  });
});

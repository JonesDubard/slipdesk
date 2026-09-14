import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCSVLine, parseDateToISO } from "@/lib/csv/parse-csv-line";
import { parsePayrollCSV, type BulkRow } from "@/lib/csv/parse-payroll-csv";
import { parseEmployeeCSV } from "@/lib/csv/parse-employee-csv";
import { deleteAtIndexes, deleteByIds } from "@/lib/csv/record-ops";
import { gridReducer, recalcLine } from "@/lib/payroll/grid-reducer";
import { formatEmployeeFullName } from "@/lib/employee-name";
import { processPayroll } from "@/lib/slipdesk-payroll-engine";
import type { PayRunLine } from "@/lib/mock-data";

const FIXTURE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/truck-driver-payslip.csv"),
  "utf8",
);

const HEADER =
  "employee_number,first_name,middle_name,last_name,gender,job_title,department,branch,email,phone,county,start_date,employment_type,currency,rate,standard_hours,allowances,nasscorp_number,payment_method,bank_name,account_number,momo_number,regular_hours,overtime_hours,holiday_hours,ded_pay_advance,ded_food,ded_transportation,ded_loan_repayment,ded_other";

function toLine(r: BulkRow, id: string): PayRunLine {
  const emp = r.employee;
  return recalcLine({
    id,
    employeeId: id,
    employeeNumber: emp.employeeNumber,
    fullName: formatEmployeeFullName(emp.firstName, emp.lastName, emp.middleName),
    jobTitle: emp.jobTitle,
    department: emp.department,
    currency: emp.currency,
    rate: emp.rate,
    regularHours: r.regularHours,
    overtimeHours: r.overtimeHours,
    holidayHours: r.holidayHours,
    additionalEarnings: emp.allowances ?? 0,
    deductions: r.deductions ?? 0,
    deductionItems: r.deductionItems ?? [],
    exchangeRate: 190,
    calc: null,
    paymentMethod: emp.paymentMethod,
    bankName: emp.bankName,
    accountNumber: emp.accountNumber,
    mobileNumber: emp.momoNumber,
  });
}

describe("CSV line parser edge cases", () => {
  it("keeps commas inside quoted fields", () => {
    expect(parseCSVLine(`EMP-1,"Kollie, Moses",Driver`)).toEqual([
      "EMP-1",
      "Kollie, Moses",
      "Driver",
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCSVLine(`"He said ""hi""",x`)).toEqual(['He said "hi"', "x"]);
  });

  it("preserves empty trailing columns", () => {
    expect(parseCSVLine("a,b,,")).toEqual(["a", "b", "", ""]);
  });
});

describe("parseDateToISO", () => {
  it("passes ISO through", () => {
    expect(parseDateToISO("2026-05-25")).toBe("2026-05-25");
  });

  it("disambiguates M/D when day > 12 (truck-driver CSV)", () => {
    expect(parseDateToISO("5/25/2026")).toBe("2026-05-25");
    expect(parseDateToISO("6/15/2026")).toBe("2026-06-15");
    expect(parseDateToISO("6/23/2026")).toBe("2026-06-23");
  });

  it("disambiguates D/M when first part > 12", () => {
    expect(parseDateToISO("25/5/2026")).toBe("2026-05-25");
  });

  it("treats ambiguous Excel dates as M/D/Y", () => {
    expect(parseDateToISO("6/1/2026")).toBe("2026-06-01");
    expect(parseDateToISO("6/9/2026")).toBe("2026-06-09");
    expect(parseDateToISO("6/10/2026")).toBe("2026-06-10");
  });

  it("returns empty for unparseable or invalid dates", () => {
    expect(parseDateToISO("")).toBe("");
    expect(parseDateToISO("not-a-date")).toBe("");
    expect(parseDateToISO("13/13/2026")).toBe("");
  });
});

describe("payroll CSV parser — truck-driver fixture", () => {
  it("parses all 32 rows without errors", () => {
    const { rows, errors } = parsePayrollCSV(FIXTURE);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(32);
  });

  it("maps branch, gender, contractor, mtn_momo, and Excel start dates", () => {
    const { rows } = parsePayrollCSV(FIXTURE);
    const first = rows[0];
    expect(first.employee.employeeNumber).toBe("EMP-452");
    expect(first.employee.firstName).toBe("ABDU");
    expect(first.employee.lastName).toBe("KONNEH");
    expect(first.employee.gender).toBe("male");
    expect(first.employee.branch).toBe("Bangli");
    expect(first.employee.employmentType).toBe("contractor");
    expect(first.employee.paymentMethod).toBe("mtn_momo");
    expect(first.employee.rate).toBe(1.44);
    expect(first.employee.startDate).toBe("2026-05-25");
    expect(first.regularHours).toBe(48);
    expect(first.overtimeHours).toBe(0);
    expect(first.holidayHours).toBe(0);
    expect(first.deductions).toBe(0);
  });

  it("keeps middle names and high OT hours", () => {
    const { rows } = parsePayrollCSV(FIXTURE);
    const esiaka = rows.find((r) => r.employee.employeeNumber === "EMP-454")!;
    expect(esiaka.regularHours).toBe(192);
    expect(esiaka.overtimeHours).toBe(138);
    const abel = rows.find((r) => r.employee.employeeNumber === "EMP-457")!;
    expect(abel.employee.middleName).toBe("T.");
    expect(abel.employee.startDate).toBe("2026-06-01");
    const william = rows.find((r) => r.employee.employeeNumber === "EMP-478")!;
    expect(william.overtimeHours).toBe(162);
    expect(william.employee.startDate).toBe("2026-06-10");
  });

  it("does not invent employee numbers for missing IDs in sequence (477, 482, 484)", () => {
    const { rows } = parsePayrollCSV(FIXTURE);
    const nums = rows.map((r) => r.employee.employeeNumber);
    expect(nums).not.toContain("EMP-477");
    expect(nums).not.toContain("EMP-482");
    expect(nums).not.toContain("EMP-484");
    expect(nums[nums.length - 1]).toBe("EMP-486");
  });
});

describe("payroll CSV parser — malformed / stress", () => {
  it("rejects empty file and header-only file", () => {
    expect(parsePayrollCSV("").errors[0]).toMatch(/header row/);
    expect(parsePayrollCSV(HEADER).errors[0]).toMatch(/header row/);
    expect(parsePayrollCSV("\n\n").rows).toHaveLength(0);
  });

  it("skips blank lines and still imports valid neighbors", () => {
    const csv = `${HEADER}\n\nEMP-1,Ada,,Lovelace,female,Dev,Eng,HQ,,,Montserrado,2024-01-01,full_time,USD,10,173.33,0,,bank_transfer,,,,173.33,0,0,0,0,0,0,0\n\n`;
    const { rows, errors } = parsePayrollCSV(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it("reports missing names and invalid enums without dropping valid rows", () => {
    const csv = [
      HEADER,
      "EMP-1,, , ,male,Dev,Eng,HQ,,,Montserrado,2024-01-01,full_time,USD,10,173,0,,cash,,,,173,0,0,0,0,0,0,0",
      "EMP-2,Ada,,Lovelace,not-a-gender,Dev,Eng,HQ,,,Montserrado,2024-01-01,full_time,USD,10,173,0,,cash,,,,173,0,0,0,0,0,0,0",
      "EMP-3,Ada,,Lovelace,female,Dev,Eng,HQ,,,Montserrado,2024-01-01,intern,USD,10,173,0,,cash,,,,173,0,0,0,0,0,0,0",
      "EMP-4,Ada,,Lovelace,female,Dev,Eng,HQ,,,Montserrado,2024-01-01,full_time,EUR,10,173,0,,cash,,,,173,0,0,0,0,0,0,0",
      "EMP-5,Ada,,Lovelace,female,Dev,Eng,HQ,,,Montserrado,2024-01-01,full_time,USD,10,173,0,,paypal,,,,173,0,0,0,0,0,0,0",
      "EMP-ok,Ada,,Lovelace,female,Dev,Eng,HQ,,,Montserrado,2024-01-01,full_time,USD,10,173,0,,cash,,,,173,0,0,0,0,0,0,0",
    ].join("\n");
    const { rows, errors } = parsePayrollCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].employee.employeeNumber).toBe("EMP-ok");
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });

  it("strips UTF-8 BOM and accepts special characters in names", () => {
    const csv = `\uFEFF${HEADER}\nEMP-1,José,,O'Neill,male,Driver,Ops,Bangli,,,Bong,2024-01-01,contractor,USD,1.44,,, ,mtn_momo,Lonestar,,231555,48,0,0,0,0,0,0,0`;
    const { rows, errors } = parsePayrollCSV(csv);
    expect(errors).toEqual([]);
    expect(rows[0].employee.firstName).toBe("José");
    expect(rows[0].employee.lastName).toBe("O'Neill");
  });

  it("sums itemized ded_* columns and ignores zero/blank ones", () => {
    const csv = `${HEADER}\nEMP-1,Ada,,Lovelace,female,Dev,Eng,HQ,,,Montserrado,2024-01-01,full_time,USD,10,173,0,,cash,,,,173,0,0,100,0,25,0,`;
    const { rows } = parsePayrollCSV(csv);
    expect(rows[0].deductions).toBe(125);
    expect(rows[0].deductionItems).toEqual([
      { label: "Pay Advance", amount: 100 },
      { label: "Transportation", amount: 25 },
    ]);
  });

  it("parses a 2,000-row file without dropping rows", () => {
    const body = Array.from({ length: 2000 }, (_, i) => {
      const n = String(i + 1).padStart(4, "0");
      return `EMP-${n},First${n},,Last${n},male,Driver,Operations,Bangli,,,Bong,6/1/2026,contractor,USD,1.44,,,,mtn_momo,Lonestar,,231555${n},192,10,0,0,0,0,0,0`;
    }).join("\n");
    const start = Date.now();
    const { rows, errors } = parsePayrollCSV(`${HEADER}\n${body}`);
    const ms = Date.now() - start;
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2000);
    expect(ms).toBeLessThan(1000);
  });
});

describe("employees CSV parser — same fixture", () => {
  it("parses 32 rows and maps branch + pending hours", () => {
    const parsed = parseEmployeeCSV(FIXTURE);
    expect(parsed).toHaveLength(32);
    expect(parsed.every((r) => r.errors.length === 0)).toBe(true);
    expect(parsed[0].data.branch).toBe("Bangli");
    expect(parsed[0].data.startDate).toBe("2026-05-25");
    expect(parsed[0].data.pendingRegularHours).toBe(48);
    expect(parsed[2].data.pendingOvertimeHours).toBe(138);
  });

  it("returns [] for empty / header-only files (no error object)", () => {
    expect(parseEmployeeCSV("")).toEqual([]);
    expect(parseEmployeeCSV(HEADER)).toEqual([]);
  });
});

describe("delete functionality", () => {
  it("deletes by id and reports missing ids", () => {
    const records = [
      { id: "a", n: 1 },
      { id: "b", n: 2 },
      { id: "c", n: 3 },
    ];
    const missing = deleteByIds(records, ["nope"]);
    expect(missing.remaining).toHaveLength(3);
    expect(missing.deleted).toHaveLength(0);
    expect(missing.missing).toEqual(["nope"]);

    const one = deleteByIds(records, ["b"]);
    expect(one.remaining.map((r) => r.id)).toEqual(["a", "c"]);
    expect(one.deleted.map((r) => r.id)).toEqual(["b"]);
  });

  it("deletes the last remaining record", () => {
    const { remaining, deleted } = deleteByIds([{ id: "only" }], ["only"]);
    expect(remaining).toEqual([]);
    expect(deleted).toHaveLength(1);
  });

  it("handles concurrent/overlapping delete id lists without duplicating removals", () => {
    const records = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const first = deleteByIds(records, ["a", "b"]);
    const second = deleteByIds(first.remaining, ["b", "c"]);
    expect(second.remaining.map((r) => r.id)).toEqual([]);
    expect(second.missing).toEqual(["b"]);
    expect(second.deleted.map((r) => r.id)).toEqual(["c"]);
  });

  it("preview index delete does not corrupt remaining order", () => {
    const rows = ["r0", "r1", "r2", "r3"];
    const { remaining, invalid } = deleteAtIndexes(rows, [1, 99, 1]);
    expect(invalid).toEqual([99]);
    expect(remaining).toEqual(["r0", "r2", "r3"]);
  });

  it("pay-run grid DELETE_ROW removes a line and ignores unknown ids", () => {
    const { rows } = parsePayrollCSV(FIXTURE);
    let state = gridReducer(
      [],
      { type: "IMPORT_ROWS", rows: rows.slice(0, 3).map((r, i) => toLine(r, `id-${i}`)) },
    );
    expect(state).toHaveLength(3);
    state = gridReducer(state, { type: "DELETE_ROW", id: "id-1" });
    expect(state.map((l) => l.id)).toEqual(["id-0", "id-2"]);
    state = gridReducer(state, { type: "DELETE_ROW", id: "ghost" });
    expect(state).toHaveLength(2);
    state = gridReducer(state, { type: "DELETE_ROW", id: "id-0" });
    state = gridReducer(state, { type: "DELETE_ROW", id: "id-2" });
    expect(state).toEqual([]);
  });

  it("IMPORT_ROWS appends — re-importing the same CSV duplicates pay-run lines", () => {
    const { rows } = parsePayrollCSV(FIXTURE);
    const chunk = rows.slice(0, 2).map((r, i) => toLine(r, `dup-${i}`));
    let state = gridReducer([], { type: "IMPORT_ROWS", rows: chunk });
    state = gridReducer(state, { type: "IMPORT_ROWS", rows: chunk });
    expect(state).toHaveLength(4);
  });
});

describe("payrun calculations on truck-driver CSV", () => {
  it("computes gross/net for ESIAKA (192 regular + 138 OT @ $1.44)", () => {
    const { rows } = parsePayrollCSV(FIXTURE);
    const esiaka = rows.find((r) => r.employee.employeeNumber === "EMP-454")!;
    const line = toLine(esiaka, "esiaka");
    const regular = 1.44 * 192;
    const ot = 1.44 * 138 * 1.5;
    expect(line.calc?.regularSalary).toBeCloseTo(regular, 2);
    expect(line.calc?.overtimePay).toBeCloseTo(ot, 2);
    expect(line.calc?.grossPay).toBeCloseTo(regular + ot, 2);
    expect(line.calc!.netPay).toBeLessThan(line.calc!.grossPay);
    expect(line.calc!.nasscorp.employeeContribution).toBeCloseTo(regular * 0.04, 2);
  });

  it("flags minimum-wage warnings for short-hour drivers", () => {
    const { rows } = parsePayrollCSV(FIXTURE);
    const abdu = toLine(rows[0], "abdu");
    expect(abdu.regularHours).toBe(48);
    expect(abdu.calc?.grossPay).toBeCloseTo(1.44 * 48, 2);
    expect(abdu.calc!.warnings.length).toBeGreaterThan(0);
  });

  it("rolls the full 32-row run with processPayroll", () => {
    const { rows } = parsePayrollCSV(FIXTURE);
    const summary = processPayroll(
      rows.map((r, i) => ({
        employeeId: r.employee.employeeNumber || String(i),
        currency: r.employee.currency,
        rate: r.employee.rate,
        regularHours: r.regularHours,
        overtimeHours: r.overtimeHours,
        holidayHours: r.holidayHours,
        exchangeRate: 190,
        additionalEarnings: r.employee.allowances,
      })),
    );
    expect(summary.results).toHaveLength(32);
    expect(summary.totalGross).toBeGreaterThan(0);
    expect(summary.totalNetPay).toBeLessThan(summary.totalGross);
    expect(summary.totalEmployeeNasscorp).toBeGreaterThan(0);
  });
});

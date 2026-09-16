import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCSVLine, parseDateToISO } from "@/lib/csv/parse-csv-line";
import { parsePayrollCSV, parsePayrollSpreadsheet, type BulkRow } from "@/lib/csv/parse-payroll-csv";
import { parseEmployeeCSV, parseEmployeeSpreadsheet, normalizePaymentMethod } from "@/lib/csv/parse-employee-csv";
import {
  applyCsvBranches,
  canonicalizeBranch,
  collectUnknownBranches,
  ensureOrgBranchesForImport,
  findRegisteredBranch,
  previewEmployeeCsvRows,
  unregisteredBranchMessage,
} from "@/lib/csv/resolve-branch";
import * as XLSX from "xlsx";
import { deleteAtIndexes, deleteByIds } from "@/lib/csv/record-ops";
import { classifyEmployeeImport, findEmployeeByNumber } from "@/lib/csv/match-employee";
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

  it("does not reject Bangli when the org branch list is empty", () => {
    const parsed = parseEmployeeCSV(FIXTURE, { registeredBranches: [] });
    expect(parsed).toHaveLength(32);
    expect(parsed.every((r) => r.errors.length === 0)).toBe(true);
    expect(parsed.every((r) => !r.errors.some((e) => /is not registered/i.test(e)))).toBe(true);
    const applied = applyCsvBranches(parsed, []);
    expect(applied.rows.every((r) => r.errors.length === 0)).toBe(true);
    expect(applied.unknownBranches).toEqual(["Bangli"]);
    expect(applied.rows[0].data.branch).toBe("Bangli");
  });

  it("accepts template Sinkor/Paynesville rows with an empty registered list", () => {
    const csv = `${HEADER}
EMP-001,Moses,James,Kollie,male,Operations Manager,Operations,Sinkor,m.kollie@co.lr,+231770000001,Montserrado,2023-01-15,full_time,USD,8.50,173.33,0,NSC-001-2024,bank_transfer,Ecobank Liberia,1234567890,,173.33,0,0,100,30,20,0,0
EMP-002,Fanta,,Kamara,female,Finance Officer,Finance,Paynesville,f.kamara@co.lr,+231770000002,Montserrado,2023-03-01,full_time,LRD,1500,173.33,50000,NSC-002-2024,mtn_momo,,,0770000002,173.33,0,8,0,0,0,250,0`;
    const parsed = parseEmployeeCSV(csv, { registeredBranches: [] });
    expect(parsed).toHaveLength(2);
    expect(parsed.every((r) => r.errors.length === 0)).toBe(true);
    expect(parsed.every((r) => !r.errors.some((e) => /is not registered/i.test(e)))).toBe(true);
    expect(parsed[0].data.branch).toBe("Sinkor");
    expect(parsed[1].data.branch).toBe("Paynesville");
    const preview = previewEmployeeCsvRows(parsed);
    expect(preview.every((r) => r.errors.length === 0)).toBe(true);
    expect(previewEmployeeCsvRows(
      parsed.map((r) => ({
        ...r,
        errors: [...r.errors, unregisteredBranchMessage(r.data.branch ?? "")],
      })),
    ).every((r) => r.errors.length === 0)).toBe(true);
  });

  it("returns [] for empty / header-only files (no error object)", () => {
    expect(parseEmployeeCSV("")).toEqual([]);
    expect(parseEmployeeCSV(HEADER)).toEqual([]);
  });

  it("rejects invalid payment_method as a row error", () => {
    const csv = `${HEADER}\nEMP-1,Ada,,Lovelace,female,Dev,Eng,HQ,,,Montserrado,2024-01-01,full_time,USD,10,173,0,,paypal,,,,173,0,0,0,0,0,0,0`;
    const parsed = parseEmployeeCSV(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].errors.some((e) => /payment_method/i.test(e))).toBe(true);
  });

  it("aliases momo / mtn / lonestar to mtn_momo", () => {
    expect(normalizePaymentMethod("MoMo").value).toBe("mtn_momo");
    expect(normalizePaymentMethod("mtn").value).toBe("mtn_momo");
    expect(normalizePaymentMethod("Lonestar").value).toBe("mtn_momo");
    expect(normalizePaymentMethod("mobile money").value).toBe("mtn_momo");
    expect(normalizePaymentMethod("").value).toBe("bank_transfer");
    expect(normalizePaymentMethod("paypal").error).toMatch(/Invalid payment_method/);
  });
});

describe("spreadsheet / Excel bulk read", () => {
  it("parses semicolon-delimited CSV", () => {
    const csv = `${HEADER.replaceAll(",", ";")}\nEMP-9;Ada;;Lovelace;female;Dev;Eng;HQ;;;Montserrado;2024-01-01;full_time;USD;1.44;173;0;;cash;;;;173;0;0;0;0;0;0;0`;
    const parsed = parseEmployeeCSV(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].errors).toEqual([]);
    expect(parsed[0].data.firstName).toBe("Ada");
    expect(parsed[0].data.rate).toBe(1.44);
    const pay = parsePayrollCSV(csv);
    expect(pay.errors).toEqual([]);
    expect(pay.rows[0].employee.employeeNumber).toBe("EMP-9");
  });

  it("skips a title row above the real headers", () => {
    const csv = `CHRES Staff List\n${HEADER}\nEMP-9,Ada,,Lovelace,female,Dev,Eng,HQ,,,Montserrado,2024-01-01,full_time,USD,10,173,0,,cash,,,,173,0,0,0,0,0,0,0`;
    const parsed = parseEmployeeCSV(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].data.employeeNumber).toBe("EMP-9");
  });

  it("maps Excel-style headers, missing currency, and $ rates", () => {
    const csv = "Staff ID,First Name,Last Name,Hourly Rate\nEMP-9,Ada,Lovelace,$1.44";
    const parsed = parseEmployeeCSV(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].errors).toEqual([]);
    expect(parsed[0].data.employeeNumber).toBe("EMP-9");
    expect(parsed[0].data.firstName).toBe("Ada");
    expect(parsed[0].data.lastName).toBe("Lovelace");
    expect(parsed[0].data.rate).toBe(1.44);
    expect(parsed[0].data.currency).toBe("USD");
  });

  it("splits a single Name column", () => {
    const csv = "employee_number,name,rate\nEMP-9,Ada Lovelace,10";
    const parsed = parseEmployeeCSV(csv);
    expect(parsed[0].data.firstName).toBe("Ada");
    expect(parsed[0].data.lastName).toBe("Lovelace");
  });

  it("decodes UTF-16 LE CSV", () => {
    const text = `${HEADER}\nEMP-9,Ada,,Lovelace,female,Dev,Eng,HQ,,,Montserrado,2024-01-01,full_time,USD,10,173,0,,cash,,,,173,0,0,0,0,0,0,0`;
    const buf = new ArrayBuffer(2 + text.length * 2);
    const bytes = new Uint8Array(buf);
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
    const chars = new Uint16Array(buf, 2);
    for (let i = 0; i < text.length; i++) chars[i] = text.charCodeAt(i);
    const { rows, error } = parseEmployeeSpreadsheet(buf, "staff.csv");
    expect(error).toBeUndefined();
    expect(rows).toHaveLength(1);
    expect(rows[0].data.firstName).toBe("Ada");
  });

  it("reads an .xlsx buffer", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Staff List"],
      ["employee_number", "first_name", "last_name", "rate"],
      ["EMP-9", "Ada", "Lovelace", 1.44],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Staff");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer | Uint8Array | number[];
    const bytes = out instanceof ArrayBuffer ? new Uint8Array(out) : Uint8Array.from(out as ArrayLike<number>);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const { rows, error } = parseEmployeeSpreadsheet(buffer, "staff.xlsx");
    expect(error).toBeUndefined();
    expect(rows).toHaveLength(1);
    expect(rows[0].data.employeeNumber).toBe("EMP-9");
    expect(rows[0].data.rate).toBe(1.44);
    const pay = parsePayrollSpreadsheet(buffer, "staff.xlsx");
    expect(pay.errors).toEqual([]);
    expect(pay.rows[0].employee.lastName).toBe("Lovelace");
  });
});

describe("employee bulk import — match vs create", () => {
  it("classifies an existing employee number as update, not skip", () => {
    const roster = [
      { id: "1", employeeNumber: "EMP-452", isArchived: false },
      { id: "2", employeeNumber: "EMP-453", isArchived: true },
    ];
    expect(classifyEmployeeImport(roster, "EMP-452")).toEqual({
      action: "update",
      existing: roster[0],
    });
    expect(classifyEmployeeImport(roster, "emp-453")).toEqual({
      action: "update",
      existing: roster[1],
    });
    expect(classifyEmployeeImport(roster, "EMP-999")).toEqual({ action: "create" });
    expect(classifyEmployeeImport(roster, "")).toEqual({ action: "create" });
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

  it("IMPORT_ROWS appends; MERGE_ROWS replaces matching employee numbers", () => {
    const { rows } = parsePayrollCSV(FIXTURE);
    const chunk = rows.slice(0, 2).map((r, i) => toLine(r, `dup-${i}`));
    let state = gridReducer([], { type: "IMPORT_ROWS", rows: chunk });
    state = gridReducer(state, { type: "IMPORT_ROWS", rows: chunk });
    expect(state).toHaveLength(4);

    const updated = rows.slice(0, 2).map((r, i) => toLine({ ...r, regularHours: 10 }, `new-${i}`));
    state = gridReducer(state.slice(0, 2), { type: "MERGE_ROWS", rows: updated });
    expect(state).toHaveLength(2);
    expect(state.map((l) => l.id)).toEqual(["new-0", "new-1"]);
    expect(state[0].regularHours).toBe(10);
  });
});

describe("match existing employees by number", () => {
  it("matches EMP-452 case-insensitively and ignores blank numbers", () => {
    const roster = [
      { id: "db-1", employeeNumber: "EMP-452", isArchived: false },
      { id: "db-2", employeeNumber: "emp-453", isArchived: true },
    ];
    expect(findEmployeeByNumber(roster, "EMP-452")?.id).toBe("db-1");
    expect(findEmployeeByNumber(roster, " emp-452 ")?.id).toBe("db-1");
    expect(findEmployeeByNumber(roster, "EMP-453")?.id).toBe("db-2");
    expect(findEmployeeByNumber(roster, "")).toBeUndefined();
    expect(findEmployeeByNumber(roster, "EMP-999")).toBeUndefined();
  });

  it("reuses the first match so a second CSV row with the same number does not invent a new id", () => {
    const roster = [{ id: "db-1", employeeNumber: "EMP-452" }];
    const first = findEmployeeByNumber(roster, "EMP-452");
    const second = findEmployeeByNumber(roster, "EMP-452");
    expect(first?.id).toBe(second?.id);
  });
});

describe("manual rate entry on a pay-run line", () => {
  it("UPDATE_FIELD on rate recalculates gross from the new hourly amount", () => {
    const { rows } = parsePayrollCSV(FIXTURE);
    const esiaka = rows.find((r) => r.employee.employeeNumber === "EMP-454")!;
    let state = gridReducer([], { type: "SET_ROWS", rows: [toLine(esiaka, "esiaka")] });
    expect(state[0].rate).toBe(1.44);

    state = gridReducer(state, { type: "UPDATE_FIELD", id: "esiaka", field: "rate", value: 2 });
    expect(state[0].rate).toBe(2);
    expect(state[0].calc?.regularSalary).toBeCloseTo(2 * 192, 2);
    expect(state[0].calc?.overtimePay).toBeCloseTo(2 * 138 * 1.5, 2);
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

describe("CSV bulk import — unregistered branches", () => {
  it("matches registered names case-insensitively and leaves blanks unassigned", () => {
    expect(findRegisteredBranch("bangli", ["Bangli"])).toBe("Bangli");
    expect(canonicalizeBranch("BANGLI", ["Bangli"])).toBe("Bangli");
    expect(canonicalizeBranch("  ", ["Bangli"])).toBe("");
    expect(canonicalizeBranch("Buchanan", ["Bangli"])).toBe("Buchanan");
    expect(collectUnknownBranches(["Bangli", "bangli", "", "  "], [])).toEqual(["Bangli"]);
    expect(collectUnknownBranches(["Bangli"], ["BANGLI"])).toEqual([]);
  });

  it("strips per-row unregistered errors so empty org list does not fail every row", () => {
    const parsed = parseEmployeeCSV(FIXTURE, { registeredBranches: [] });
    const poisoned = parsed.map((r) => ({
      ...r,
      errors: [...r.errors, unregisteredBranchMessage("Bangli")],
    }));
    const applied = applyCsvBranches(poisoned, []);
    expect(applied.rows).toHaveLength(32);
    expect(applied.rows.every((r) => r.errors.length === 0)).toBe(true);
    expect(applied.unknownBranches).toEqual(["Bangli"]);
  });

  it("auto-creates a missing branch once instead of failing the import", async () => {
    const created: string[] = [];
    const result = await ensureOrgBranchesForImport(
      parseEmployeeCSV(FIXTURE).map((r) => r.data.branch),
      {
        list: async () => ({ status: 200, items: [] }),
        create: async (name) => {
          created.push(name);
          return { status: 200, item: { name } };
        },
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.created).toEqual(["Bangli"]);
      expect(result.registered).toEqual(["Bangli"]);
      expect(result.branches).toEqual([]);
    }
    expect(created).toEqual(["Bangli"]);
  });

  it("returns one fatal error for demo/no-company instead of 32 row errors", async () => {
    const result = await ensureOrgBranchesForImport(
      ["Bangli", "Bangli", "bangli"],
      {
        list: async () => ({
          status: 403,
          code: "DEMO_READONLY",
          error: "This is a read-only demo. Purchase a plan or book a live demo to make changes.",
        }),
        create: async () => {
          throw new Error("create should not run");
        },
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Bangli/);
      expect(result.error).toMatch(/read-only demo/i);
      expect(result.error.split("Bangli").length - 1).toBe(1);
    }
  });

  it("accepts the CSV name when branch management requires an upgrade", async () => {
    const result = await ensureOrgBranchesForImport(["Bangli"], {
      list: async () => ({ status: 403, error: "Upgrade required", items: [] }),
      create: async () => ({ status: 403, error: "Upgrade required" }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.created).toEqual([]);
      expect(result.registered).toEqual(["Bangli"]);
      expect(result.branches).toEqual([]);
    }
  });

  it("does not turn a 401 list into unregistered-branch row errors", async () => {
    const result = await ensureOrgBranchesForImport(["Sinkor", "Paynesville"], {
      list: async () => ({ status: 401, error: "Unauthorized", items: [] }),
      create: async () => {
        throw new Error("create should not run after 401");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Unauthorized/);
      expect(result.error).not.toMatch(/is not registered/i);
    }
  });
});

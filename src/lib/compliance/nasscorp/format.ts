import * as XLSX from "xlsx";
import {
  NASSCORP_EMPLOYEE_HEADERS,
  NASSCORP_EMPLOYER_HEADERS,
  NASSCORP_SHEET1,
  NASSCORP_SHEET2,
  NASSCORP_TOTAL_GROSS_LABEL,
  currencyTypeId,
  payPeriodFromRunType,
} from "@/lib/compliance/nasscorp/spec";
import { validateNasscorpFiling, type NasscorpFilingInput } from "@/lib/compliance/nasscorp/validate";

const GROSS_FMT = '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)';
const DATE_FMT = "m/d/yy";

export interface NasscorpWorkbookResult {
  filename: string;
  buffer: ArrayBuffer;
}

export function excelDateSerial(isoDate: string): number {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  return (utc - Date.UTC(1899, 11, 30)) / 86_400_000;
}

export function buildNasscorpWorkbook(input: NasscorpFilingInput, filenameStub = "NASSCORP_Payroll"): NasscorpWorkbookResult {
  const check = validateNasscorpFiling(input);
  if (!check.ok) {
    throw new Error(check.errors[0]?.message ?? "NASSCORP filing is not valid.");
  }

  const ccy = currencyTypeId(input.employees[0].currency);
  if (ccy == null) throw new Error("CurrencyTypeID could not be resolved.");

  const paySerial = excelDateSerial(input.payrollDate);
  const wb = XLSX.utils.book_new();

  const sheet1 = XLSX.utils.aoa_to_sheet([
    [...NASSCORP_EMPLOYER_HEADERS],
    [input.employerId.trim(), input.employerName.trim(), ccy, paySerial],
  ]);
  applyNumberFormat(sheet1, "C2", "0");
  applyNumberFormat(sheet1, "D2", DATE_FMT);
  sheet1["!cols"] = [{ wch: 16 }, { wch: 40 }, { wch: 18 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, sheet1, NASSCORP_SHEET1);

  const empRows: (string | number)[][] = [[...NASSCORP_EMPLOYEE_HEADERS]];
  let grossTotal = 0;
  for (const e of input.employees) {
    const period = payPeriodFromRunType(e.runType);
    if (period == null) throw new Error("Unsupported pay period.");
    const serial = excelDateSerial(e.payrollDate);
    grossTotal += e.grossPay;
    empRows.push([
      e.nassCorpNo.trim(),
      e.firstName.trim(),
      e.middleName.trim(),
      e.lastName.trim(),
      e.grossPay,
      serial,
      period,
      input.payrollType,
    ]);
  }
  empRows.push([NASSCORP_TOTAL_GROSS_LABEL, "", "", "", Math.round(grossTotal * 100) / 100, "", "", ""]);

  const sheet2 = XLSX.utils.aoa_to_sheet(empRows);
  for (let r = 2; r <= input.employees.length + 1; r++) {
    applyNumberFormat(sheet2, `E${r}`, GROSS_FMT);
    applyNumberFormat(sheet2, `F${r}`, DATE_FMT);
    applyNumberFormat(sheet2, `G${r}`, "0");
    applyNumberFormat(sheet2, `H${r}`, "0");
  }
  const totalRow = input.employees.length + 2;
  applyNumberFormat(sheet2, `E${totalRow}`, GROSS_FMT);
  sheet2["!cols"] = [
    { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, sheet2, NASSCORP_SHEET2);

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const buffer = toArrayBuffer(out);
  const stamp = input.payrollDate.replace(/-/g, "");
  return {
    filename: `${filenameStub}_${stamp}.xlsx`,
    buffer,
  };
}

export function downloadNasscorpWorkbook(input: NasscorpFilingInput, filenameStub?: string): void {
  const { filename, buffer } = buildNasscorpWorkbook(input, filenameStub);
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function readNasscorpWorkbook(buffer: ArrayBuffer): {
  sheetNames: string[];
  employer: (string | number)[];
  employees: (string | number)[][];
  headers: string[];
} {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const s1 = wb.Sheets[NASSCORP_SHEET1];
  const s2 = wb.Sheets[NASSCORP_SHEET2];
  const employerAoA = XLSX.utils.sheet_to_json<(string | number)[]>(s1, { header: 1, raw: true });
  const employeeAoA = XLSX.utils.sheet_to_json<(string | number)[]>(s2, { header: 1, raw: true });
  return {
    sheetNames: wb.SheetNames,
    employer: (employerAoA[1] ?? []) as (string | number)[],
    employees: employeeAoA.slice(1) as (string | number)[][],
    headers: (employeeAoA[0] ?? []).map(String),
  };
}

function toArrayBuffer(out: unknown): ArrayBuffer {
  if (out instanceof ArrayBuffer) return out;
  if (out instanceof Uint8Array) {
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(out)) {
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  }
  if (Array.isArray(out)) return Uint8Array.from(out).buffer;
  throw new Error("Unexpected XLSX write output");
}

function applyNumberFormat(ws: XLSX.WorkSheet, addr: string, fmt: string) {
  const cell = ws[addr];
  if (!cell) return;
  cell.z = fmt;
  if (typeof cell.v === "number") cell.t = "n";
}

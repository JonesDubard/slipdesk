import type { Employee, EmploymentType, Currency, PaymentMethod } from "@/context/AppContext";
import type { DeductionItem } from "@/lib/mock-data";
import { normalizeGender } from "@/lib/employee-gender";
import { parseDateToISO, parseMoney } from "@/lib/csv/parse-csv-line";
import { parseDeductionItemsFromCsvRecord } from "@/lib/csv/parse-deduction-items";
import { normalizePaymentMethod } from "@/lib/csv/parse-employee-csv";
import { rowToRecord } from "@/lib/csv/normalize-headers";
import { parseTextTable, readSpreadsheet, type SpreadsheetTable } from "@/lib/csv/read-spreadsheet";
import { canonicalizeBranch, stripUnregisteredBranchErrors } from "@/lib/csv/resolve-branch";

export interface ParsePayrollCsvOptions {
  registeredBranches?: string[];
}

export interface BulkRow {
  employee: Omit<Employee, "id" | "fullName">;
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
  deductions: number;
  deductionItems: DeductionItem[];
}

const VALID_EMP_TYPES: EmploymentType[] = ["full_time", "part_time", "contractor", "casual"];
const EMP_TYPE_ALIASES: Record<string, EmploymentType> = {
  full_time: "full_time",
  fulltime: "full_time",
  ft: "full_time",
  part_time: "part_time",
  parttime: "part_time",
  pt: "part_time",
  contractor: "contractor",
  contract: "contractor",
  casual: "casual",
};

export function parseNum(v: string, fallback = 0): number {
  return parseMoney(v, fallback);
}

export function parsePayrollRow(
  raw: Record<string, string>,
  lineNum: number,
  dedColumns: string[],
  options?: ParsePayrollCsvOptions,
): { row: BulkRow | null; error: string | null } {
  const firstName = raw.first_name?.trim();
  const middleName = raw.middle_name?.trim() || raw.middlename?.trim() || "";
  const lastName = raw.last_name?.trim();
  if (!firstName || !lastName)
    return { row: null, error: `Line ${lineNum}: first_name and last_name are required.` };

  const empTypeKey = (raw.employment_type?.trim().toLowerCase() || "full_time").replace(/[\s-]+/g, "_");
  const empType = (EMP_TYPE_ALIASES[empTypeKey] ?? empTypeKey) as EmploymentType;
  if (!VALID_EMP_TYPES.includes(empType))
    return { row: null, error: `Line ${lineNum}: invalid employment_type "${raw.employment_type}".` };

  const currencyRaw = (raw.currency?.trim() || "USD").replace(/^\$/, "").toUpperCase();
  const currency = (currencyRaw === "LRD" ? "LRD" : currencyRaw === "USD" ? "USD" : "") as Currency;
  if (!currency)
    return { row: null, error: `Line ${lineNum}: invalid currency "${raw.currency}". Use USD or LRD.` };

  const payParsed = normalizePaymentMethod(raw.payment_method?.trim() || "cash");
  if (payParsed.error)
    return { row: null, error: `Line ${lineNum}: ${payParsed.error}` };

  const genderParsed = normalizeGender(raw.gender?.trim() ?? "");
  if (genderParsed.error)
    return { row: null, error: `Line ${lineNum}: ${genderParsed.error}` };

  const standardHours = parseNum(raw.standard_hours, 173.33);

  const employee: Omit<Employee, "id" | "fullName"> = {
    employeeNumber: raw.employee_number?.trim() || "",
    firstName,
    middleName,
    lastName,
    gender: genderParsed.value,
    jobTitle: raw.job_title?.trim() || "",
    department: raw.department?.trim() || "",
    branch: canonicalizeBranch(raw.branch, options?.registeredBranches ?? []),
    email: raw.email?.trim() || "",
    phone: raw.phone?.trim() || "",
    county: raw.county?.trim() || "",
    startDate: parseDateToISO(raw.start_date),
    employmentType: empType,
    currency,
    rate: parseNum(raw.rate, 0),
    standardHours,
    allowances: parseNum(raw.allowances, 0),
    nasscorpNumber: raw.nasscorp_number?.trim() || "",
    paymentMethod: payParsed.value,
    bankName: raw.bank_name?.trim() || "",
    accountNumber: raw.account_number?.trim() || "",
    momoNumber: raw.momo_number?.trim() || "",
    isActive: true,
    isArchived: false,
  };

  const regularRaw = (raw.regular_hours ?? "").trim();
  const overtimeRaw = (raw.overtime_hours ?? "").trim();
  const holidayRaw = (raw.holiday_hours ?? "").trim();

  const regularHours = regularRaw ? parseNum(regularRaw, standardHours) : standardHours;
  const overtimeHours = overtimeRaw ? parseNum(overtimeRaw, 0) : 0;
  const holidayHours = holidayRaw ? parseNum(holidayRaw, 0) : 0;

  const { deductions, deductionItems } = parseDeductionItemsFromCsvRecord(raw, dedColumns);

  return {
    row: { employee, regularHours, overtimeHours, holidayHours, deductions, deductionItems },
    error: null,
  };
}

function parsePayrollTable(
  table: SpreadsheetTable,
  options?: ParsePayrollCsvOptions,
): { rows: BulkRow[]; errors: string[] } {
  if (table.error && table.rows.length === 0) {
    return { rows: [], errors: [table.error] };
  }

  const dedColumns = table.headers.filter((h) => h.startsWith("ded_"));
  const rows: BulkRow[] = [];
  const errors: string[] = [];

  table.rows.forEach((values, idx) => {
    if (!values.some((v) => String(v ?? "").trim())) return;
    const raw = rowToRecord(table.headers, values.map((v) => String(v ?? "")));
    const { row, error } = parsePayrollRow(raw, idx + 2, dedColumns, options);
    if (error) errors.push(error);
    else if (row) rows.push(row);
  });

  return { rows, errors: stripUnregisteredBranchErrors(errors) };
}

export function parsePayrollCSV(
  text: string,
  options?: ParsePayrollCsvOptions,
): { rows: BulkRow[]; errors: string[] } {
  return parsePayrollTable(parseTextTable(text), options);
}

export function parsePayrollSpreadsheet(
  buffer: ArrayBuffer,
  filename?: string,
  options?: ParsePayrollCsvOptions,
): { rows: BulkRow[]; errors: string[] } {
  return parsePayrollTable(readSpreadsheet(buffer, filename), options);
}

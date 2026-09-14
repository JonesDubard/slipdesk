import type { Employee, EmploymentType, Currency, PaymentMethod } from "@/context/AppContext";
import type { DeductionItem } from "@/lib/mock-data";
import { normalizeGender } from "@/lib/employee-gender";
import { parseCSVLine, parseDateToISO, splitCsvLines } from "@/lib/csv/parse-csv-line";

export interface BulkRow {
  employee: Omit<Employee, "id" | "fullName">;
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
  deductions: number;
  deductionItems: DeductionItem[];
}

const VALID_EMP_TYPES: EmploymentType[] = ["full_time", "part_time", "contractor", "casual"];
const VALID_CURRENCIES: Currency[] = ["USD", "LRD"];
const VALID_PAYMENT_METHODS: PaymentMethod[] = ["bank_transfer", "mtn_momo", "orange_money", "cash"];

export function parseNum(v: string, fallback = 0): number {
  const n = parseFloat(v?.trim() || "");
  return Number.isNaN(n) ? fallback : n;
}

function titleCase(snake: string): string {
  return snake
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function parsePayrollRow(
  raw: Record<string, string>,
  lineNum: number,
  dedColumns: string[],
): { row: BulkRow | null; error: string | null } {
  const firstName = raw.first_name?.trim();
  const middleName = raw.middle_name?.trim() || raw.middlename?.trim() || "";
  const lastName = raw.last_name?.trim();
  if (!firstName || !lastName)
    return { row: null, error: `Line ${lineNum}: first_name and last_name are required.` };

  const empType = (raw.employment_type?.trim().toLowerCase() ?? "full_time") as EmploymentType;
  if (!VALID_EMP_TYPES.includes(empType))
    return { row: null, error: `Line ${lineNum}: invalid employment_type "${raw.employment_type}".` };

  const currency = (raw.currency?.trim().toUpperCase() ?? "USD") as Currency;
  if (!VALID_CURRENCIES.includes(currency))
    return { row: null, error: `Line ${lineNum}: invalid currency "${raw.currency}". Use USD or LRD.` };

  const payMethod = (raw.payment_method?.trim().toLowerCase() ?? "cash") as PaymentMethod;
  if (!VALID_PAYMENT_METHODS.includes(payMethod))
    return { row: null, error: `Line ${lineNum}: invalid payment_method "${raw.payment_method}".` };

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
    branch: raw.branch?.trim() || "",
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
    paymentMethod: payMethod,
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

  let deductions = 0;
  const deductionItems: DeductionItem[] = [];

  if (dedColumns.length > 0) {
    for (const col of dedColumns) {
      const amount = parseNum((raw[col] ?? "").trim(), 0);
      if (amount > 0) {
        deductionItems.push({ label: titleCase(col.replace(/^ded_/, "")), amount });
        deductions += amount;
      }
    }
  } else {
    const deductRaw = (raw.deductions ?? "").trim();
    deductions = deductRaw ? parseNum(deductRaw, 0) : 0;
  }

  return {
    row: { employee, regularHours, overtimeHours, holidayHours, deductions, deductionItems },
    error: null,
  };
}

export function parsePayrollCSV(text: string): { rows: BulkRow[]; errors: string[] } {
  const lines = splitCsvLines(text);
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length < 2 || !lines[0]?.trim())
    return { rows: [], errors: ["CSV must have a header row and at least one data row."] };

  const headers = parseCSVLine(lines[0]).map((h) =>
    h.toLowerCase().trim().replace(/^"+|"+$/g, "").replace(/\s+/g, "_"),
  );

  const hasData = lines.slice(1).some((l) => l.trim());
  if (!hasData)
    return { rows: [], errors: ["CSV must have a header row and at least one data row."] };

  const dedColumns = headers.filter((h) => h.startsWith("ded_"));
  const rows: BulkRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = parseCSVLine(lines[i]);
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = values[idx] ?? "";
    });

    const { row, error } = parsePayrollRow(raw, i + 1, dedColumns);
    if (error) errors.push(error);
    else if (row) rows.push(row);
  }

  return { rows, errors };
}

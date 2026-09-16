import type { Employee, EmploymentType, PaymentMethod } from "@/context/AppContext";
import { normalizeGender } from "@/lib/employee-gender";
import { parseDateToISO, parseMoney } from "@/lib/csv/parse-csv-line";
import { rowToRecord } from "@/lib/csv/normalize-headers";
import { parseTextTable, readSpreadsheet, type SpreadsheetTable } from "@/lib/csv/read-spreadsheet";
import { canonicalizeBranch, stripUnregisteredBranchErrors } from "@/lib/csv/resolve-branch";

export interface ParsedEmployeeRow {
  data: Partial<Employee>;
  errors: string[];
}

export interface ParseEmployeeCsvOptions {
  /** Existing Organization branch names. Unknown names are kept, not rejected. */
  registeredBranches?: string[];
}

const VALID_PAYMENT_METHODS: PaymentMethod[] = ["bank_transfer", "mtn_momo", "orange_money", "cash"];

const PAYMENT_ALIASES: Record<string, PaymentMethod> = {
  bank_transfer: "bank_transfer",
  bank: "bank_transfer",
  banktransfer: "bank_transfer",
  mtn_momo: "mtn_momo",
  momo: "mtn_momo",
  mtn: "mtn_momo",
  mtnmomo: "mtn_momo",
  lonestar: "mtn_momo",
  lonestar_cell: "mtn_momo",
  mobile_money: "mtn_momo",
  mobilemoney: "mtn_momo",
  orange_money: "orange_money",
  orange: "orange_money",
  orangemoney: "orange_money",
  cash: "cash",
};

/** Map CSV payment-method labels to the DB enum. Blank defaults to bank_transfer. */
export function normalizePaymentMethod(raw: string | undefined | null): {
  value: PaymentMethod;
  error?: string;
} {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { value: "bank_transfer" };
  const key = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  const mapped = PAYMENT_ALIASES[key] ?? (VALID_PAYMENT_METHODS.includes(key as PaymentMethod) ? (key as PaymentMethod) : undefined);
  if (!mapped) {
    return {
      value: "bank_transfer",
      error: `Invalid payment_method "${trimmed}". Use bank_transfer, mtn_momo, orange_money, or cash.`,
    };
  }
  return { value: mapped };
}

function parseEmployeeTable(
  table: SpreadsheetTable,
  options?: ParseEmployeeCsvOptions,
): { rows: ParsedEmployeeRow[]; error?: string } {
  if (table.error && table.rows.length === 0) return { rows: [], error: table.error };
  const registered = options?.registeredBranches ?? [];
  const results: ParsedEmployeeRow[] = [];

  for (const vals of table.rows) {
    if (!vals.some((v) => String(v ?? "").trim())) continue;
    const raw = rowToRecord(table.headers, vals.map((v) => String(v ?? "")));
    const errors: string[] = [];
    const firstName = (raw.first_name || "").trim();
    const middleName = (raw.middle_name || "").trim();
    const lastName = (raw.last_name || "").trim();
    const currencyRaw = (raw.currency || "").trim();
    const currency = (currencyRaw || "USD").replace(/^\$/, "").toUpperCase();
    const payParsed = normalizePaymentMethod(raw.payment_method);
    const rateVal = (raw.rate || "").trim();

    if (!firstName) errors.push("First name required");
    if (!lastName) errors.push("Last name required");
    if (!rateVal) errors.push("Rate required");
    if (payParsed.error) errors.push(payParsed.error);
    if (currencyRaw && currency !== "USD" && currency !== "LRD") {
      errors.push(`Invalid currency "${currencyRaw}". Use USD or LRD.`);
    }
    // Unknown branch names (Sinkor, Paynesville, Bangli, …) are valid.
    // Auto-create + branch_id happen on Import — never unregisteredBranchMessage here.

    const genderParsed = normalizeGender(raw.gender);
    if (genderParsed.error) errors.push(genderParsed.error);

    const n = (v: string | undefined) => {
      const s = (v ?? "").trim();
      if (!s) return null;
      const parsed = parseMoney(s, Number.NaN);
      return Number.isNaN(parsed) ? null : parsed;
    };

    const empTypeRaw = (raw.employment_type || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    const employmentType = (
      ["full_time", "part_time", "contractor", "casual"].includes(empTypeRaw)
        ? empTypeRaw
        : empTypeRaw === "fulltime" || empTypeRaw === "ft"
          ? "full_time"
          : empTypeRaw === "parttime" || empTypeRaw === "pt"
            ? "part_time"
            : empTypeRaw === "contract"
              ? "contractor"
              : "full_time"
    ) as EmploymentType;

    results.push({
      errors: stripUnregisteredBranchErrors(errors),
      data: {
        employeeNumber: (raw.employee_number || "").trim(),
        firstName,
        middleName,
        lastName,
        gender: genderParsed.value,
        jobTitle: raw.job_title || "",
        department: raw.department || "Operations",
        branch: canonicalizeBranch(raw.branch, registered),
        email: raw.email || "",
        phone: raw.phone || "",
        county: raw.county || "Montserrado",
        startDate: parseDateToISO(raw.start_date),
        employmentType,
        currency: currency === "LRD" ? "LRD" : "USD",
        rate: parseMoney(raw.rate, 0),
        standardHours: parseMoney(raw.standard_hours, 173.33),
        allowances: parseMoney(raw.allowances, 0),
        nasscorpNumber: raw.nasscorp_number || "",
        paymentMethod: payParsed.value,
        bankName: raw.bank_name || "",
        accountNumber: raw.account_number || "",
        momoNumber: raw.momo_number || "",
        isActive: true,
        isArchived: false,
        pendingRegularHours: n(raw.regular_hours),
        pendingOvertimeHours: n(raw.overtime_hours),
        pendingHolidayHours: n(raw.holiday_hours),
        pendingDeductions:
          Object.entries(raw)
            .filter(([key]) => key.startsWith("ded"))
            .reduce((sum, [, val]) => sum + (parseMoney(val, 0) || 0), 0) ||
          n(raw.deductions) ||
          null,
      },
    });
  }
  return { rows: results, error: table.error };
}

export function parseEmployeeCSV(text: string, options?: ParseEmployeeCsvOptions): ParsedEmployeeRow[] {
  return parseEmployeeTable(parseTextTable(text), options).rows;
}

export function parseEmployeeSpreadsheet(
  buffer: ArrayBuffer,
  filename?: string,
  options?: ParseEmployeeCsvOptions,
): { rows: ParsedEmployeeRow[]; error?: string } {
  return parseEmployeeTable(readSpreadsheet(buffer, filename), options);
}

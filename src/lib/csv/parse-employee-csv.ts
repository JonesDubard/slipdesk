import type { Employee, EmploymentType, PaymentMethod } from "@/context/AppContext";
import { normalizeGender } from "@/lib/employee-gender";
import { parseCSVLine, parseDateToISO, splitCsvLines } from "@/lib/csv/parse-csv-line";

export interface ParsedEmployeeRow {
  data: Partial<Employee>;
  errors: string[];
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

export function parseEmployeeCSV(text: string): ParsedEmployeeRow[] {
  const lines = splitCsvLines(text);
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, "").replace(/^"|"$/g, "").replace(/_/g, ""),
  );

  const results: ParsedEmployeeRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const vals = parseCSVLine(lines[i]);
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = vals[idx] ?? "";
    });

    const errors: string[] = [];
    const firstName = raw.firstname || "";
    const middleName = raw.middlename || "";
    const lastName = raw.lastname || "";
    const currency = (raw.currency || "USD").toUpperCase();
    const payParsed = normalizePaymentMethod(raw.paymentmethod);

    if (!firstName) errors.push("First name required");
    if (!lastName) errors.push("Last name required");
    if (!raw.currency) errors.push("Currency required");
    if (!raw.rate) errors.push("Rate required");
    if (payParsed.error) errors.push(payParsed.error);

    const genderParsed = normalizeGender(raw.gender);
    if (genderParsed.error) errors.push(genderParsed.error);

    const n = (v: string | undefined) => (v ? parseFloat(v) : null);

    const employeeNumber = (raw.employeenumber || raw["employee#"] || "").trim();

    const empTypeRaw = (raw.employmenttype || "").trim().toLowerCase();
    const employmentType = (
      ["full_time", "part_time", "contractor", "casual"].includes(empTypeRaw)
        ? empTypeRaw
        : "full_time"
    ) as EmploymentType;

    results.push({
      errors,
      data: {
        employeeNumber,
        firstName,
        middleName,
        lastName,
        gender: genderParsed.value,
        jobTitle: raw.jobtitle || "",
        department: raw.department || "Operations",
        branch: raw.branch || "",
        email: raw.email || "",
        phone: raw.phone || "",
        county: raw.county || "Montserrado",
        startDate: parseDateToISO(raw.startdate),
        employmentType,
        currency: currency === "LRD" ? "LRD" : "USD",
        rate: Number.isNaN(parseFloat(raw.rate)) ? 0 : parseFloat(raw.rate),
        standardHours: Number.isNaN(parseFloat(raw.standardhours)) ? 173.33 : parseFloat(raw.standardhours),
        allowances: Number.isNaN(parseFloat(raw.allowances ?? "0")) ? 0 : parseFloat(raw.allowances ?? "0"),
        nasscorpNumber: raw.nasscorpnumber || "",
        paymentMethod: payParsed.value,
        bankName: raw.bankname || "",
        accountNumber: raw.accountnumber || "",
        momoNumber: raw.momonumber || "",
        isActive: true,
        isArchived: false,
        pendingRegularHours: n(raw.regularhours),
        pendingOvertimeHours: n(raw.overtimehours),
        pendingHolidayHours: n(raw.holidayhours),
        pendingDeductions:
          Object.entries(raw)
            .filter(([key]) => key.startsWith("ded"))
            .reduce((sum, [, val]) => sum + (parseFloat(val) || 0), 0) ||
          n(raw.deductions) ||
          null,
      },
    });
  }
  return results;
}

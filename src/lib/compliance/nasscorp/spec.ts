/**
 * Official NASSCORP 2025 payroll workbook rules.
 * Source: PAYROLL-FORMAT-2025.xlsx + Instructions for Submission of Payroll records.
 * Bonus and Off-Cycle payrolls are excluded from NASSCORP statutory reporting
 * (NASSCORP does not calculate those run types). Do not map them to a PayPeriod.
 */

export const NASSCORP_SHEET1 = "Sheet1";
export const NASSCORP_SHEET2 = "Sheet2";

export const NASSCORP_EMPLOYER_HEADERS = [
  "EmployerID",
  "EmployerName",
  "CurrencyTypeID",
  "PayrollDate",
] as const;

export const NASSCORP_EMPLOYEE_HEADERS = [
  "NASSCorpNo",
  "FirstName",
  "MiddleName",
  "LastName",
  "GrossPay",
  "PayrollDate",
  "PayPeriod",
  "PayrollType",
] as const;

export const NASSCORP_TOTAL_GROSS_LABEL = "TOTAL GROSS";

/** 1 = LRD, 2 = USD */
export type NasscorpCurrencyTypeId = 1 | 2;
/** 1 = Weekly, 2 = Bi-Weekly, 3 = Monthly */
export type NasscorpPayPeriod = 1 | 2 | 3;
/** 1 = NPS + EIS, 2 = EIS only */
export type NasscorpPayrollType = 1 | 2;

export const DEFAULT_NASSCORP_PAYROLL_TYPE: NasscorpPayrollType = 1;

export const NASSCORP_PAYROLL_TYPE_LABELS: Record<NasscorpPayrollType, string> = {
  1: "NPS + EIS",
  2: "EIS only",
};

export const NASSCORP_UNSUPPORTED_RUN_TYPES = ["bonus", "off_cycle"] as const;

export function digitsOnly(raw: string | null | undefined): string {
  return (raw ?? "").trim();
}

export function isSevenDigitEmployerId(raw: string | null | undefined): boolean {
  return /^\d{7}$/.test(digitsOnly(raw));
}

export function isNineDigitSsNumber(raw: string | null | undefined): boolean {
  return /^\d{9}$/.test(digitsOnly(raw));
}

export function isNasscorpPayrollType(value: unknown): value is NasscorpPayrollType {
  return value === 1 || value === 2;
}

export function currencyTypeId(currency: string): NasscorpCurrencyTypeId | null {
  const c = currency.trim().toUpperCase();
  if (c === "LRD") return 1;
  if (c === "USD") return 2;
  return null;
}

/** Weekly=1, Bi-Weekly=2, Monthly=3. Returns null for Bonus, Off-Cycle, and unknown types. */
export function payPeriodFromRunType(runType: string | null | undefined): NasscorpPayPeriod | null {
  switch ((runType ?? "").trim()) {
    case "weekly":
      return 1;
    case "bi_weekly":
      return 2;
    case "monthly":
      return 3;
    default:
      return null;
  }
}

export function isUnsupportedNasscorpRunType(runType: string | null | undefined): boolean {
  const t = (runType ?? "").trim();
  return (NASSCORP_UNSUPPORTED_RUN_TYPES as readonly string[]).includes(t);
}

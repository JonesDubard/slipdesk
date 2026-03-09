/**
 * Slipdesk Payroll Engine v1.0
 * Pure TypeScript utility functions for Liberian SME payroll compliance.
 * Covers: NASSCORP (4%/6%), LRA PAYE dual-currency brackets, OT, holiday pay.
 *
 * Usage:
 *   import { calculatePayroll, processPayroll } from './slipdesk-payroll-engine';
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type Currency = "USD" | "LRD";

export interface PayrollInput {
  employeeId: string;
  currency: Currency;           // base currency for this employee's rate
  rate: number;                 // hourly rate in base currency
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
  exchangeRate: number;         // 1 USD = N LRD  (e.g. 193.5)
  additionalEarnings?: number;  // bonuses / allowances in base currency
}

export interface NasscorpResult {
  base: number;                   // regular salary — the NASSCORP basis
  employeeContribution: number;   // 4%
  employerContribution: number;   // 6%
}

export interface PayeResult {
  grossInLRD: number;     // gross converted to LRD before brackets
  taxInLRD: number;       // tax in LRD
  taxInBase: number;      // tax converted back to employee's base currency
  effectiveRate: number;  // e.g. 0.12 → 12%
}

export interface PayrollResult {
  employeeId: string;
  currency: Currency;
  exchangeRate: number;

  // ── Earnings ──
  regularSalary: number;
  overtimePay: number;
  holidayPay: number;
  additionalEarnings: number;
  grossPay: number;

  // ── Deductions ──
  nasscorp: NasscorpResult;
  paye: PayeResult;
  totalDeductions: number;

  // ── Net & Employer ──
  netPay: number;
  totalEmployerCost: number;   // grossPay + employer NASSCORP

  // ── Compliance ──
  warnings: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const NASSCORP_EE_RATE   = 0.04;   // employee contribution
const NASSCORP_ER_RATE   = 0.06;   // employer contribution
const OT_MULTIPLIER      = 1.5;
const HOLIDAY_MULTIPLIER = 2.0;
const MIN_WAGE_USD       = 150;    // monthly guardrail

/**
 * LRA PAYE monthly tax brackets (LRD amounts).
 * Structure: from ≤ taxableIncome ≤ to  →  baseTax + rate × excess
 */
interface TaxBracket {
  from: number;
  to: number;
  baseTax: number;
  rate: number;
}

const PAYE_BRACKETS: readonly TaxBracket[] = [
  { from: 0,       to: 70_000,   baseTax: 0,      rate: 0.00 },
  { from: 70_000,  to: 200_000,  baseTax: 0,      rate: 0.05 },
  { from: 200_000, to: 800_000,  baseTax: 6_500,  rate: 0.15 },
  { from: 800_000, to: Infinity, baseTax: 96_500, rate: 0.25 },
] as const;

// ─── Currency Helpers ─────────────────────────────────────────────────────────

/** Round to 2 decimal places */
export function roundCurrency(v: number): number {
  return Math.round(v * 100) / 100;
}

/** USD → LRD */
export function toLRD(usd: number, rate: number): number {
  return roundCurrency(usd * rate);
}

/** LRD → USD */
export function toUSD(lrd: number, rate: number): number {
  return roundCurrency(lrd / rate);
}

/** Convert any base amount to LRD */
export function baseToLRD(amount: number, currency: Currency, rate: number): number {
  return currency === "USD" ? toLRD(amount, rate) : roundCurrency(amount);
}

/** Convert LRD to base currency */
export function lrdToBase(lrd: number, currency: Currency, rate: number): number {
  return currency === "USD" ? toUSD(lrd, rate) : roundCurrency(lrd);
}

// ─── Earnings ────────────────────────────────────────────────────────────────

/** RegSalary = Rate × Hours */
export function calcRegularSalary(rate: number, hours: number): number {
  return roundCurrency(rate * hours);
}

/** OT = Rate × OT_Hours × 1.5 */
export function calcOvertimePay(rate: number, otHours: number): number {
  return roundCurrency(rate * otHours * OT_MULTIPLIER);
}

/** Holiday = Rate × Holiday_Hours × 2 */
export function calcHolidayPay(rate: number, holidayHours: number): number {
  return roundCurrency(rate * holidayHours * HOLIDAY_MULTIPLIER);
}

// ─── NASSCORP ────────────────────────────────────────────────────────────────

/**
 * NASSCORP contributions applied to regular salary only.
 * Employee 4%, Employer 6%.
 */
export function calcNasscorp(regularSalary: number): NasscorpResult {
  return {
    base: regularSalary,
    employeeContribution: roundCurrency(regularSalary * NASSCORP_EE_RATE),
    employerContribution: roundCurrency(regularSalary * NASSCORP_ER_RATE),
  };
}

// ─── PAYE (LRA) ───────────────────────────────────────────────────────────────

/**
 * Apply LRA PAYE monthly brackets to a gross already expressed in LRD.
 */
export function calcPayeInLRD(grossLRD: number): number {
  if (grossLRD <= 0) return 0;

  for (const bracket of PAYE_BRACKETS) {
    if (grossLRD <= bracket.to) {
      const excess = Math.max(0, grossLRD - bracket.from);
      return roundCurrency(bracket.baseTax + excess * bracket.rate);
    }
  }
  return 0; // unreachable — Infinity upper bound
}

/**
 * Full PAYE calculation with dual-currency conversion:
 * 1. Convert gross (in base) → LRD
 * 2. Apply LRA brackets in LRD
 * 3. Convert tax back to base currency
 */
export function calcPaye(
  grossInBase: number,
  currency: Currency,
  exchangeRate: number
): PayeResult {
  const grossInLRD = baseToLRD(grossInBase, currency, exchangeRate);
  const taxInLRD   = calcPayeInLRD(grossInLRD);
  const taxInBase  = lrdToBase(taxInLRD, currency, exchangeRate);

  return {
    grossInLRD,
    taxInLRD,
    taxInBase,
    effectiveRate: grossInBase > 0 ? roundCurrency(taxInBase / grossInBase) : 0,
  };
}

// ─── Minimum Wage Guardrail ───────────────────────────────────────────────────

/**
 * Returns a warning string if monthly gross < $150 USD, otherwise null.
 */
export function checkMinimumWage(
  grossInBase: number,
  currency: Currency,
  exchangeRate: number
): string | null {
  const grossUSD = currency === "USD" ? grossInBase : toUSD(grossInBase, exchangeRate);
  if (grossUSD < MIN_WAGE_USD) {
    const formatted = grossInBase.toLocaleString("en-LR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (
      `⚠ Gross pay (${currency} ${formatted}) is below the minimum wage ` +
      `threshold of $${MIN_WAGE_USD}.00 USD. Please review before submitting.`
    );
  }
  return null;
}

// ─── Master Calculation ───────────────────────────────────────────────────────

/**
 * calculatePayroll — single entry point for all payroll math.
 *
 * @param input  PayrollInput record for one employee
 * @returns      Fully computed PayrollResult
 */
export function calculatePayroll(input: PayrollInput): PayrollResult {
  const {
    employeeId,
    currency,
    rate,
    regularHours,
    overtimeHours,
    holidayHours,
    exchangeRate,
    additionalEarnings = 0,
  } = input;

  const warnings: string[] = [];

  // ── Earnings ──
  const regularSalary = calcRegularSalary(rate, regularHours);
  const overtimePay   = calcOvertimePay(rate, overtimeHours);
  const holidayPay    = calcHolidayPay(rate, holidayHours);
  const grossPay      = roundCurrency(
    regularSalary + overtimePay + holidayPay + additionalEarnings
  );

  // ── Guardrail ──
  const minWageWarn = checkMinimumWage(grossPay, currency, exchangeRate);
  if (minWageWarn) warnings.push(minWageWarn);

  // ── NASSCORP ──
  const nasscorp = calcNasscorp(regularSalary);

  // ── PAYE ──
  const paye = calcPaye(grossPay, currency, exchangeRate);

  // ── Totals ──
  const totalDeductions  = roundCurrency(nasscorp.employeeContribution + paye.taxInBase);
  const netPay           = roundCurrency(grossPay - totalDeductions);
  const totalEmployerCost = roundCurrency(grossPay + nasscorp.employerContribution);

  return {
    employeeId,
    currency,
    exchangeRate,
    regularSalary,
    overtimePay,
    holidayPay,
    additionalEarnings,
    grossPay,
    nasscorp,
    paye,
    totalDeductions,
    netPay,
    totalEmployerCost,
    warnings,
  };
}

// ─── Bulk Processing ──────────────────────────────────────────────────────────

export interface BulkPayrollSummary {
  results: PayrollResult[];
  totalGross: number;
  totalNetPay: number;
  totalEmployeeNasscorp: number;
  totalEmployerNasscorp: number;
  totalPayeCollected: number;
  totalEmployerCost: number;
  employeesWithWarnings: string[];   // employeeIds
}

/**
 * processPayroll — run calculatePayroll on a batch and aggregate totals.
 */
export function processPayroll(inputs: PayrollInput[]): BulkPayrollSummary {
  const results = inputs.map(calculatePayroll);

  return {
    results,
    totalGross:             roundCurrency(results.reduce((s, r) => s + r.grossPay, 0)),
    totalNetPay:            roundCurrency(results.reduce((s, r) => s + r.netPay, 0)),
    totalEmployeeNasscorp:  roundCurrency(results.reduce((s, r) => s + r.nasscorp.employeeContribution, 0)),
    totalEmployerNasscorp:  roundCurrency(results.reduce((s, r) => s + r.nasscorp.employerContribution, 0)),
    totalPayeCollected:     roundCurrency(results.reduce((s, r) => s + r.paye.taxInBase, 0)),
    totalEmployerCost:      roundCurrency(results.reduce((s, r) => s + r.totalEmployerCost, 0)),
    employeesWithWarnings:  results.filter((r) => r.warnings.length > 0).map((r) => r.employeeId),
  };
}

// ─── PEPM Billing ─────────────────────────────────────────────────────────────

const PEPM_RATE_USD = 1.5;

export interface PepmBillingResult {
  activeEmployees: number;
  totalBillingUSD: number;
  totalBillingLRD: number;
}

/**
 * Calculate monthly Slipdesk platform fee: $1.50 USD per active employee.
 */
export function calcPepmBilling(
  activeEmployees: number,
  exchangeRate: number
): PepmBillingResult {
  const totalBillingUSD = roundCurrency(activeEmployees * PEPM_RATE_USD);
  return {
    activeEmployees,
    totalBillingUSD,
    totalBillingLRD: toLRD(totalBillingUSD, exchangeRate),
  };
}

// ─── CSV/Excel Row Parser ─────────────────────────────────────────────────────

// Expected CSV headers (case-insensitive):
// employeeId, currency, rate, regularHours, overtimeHours, holidayHours, exchangeRate, additionalEarnings

export interface ParsedRowError {
  row: number;
  field: string;
  message: string;
}

export interface ParseResult {
  inputs: PayrollInput[];
  errors: ParsedRowError[];
}

/**
 * Parse raw SheetJS rows (array of plain objects) into PayrollInput[].
 * Call this after reading an XLSX/CSV with SheetJS utils.sheet_to_json().
 */
export function parseSheetRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Record<string, any>[]
): ParseResult {
  const inputs: PayrollInput[] = [];
  const errors: ParsedRowError[] = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2; // 1-indexed + header row

    const employeeId     = String(row["employeeid"] ?? row["EmployeeId"] ?? row["employee_id"] ?? "").trim();
    const rawCurrency    = String(row["currency"] ?? "USD").trim().toUpperCase();
    const rate           = parseFloat(row["rate"] ?? row["Rate"] ?? "0");
    const regularHours   = parseFloat(row["regularhours"] ?? row["regularHours"] ?? "0");
    const overtimeHours  = parseFloat(row["overtimehours"] ?? row["overtimeHours"] ?? "0");
    const holidayHours   = parseFloat(row["holidayhours"] ?? row["holidayHours"] ?? "0");
    const exchangeRate   = parseFloat(row["exchangerate"] ?? row["exchangeRate"] ?? "193.5");
    const additional     = parseFloat(row["additionalearnings"] ?? row["additionalEarnings"] ?? "0");

    if (!employeeId) errors.push({ row: rowNum, field: "employeeId", message: "Missing employee ID" });
    if (rawCurrency !== "USD" && rawCurrency !== "LRD")
      errors.push({ row: rowNum, field: "currency", message: `Invalid currency "${rawCurrency}"` });
    if (isNaN(rate) || rate < 0)      errors.push({ row: rowNum, field: "rate",         message: "Invalid rate"          });
    if (isNaN(regularHours))          errors.push({ row: rowNum, field: "regularHours", message: "Invalid regular hours" });
    if (isNaN(overtimeHours))         errors.push({ row: rowNum, field: "overtimeHours",message: "Invalid OT hours"      });
    if (isNaN(exchangeRate) || exchangeRate <= 0)
      errors.push({ row: rowNum, field: "exchangeRate", message: "Invalid exchange rate" });

    if (employeeId && !isNaN(rate) && !isNaN(regularHours)) {
      inputs.push({
        employeeId,
        currency:          rawCurrency === "LRD" ? "LRD" : "USD",
        rate,
        regularHours:      isNaN(regularHours)  ? 0 : regularHours,
        overtimeHours:     isNaN(overtimeHours) ? 0 : overtimeHours,
        holidayHours:      isNaN(holidayHours)  ? 0 : holidayHours,
        exchangeRate:      isNaN(exchangeRate)  ? 193.5 : exchangeRate,
        additionalEarnings: isNaN(additional)   ? 0 : additional,
      });
    }
  });

  return { inputs, errors };
}
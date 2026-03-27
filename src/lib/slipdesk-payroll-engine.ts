// // ─── Types ───────────────────────────────────────────────────────────────────

// export type Currency = "USD" | "LRD";

// export interface PayrollInput {
//   employeeId: string;
//   currency: Currency;
//   rate: number;                 // hourly rate in base currency
//   regularHours: number;
//   overtimeHours: number;
//   holidayHours: number;
//   exchangeRate: number;         // 1 USD = N LRD
//   additionalEarnings?: number;
// }

// export interface NasscorpResult {
//   base: number;
//   employeeContribution: number; // 4%
//   employerContribution: number; // 6%
// }

// export interface PayeResult {
//   grossInLRD: number;           // monthly gross in LRD (display)
//   annualGrossInLRD: number;     // × 12 — brackets applied to this
//   annualTaxInLRD: number;       // annual tax from brackets
//   taxInLRD: number;             // monthly tax in LRD (÷ 12)
//   taxInBase: number;            // monthly tax in base currency (deducted)
//   effectiveRate: number;        // taxInBase / monthlyGross
// }

// export interface PayrollResult {
//   employeeId: string;
//   currency: Currency;
//   exchangeRate: number;
//   regularSalary: number;
//   overtimePay: number;
//   holidayPay: number;
//   additionalEarnings: number;
//   grossPay: number;
//   nasscorp: NasscorpResult;
//   Paye: PayeResult;
//   totalDeductions: number;
//   netPay: number;
//   totalEmployerCost: number;
//   warnings: string[];
// }

// // ─── Constants ───────────────────────────────────────────────────────────────

// const NASSCORP_EE_RATE   = 0.04;
// const NASSCORP_ER_RATE   = 0.06;
// const OT_MULTIPLIER      = 1.5;
// const HOLIDAY_MULTIPLIER = 2.0;
// const MIN_WAGE_USD       = 150;

// /**
//  * LRA PIT ANNUAL brackets (LRD).
//  * Band 1: 0 – 70,000      → 0%
//  * Band 2: 70,001 – 200,000 → 5% of excess over 70,000
//  * Band 3: 200,001 – 800,000 → 6,500 + 15% of excess over 200,000
//  * Band 4: 800,001+ → 96,500 + 25% of excess over 800,000
//  */
// interface TaxBracket { from: number; to: number; baseTax: number; rate: number; }

// const Paye_ANNUAL_BRACKETS: readonly TaxBracket[] = [
//   { from: 0,       to: 70_000,   baseTax: 0,      rate: 0.00 },
//   { from: 70_000,  to: 200_000,  baseTax: 0,      rate: 0.05 },
//   { from: 200_000, to: 800_000,  baseTax: 6_500,  rate: 0.15 },
//   { from: 800_000, to: Infinity, baseTax: 96_500, rate: 0.25 },
// ] as const;

// // ─── Currency Helpers ─────────────────────────────────────────────────────────

// export function roundCurrency(v: number): number { return Math.round(v * 100) / 100; }
// export function toLRD(usd: number, rate: number): number { return roundCurrency(usd * rate); }
// export function toUSD(lrd: number, rate: number): number { return roundCurrency(lrd / rate); }
// export function baseToLRD(amount: number, currency: Currency, rate: number): number {
//   return currency === "USD" ? toLRD(amount, rate) : roundCurrency(amount);
// }
// export function lrdToBase(lrd: number, currency: Currency, rate: number): number {
//   return currency === "USD" ? toUSD(lrd, rate) : roundCurrency(lrd);
// }

// // ─── Earnings ────────────────────────────────────────────────────────────────

// export function calcRegularSalary(rate: number, hours: number): number {
//   return roundCurrency(rate * hours);
// }
// export function calcOvertimePay(rate: number, otHours: number): number {
//   return roundCurrency(rate * otHours * OT_MULTIPLIER);
// }
// export function calcHolidayPay(rate: number, holidayHours: number): number {
//   return roundCurrency(rate * holidayHours * HOLIDAY_MULTIPLIER);
// }

// // ─── NASSCORP ────────────────────────────────────────────────────────────────

// /** Applied to regular salary only (not OT/holiday). EE 4%, ER 6%. */
// export function calcNasscorp(regularSalary: number): NasscorpResult {
//   return {
//     base:                 regularSalary,
//     employeeContribution: roundCurrency(regularSalary * NASSCORP_EE_RATE),
//     employerContribution: roundCurrency(regularSalary * NASSCORP_ER_RATE),
//   };
// }

// // ─── Paye (LRA) ───────────────────────────────────────────────────────────────

// /**
//  * Apply LRA annual brackets to annual gross in LRD.
//  * Returns ANNUAL tax in LRD.
//  */
// export function calcAnnualPayeInLRD(annualGrossLRD: number): number {
//   if (annualGrossLRD <= 0) return 0;
//   for (const bracket of Paye_ANNUAL_BRACKETS) {
//     if (annualGrossLRD <= bracket.to) {
//       const excess = Math.max(0, annualGrossLRD - bracket.from);
//       return roundCurrency(bracket.baseTax + excess * bracket.rate);
//     }
//   }
//   return 0;
// }

// /**
//  * Full Paye for one monthly payslip.
//  * Annualises gross → applies LRA brackets → divides back by 12.
//  */
// export function calcPaye(
//   monthlyGrossInBase: number,
//   currency: Currency,
//   exchangeRate: number,
// ): PayeResult {
//   const annualGrossInBase = roundCurrency(monthlyGrossInBase * 12);
//   const annualGrossInLRD  = baseToLRD(annualGrossInBase, currency, exchangeRate);
//   const annualTaxInLRD    = calcAnnualPayeInLRD(annualGrossInLRD);
//   const monthlyTaxInLRD   = roundCurrency(annualTaxInLRD / 12);
//   const taxInBase         = lrdToBase(monthlyTaxInLRD, currency, exchangeRate);
//   const grossInLRD        = baseToLRD(monthlyGrossInBase, currency, exchangeRate);

//   return {
//     grossInLRD,
//     annualGrossInLRD,
//     annualTaxInLRD,
//     taxInLRD:     monthlyTaxInLRD,
//     taxInBase,
//     effectiveRate: monthlyGrossInBase > 0 ? roundCurrency(taxInBase / monthlyGrossInBase) : 0,
//   };
// }

// // ─── Minimum Wage ─────────────────────────────────────────────────────────────

// export function checkMinimumWage(
//   grossInBase: number, currency: Currency, exchangeRate: number,
// ): string | null {
//   const grossUSD = currency === "USD" ? grossInBase : toUSD(grossInBase, exchangeRate);
//   if (grossUSD < MIN_WAGE_USD) {
//     const fmt = grossInBase.toLocaleString("en-LR", { minimumFractionDigits:2, maximumFractionDigits:2 });
//     return `⚠ Gross pay (${currency} ${fmt}) is below the minimum wage threshold of $${MIN_WAGE_USD}.00 USD. Please review before submitting.`;
//   }
//   return null;
// }

// // ─── Master Calculation ───────────────────────────────────────────────────────

// export function calculatePayroll(input: PayrollInput): PayrollResult {
//   const { employeeId, currency, rate, regularHours, overtimeHours, holidayHours, exchangeRate, additionalEarnings = 0 } = input;
//   const warnings: string[] = [];

//   const regularSalary = calcRegularSalary(rate, regularHours);
//   const overtimePay   = calcOvertimePay(rate, overtimeHours);
//   const holidayPay    = calcHolidayPay(rate, holidayHours);
//   const grossPay      = roundCurrency(regularSalary + overtimePay + holidayPay + additionalEarnings);

//   const minWageWarn = checkMinimumWage(grossPay, currency, exchangeRate);
//   if (minWageWarn) warnings.push(minWageWarn);

//   const nasscorp = calcNasscorp(regularSalary);
//   const Paye     = calcPaye(grossPay, currency, exchangeRate);

//   const totalDeductions   = roundCurrency(nasscorp.employeeContribution + Paye.taxInBase);
//   const netPay            = roundCurrency(grossPay - totalDeductions);
//   const totalEmployerCost = roundCurrency(grossPay + nasscorp.employerContribution);

//   return { employeeId, currency, exchangeRate, regularSalary, overtimePay, holidayPay, additionalEarnings, grossPay, nasscorp, Paye, totalDeductions, netPay, totalEmployerCost, warnings };
// }

// // ─── Bulk Processing ──────────────────────────────────────────────────────────

// export interface BulkPayrollSummary {
//   results: PayrollResult[];
//   totalGross: number;
//   totalNetPay: number;
//   totalEmployeeNasscorp: number;
//   totalEmployerNasscorp: number;
//   totalPayeCollected: number;
//   totalEmployerCost: number;
//   employeesWithWarnings: string[];
// }

// export function processPayroll(inputs: PayrollInput[]): BulkPayrollSummary {
//   const results = inputs.map(calculatePayroll);
//   return {
//     results,
//     totalGross:            roundCurrency(results.reduce((s, r) => s + r.grossPay, 0)),
//     totalNetPay:           roundCurrency(results.reduce((s, r) => s + r.netPay, 0)),
//     totalEmployeeNasscorp: roundCurrency(results.reduce((s, r) => s + r.nasscorp.employeeContribution, 0)),
//     totalEmployerNasscorp: roundCurrency(results.reduce((s, r) => s + r.nasscorp.employerContribution, 0)),
//     totalPayeCollected:    roundCurrency(results.reduce((s, r) => s + r.Paye.taxInBase, 0)),
//     totalEmployerCost:     roundCurrency(results.reduce((s, r) => s + r.totalEmployerCost, 0)),
//     employeesWithWarnings: results.filter((r) => r.warnings.length > 0).map((r) => r.employeeId),
//   };
// }

// // ─── PEPM Billing ─────────────────────────────────────────────────────────────

// const PEPM_RATE_USD = 1.5;

// export interface PepmBillingResult { activeEmployees: number; totalBillingUSD: number; totalBillingLRD: number; }

// export function calcPepmBilling(activeEmployees: number, exchangeRate: number): PepmBillingResult {
//   const totalBillingUSD = roundCurrency(activeEmployees * PEPM_RATE_USD);
//   return { activeEmployees, totalBillingUSD, totalBillingLRD: toLRD(totalBillingUSD, exchangeRate) };
// }

// // ─── CSV/Excel Row Parser ─────────────────────────────────────────────────────

// export interface ParsedRowError { row: number; field: string; message: string; }
// export interface ParseResult { inputs: PayrollInput[]; errors: ParsedRowError[]; }

// export function parseSheetRows(rows: Record<string, any>[]): ParseResult {
//   const inputs: PayrollInput[] = [];
//   const errors: ParsedRowError[] = [];

//   rows.forEach((row, i) => {
//     const rowNum        = i + 2;
//     const employeeId    = String(row["employeeid"] ?? row["EmployeeId"] ?? row["employee_id"] ?? "").trim();
//     const rawCurrency   = String(row["currency"] ?? "USD").trim().toUpperCase();
//     const rate          = parseFloat(row["rate"]          ?? row["Rate"]          ?? "0");
//     const regularHours  = parseFloat(row["regularhours"]  ?? row["regularHours"]  ?? "0");
//     const overtimeHours = parseFloat(row["overtimehours"] ?? row["overtimeHours"] ?? "0");
//     const holidayHours  = parseFloat(row["holidayhours"]  ?? row["holidayHours"]  ?? "0");
//     const exchangeRate  = parseFloat(row["exchangerate"]  ?? row["exchangeRate"]  ?? "185.44");
//     const additional    = parseFloat(row["additionalearnings"] ?? row["additionalEarnings"] ?? "0");

//     if (!employeeId)                            errors.push({ row: rowNum, field: "employeeId",    message: "Missing employee ID" });
//     if (rawCurrency !== "USD" && rawCurrency !== "LRD") errors.push({ row: rowNum, field: "currency", message: `Invalid currency "${rawCurrency}"` });
//     if (isNaN(rate) || rate < 0)                errors.push({ row: rowNum, field: "rate",          message: "Invalid rate" });
//     if (isNaN(regularHours))                    errors.push({ row: rowNum, field: "regularHours",  message: "Invalid regular hours" });
//     if (isNaN(overtimeHours))                   errors.push({ row: rowNum, field: "overtimeHours", message: "Invalid OT hours" });
//     if (isNaN(exchangeRate) || exchangeRate <= 0) errors.push({ row: rowNum, field: "exchangeRate", message: "Invalid exchange rate" });

//     if (employeeId && !isNaN(rate) && !isNaN(regularHours)) {
//       inputs.push({
//         employeeId,
//         currency:           rawCurrency === "LRD" ? "LRD" : "USD",
//         rate,
//         regularHours:       isNaN(regularHours)  ? 0     : regularHours,
//         overtimeHours:      isNaN(overtimeHours) ? 0     : overtimeHours,
//         holidayHours:       isNaN(holidayHours)  ? 0     : holidayHours,
//         exchangeRate:       isNaN(exchangeRate)  ? 185.44 : exchangeRate,
//         additionalEarnings: isNaN(additional)    ? 0     : additional,
//       });
//     }
//   });

//   return { inputs, errors };
// }

// // ─── Verification Examples ────────────────────────────────────────────────────
// //
// // A) USD employee, $1,000/month gross (@ L$185.44):
// //    annualGrossLRD = 1,000 × 12 × 185.44  = L$2,322,000
// //    annualTax      = 96,500 + 25% × (2,322,000 − 800,000) = L$477,000
// //    monthlyTaxLRD  = 477,000 ÷ 12  = L$39,750
// //    taxInUSD       = 39,750 ÷ 185.44 ≈ $205.43  (eff. ~20.5%)
// //
// // B) LRD employee, L$50,000/month gross:
// //    annualGrossLRD = 600,000
// //    annualTax      = 6,500 + 15% × (600,000 − 200,000) = L$66,500
// //    monthlyTaxLRD  = 66,500 ÷ 12 ≈ L$5,541.67  (eff. ~11.1%)
// //
// // C) LRD employee, L$4,000/month gross:
// //    annualGrossLRD = 48,000  → below L$70,000 threshold → 0% tax

// ─── Types ───────────────────────────────────────────────────────────────────

export type Currency = "USD" | "LRD";

export interface PayrollInput {
  employeeId: string;
  currency: Currency;
  rate: number;                 // hourly rate in base currency
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
  exchangeRate: number;         // 1 USD = N LRD
  additionalEarnings?: number;
}

export interface NasscorpResult {
  base: number;
  employeeContribution: number; // 4%
  employerContribution: number; // 6%
}

export interface PayeResult {
  grossInLRD: number;           // monthly taxable gross in LRD (display)
  annualGrossInLRD: number;     // × 12 — brackets applied to this
  annualTaxInLRD: number;       // annual tax from brackets
  taxInLRD: number;             // monthly tax in LRD (÷ 12)
  taxInBase: number;            // monthly tax in base currency (deducted)
  effectiveRate: number;        // taxInBase / taxablePayInBase
}

export interface PayrollResult {
  employeeId: string;
  currency: Currency;
  exchangeRate: number;
  regularSalary: number;
  overtimePay: number;
  holidayPay: number;
  additionalEarnings: number;
  grossPay: number;
  nasscorp: NasscorpResult;
  Paye: PayeResult;
  totalDeductions: number;
  netPay: number;
  totalEmployerCost: number;
  warnings: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const NASSCORP_EE_RATE   = 0.04;
const NASSCORP_ER_RATE   = 0.06;
const OT_MULTIPLIER      = 1.5;
const HOLIDAY_MULTIPLIER = 2.0;
const MIN_WAGE_USD       = 150;

/**
 * LRA PIT ANNUAL brackets (LRD).
 * Band 1: 0 – 70,000      → 0%
 * Band 2: 70,001 – 200,000 → 5% of excess over 70,000
 * Band 3: 200,001 – 800,000 → 6,500 + 15% of excess over 200,000
 * Band 4: 800,001+ → 96,500 + 25% of excess over 800,000
 */
interface TaxBracket { from: number; to: number; baseTax: number; rate: number; }

const Paye_ANNUAL_BRACKETS: readonly TaxBracket[] = [
  { from: 0,       to: 70_000,   baseTax: 0,      rate: 0.00 },
  { from: 70_000,  to: 200_000,  baseTax: 0,      rate: 0.05 },
  { from: 200_000, to: 800_000,  baseTax: 6_500,  rate: 0.15 },
  { from: 800_000, to: Infinity, baseTax: 96_500, rate: 0.25 },
] as const;

// ─── Currency Helpers ─────────────────────────────────────────────────────────

export function roundCurrency(v: number): number { return Math.round(v * 100) / 100; }
export function toLRD(usd: number, rate: number): number { return roundCurrency(usd * rate); }
export function toUSD(lrd: number, rate: number): number { return roundCurrency(lrd / rate); }
export function baseToLRD(amount: number, currency: Currency, rate: number): number {
  return currency === "USD" ? toLRD(amount, rate) : roundCurrency(amount);
}
export function lrdToBase(lrd: number, currency: Currency, rate: number): number {
  return currency === "USD" ? toUSD(lrd, rate) : roundCurrency(lrd);
}

// ─── Earnings ────────────────────────────────────────────────────────────────

export function calcRegularSalary(rate: number, hours: number): number {
  return roundCurrency(rate * hours);
}
export function calcOvertimePay(rate: number, otHours: number): number {
  return roundCurrency(rate * otHours * OT_MULTIPLIER);
}
export function calcHolidayPay(rate: number, holidayHours: number): number {
  return roundCurrency(rate * holidayHours * HOLIDAY_MULTIPLIER);
}

// ─── NASSCORP ────────────────────────────────────────────────────────────────

/** Applied to regular salary only (not OT/holiday). EE 4%, ER 6%. */
export function calcNasscorp(regularSalary: number): NasscorpResult {
  return {
    base:                 regularSalary,
    employeeContribution: roundCurrency(regularSalary * NASSCORP_EE_RATE),
    employerContribution: roundCurrency(regularSalary * NASSCORP_ER_RATE),
  };
}

// ─── Paye (LRA) ───────────────────────────────────────────────────────────────

/**
 * Apply LRA annual brackets to annual gross in LRD.
 * Returns ANNUAL tax in LRD.
 */
export function calcAnnualPayeInLRD(annualGrossLRD: number): number {
  if (annualGrossLRD <= 0) return 0;
  for (const bracket of Paye_ANNUAL_BRACKETS) {
    if (annualGrossLRD <= bracket.to) {
      const excess = Math.max(0, annualGrossLRD - bracket.from);
      return roundCurrency(bracket.baseTax + excess * bracket.rate);
    }
  }
  return 0;
}

/**
 * Full Paye for one monthly payslip.
 * Annualises taxable gross → applies LRA brackets → divides back by 12.
 *
 * NOTE: monthlyTaxableInBase must be (regularSalary + overtimePay + holidayPay).
 * additionalEarnings (allowances, reimbursements, bonuses) are excluded by the caller.
 */
export function calcPaye(
  monthlyTaxableInBase: number,
  currency: Currency,
  exchangeRate: number,
): PayeResult {
  const annualGrossInBase = roundCurrency(monthlyTaxableInBase * 12);
  const annualGrossInLRD  = baseToLRD(annualGrossInBase, currency, exchangeRate);
  const annualTaxInLRD    = calcAnnualPayeInLRD(annualGrossInLRD);
  const monthlyTaxInLRD   = roundCurrency(annualTaxInLRD / 12);
  const taxInBase         = lrdToBase(monthlyTaxInLRD, currency, exchangeRate);
  const grossInLRD        = baseToLRD(monthlyTaxableInBase, currency, exchangeRate);

  return {
    grossInLRD,
    annualGrossInLRD,
    annualTaxInLRD,
    taxInLRD:     monthlyTaxInLRD,
    taxInBase,
    effectiveRate: monthlyTaxableInBase > 0 ? roundCurrency(taxInBase / monthlyTaxableInBase) : 0,
  };
}

// ─── Minimum Wage ─────────────────────────────────────────────────────────────

export function checkMinimumWage(
  grossInBase: number, currency: Currency, exchangeRate: number,
): string | null {
  const grossUSD = currency === "USD" ? grossInBase : toUSD(grossInBase, exchangeRate);
  if (grossUSD < MIN_WAGE_USD) {
    const fmt = grossInBase.toLocaleString("en-LR", { minimumFractionDigits:2, maximumFractionDigits:2 });
    return `⚠ Gross pay (${currency} ${fmt}) is below the minimum wage threshold of $${MIN_WAGE_USD}.00 USD. Please review before submitting.`;
  }
  return null;
}

// ─── Master Calculation ───────────────────────────────────────────────────────

export function calculatePayroll(input: PayrollInput): PayrollResult {
  const { employeeId, currency, rate, regularHours, overtimeHours, holidayHours, exchangeRate, additionalEarnings = 0 } = input;
  const warnings: string[] = [];

  const regularSalary = calcRegularSalary(rate, regularHours);
  const overtimePay   = calcOvertimePay(rate, overtimeHours);
  const holidayPay    = calcHolidayPay(rate, holidayHours);
  const grossPay      = roundCurrency(regularSalary + overtimePay + holidayPay + additionalEarnings);

  const minWageWarn = checkMinimumWage(grossPay, currency, exchangeRate);
  if (minWageWarn) warnings.push(minWageWarn);

  const nasscorp = calcNasscorp(regularSalary);

  // LRA PAYE is levied on regular + OT + holiday pay only.
  // additionalEarnings (allowances, reimbursements, bonuses) are excluded from the taxable base.
  const taxablePayInBase = roundCurrency(regularSalary + overtimePay + holidayPay);
  const Paye             = calcPaye(taxablePayInBase, currency, exchangeRate);

  const totalDeductions   = roundCurrency(nasscorp.employeeContribution + Paye.taxInBase);
  const netPay            = roundCurrency(grossPay - totalDeductions);
  const totalEmployerCost = roundCurrency(grossPay + nasscorp.employerContribution);

  return { employeeId, currency, exchangeRate, regularSalary, overtimePay, holidayPay, additionalEarnings, grossPay, nasscorp, Paye, totalDeductions, netPay, totalEmployerCost, warnings };
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
  employeesWithWarnings: string[];
}

export function processPayroll(inputs: PayrollInput[]): BulkPayrollSummary {
  const results = inputs.map(calculatePayroll);
  return {
    results,
    totalGross:            roundCurrency(results.reduce((s, r) => s + r.grossPay, 0)),
    totalNetPay:           roundCurrency(results.reduce((s, r) => s + r.netPay, 0)),
    totalEmployeeNasscorp: roundCurrency(results.reduce((s, r) => s + r.nasscorp.employeeContribution, 0)),
    totalEmployerNasscorp: roundCurrency(results.reduce((s, r) => s + r.nasscorp.employerContribution, 0)),
    totalPayeCollected:    roundCurrency(results.reduce((s, r) => s + r.Paye.taxInBase, 0)),
    totalEmployerCost:     roundCurrency(results.reduce((s, r) => s + r.totalEmployerCost, 0)),
    employeesWithWarnings: results.filter((r) => r.warnings.length > 0).map((r) => r.employeeId),
  };
}

// ─── PEPM Billing ─────────────────────────────────────────────────────────────

const PEPM_RATE_USD = 1.5;

export interface PepmBillingResult { activeEmployees: number; totalBillingUSD: number; totalBillingLRD: number; }

export function calcPepmBilling(activeEmployees: number, exchangeRate: number): PepmBillingResult {
  const totalBillingUSD = roundCurrency(activeEmployees * PEPM_RATE_USD);
  return { activeEmployees, totalBillingUSD, totalBillingLRD: toLRD(totalBillingUSD, exchangeRate) };
}

// ─── CSV/Excel Row Parser ─────────────────────────────────────────────────────

export interface ParsedRowError { row: number; field: string; message: string; }
export interface ParseResult { inputs: PayrollInput[]; errors: ParsedRowError[]; }

export function parseSheetRows(rows: Record<string, any>[]): ParseResult {
  const inputs: PayrollInput[] = [];
  const errors: ParsedRowError[] = [];

  rows.forEach((row, i) => {
    const rowNum        = i + 2;
    const employeeId    = String(row["employeeid"] ?? row["EmployeeId"] ?? row["employee_id"] ?? "").trim();
    const rawCurrency   = String(row["currency"] ?? "USD").trim().toUpperCase();
    const rate          = parseFloat(row["rate"]          ?? row["Rate"]          ?? "0");
    const regularHours  = parseFloat(row["regularhours"]  ?? row["regularHours"]  ?? "0");
    const overtimeHours = parseFloat(row["overtimehours"] ?? row["overtimeHours"] ?? "0");
    const holidayHours  = parseFloat(row["holidayhours"]  ?? row["holidayHours"]  ?? "0");
    const exchangeRate  = parseFloat(row["exchangerate"]  ?? row["exchangeRate"]  ?? "185.44");
    const additional    = parseFloat(row["additionalearnings"] ?? row["additionalEarnings"] ?? "0");

    if (!employeeId)                            errors.push({ row: rowNum, field: "employeeId",    message: "Missing employee ID" });
    if (rawCurrency !== "USD" && rawCurrency !== "LRD") errors.push({ row: rowNum, field: "currency", message: `Invalid currency "${rawCurrency}"` });
    if (isNaN(rate) || rate < 0)                errors.push({ row: rowNum, field: "rate",          message: "Invalid rate" });
    if (isNaN(regularHours))                    errors.push({ row: rowNum, field: "regularHours",  message: "Invalid regular hours" });
    if (isNaN(overtimeHours))                   errors.push({ row: rowNum, field: "overtimeHours", message: "Invalid OT hours" });
    if (isNaN(exchangeRate) || exchangeRate <= 0) errors.push({ row: rowNum, field: "exchangeRate", message: "Invalid exchange rate" });

    if (employeeId && !isNaN(rate) && !isNaN(regularHours)) {
      inputs.push({
        employeeId,
        currency:           rawCurrency === "LRD" ? "LRD" : "USD",
        rate,
        regularHours:       isNaN(regularHours)  ? 0     : regularHours,
        overtimeHours:      isNaN(overtimeHours) ? 0     : overtimeHours,
        holidayHours:       isNaN(holidayHours)  ? 0     : holidayHours,
        exchangeRate:       isNaN(exchangeRate)  ? 185.44 : exchangeRate,
        additionalEarnings: isNaN(additional)    ? 0     : additional,
      });
    }
  });

  return { inputs, errors };
}

// ─── Verification Examples ────────────────────────────────────────────────────
//
// A) USD employee, $1,000/month gross, $200 allowances (additionalEarnings):
//    taxableBase    = $800  (gross minus additionalEarnings)
//    annualGrossLRD = 800 × 12 × 185.44  = L$1,779,072
//    annualTax      = 96,500 + 25% × (1,779,072 − 800,000) ≈ L$341,268
//    monthlyTaxLRD  = 341,268 ÷ 12 ≈ L$28,439
//    taxInUSD       ≈ $153.36   ← allowances correctly NOT taxed
//
// B) LRD employee, L$50,000/month (no additionalEarnings):
//    annualGrossLRD = 600,000
//    annualTax      = 6,500 + 15% × (600,000 − 200,000) = L$66,500
//    monthlyTaxLRD  = 66,500 ÷ 12 ≈ L$5,541.67  (eff. ~11.1%)
//
// C) LRD employee, L$4,000/month gross:
//    annualGrossLRD = 48,000  → below L$70,000 threshold → 0% tax
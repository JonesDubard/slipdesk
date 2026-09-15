/**
 * Statutory bases persisted on pay_run_lines at finalize time.
 *
 * The payroll engine is the source of truth:
 *   taxable (PAYE) = round(regularSalary + overtimePay + holidayPay)
 *   nasscorp.base  = regularSalary = round(rate * regularHours)
 *
 * New finalizations write `taxable_pay` and `nasscorp_base`.
 * Old rows without those columns use the fallbacks below — never gross_pay
 * for NASSCORP, because extras would contradict the EE 4% / ER 6% amounts.
 */
import {
  calcRegularSalary,
  roundCurrency,
} from "@/lib/slipdesk-payroll-engine";

export type CalcStatutoryFields = {
  regularSalary: number;
  overtimePay: number;
  holidayPay: number;
  nasscorp: { base: number };
};

/** Columns to insert on pay_run_lines from the calc used at finalization. */
export function persistStatutoryBases(calc: CalcStatutoryFields): {
  taxable_pay: number;
  nasscorp_base: number;
} {
  return {
    taxable_pay: roundCurrency(
      calc.regularSalary + calc.overtimePay + calc.holidayPay,
    ),
    nasscorp_base: calc.nasscorp.base,
  };
}

/**
 * Fallback for pre-migration rows: Gross − extras.
 * Matches the engine because gross = round(taxable + additionalEarnings)
 * in typical cases; persist taxable_pay for exact historic PAYE base.
 */
export function reconstructTaxablePay(
  grossPay: number,
  additionalEarnings: number,
): number {
  return roundCurrency(grossPay - additionalEarnings);
}

/**
 * Fallback for pre-migration rows: same rounding as calcRegularSalary,
 * which is the engine's NASSCORP base.
 */
export function reconstructNasscorpBase(
  rate: number,
  regularHours: number,
): number {
  return calcRegularSalary(rate, regularHours);
}

export function optionalFiniteNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function resolveTaxablePay(opts: {
  taxablePay?: unknown;
  grossPay: number;
  additionalEarnings?: number;
}): number {
  const persisted = optionalFiniteNumber(opts.taxablePay);
  if (persisted !== undefined) return persisted;
  return reconstructTaxablePay(opts.grossPay, opts.additionalEarnings ?? 0);
}

export function resolveNasscorpBase(opts: {
  nasscorpBase?: unknown;
  rate?: unknown;
  regularHours?: unknown;
}): number | undefined {
  const persisted = optionalFiniteNumber(opts.nasscorpBase);
  if (persisted !== undefined) return persisted;
  const rate = optionalFiniteNumber(opts.rate);
  const hours = optionalFiniteNumber(opts.regularHours);
  if (rate !== undefined && hours !== undefined) {
    return reconstructNasscorpBase(rate, hours);
  }
  return undefined;
}

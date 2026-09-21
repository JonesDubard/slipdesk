/**
 * Payslip presentation helpers (labels, FX transparency, LRA note).
 * Does not change payroll Math Logic — tax brackets, NASSCORP rates, or net pay.
 */

import type { DeductionItem, PayRunLine } from "@/lib/mock-data";
import { roundCurrency, type PayrollResult } from "@/lib/slipdesk-payroll-engine";

export type PayslipContentRow = {
  label: string;
  note: string;
  amount: number;
};

const GENERIC_DEDUCTION_LABELS = new Set([
  "deduction",
  "deductions",
  "other",
  "other deduction",
  "other deductions",
]);

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function isGenericDeductionLabel(value: string): boolean {
  return GENERIC_DEDUCTION_LABELS.has(normalizeLabel(value));
}

function firstNonEmpty(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    const trimmed = (value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/**
 * Prefer a specific stored type/description/label. Never invent names like Food
 * when the data has none — fall back to whatever was stored, even if generic.
 */
export function formatDeductionItemLabel(item: DeductionItem): string {
  const candidates = [item.label, item.type, item.description, item.note];
  for (const candidate of candidates) {
    const trimmed = (candidate ?? "").trim();
    if (trimmed && !isGenericDeductionLabel(trimmed)) return trimmed;
  }
  return firstNonEmpty(...candidates);
}

export function parseStoredDeductionItems(raw: unknown): DeductionItem[] {
  if (!Array.isArray(raw)) return [];
  const items: DeductionItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const amount = Number(rec.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    items.push({
      label: typeof rec.label === "string" ? rec.label : "",
      note: typeof rec.note === "string" ? rec.note : undefined,
      type: typeof rec.type === "string" ? rec.type : undefined,
      description: typeof rec.description === "string" ? rec.description : undefined,
      amount,
    });
  }
  return items;
}

export function buildPayslipManualDeductionRows(
  line: Pick<PayRunLine, "deductions" | "deductionItems">,
): PayslipContentRow[] {
  const items = (line.deductionItems ?? []).filter((item) => Number(item.amount) > 0);
  if (items.length > 0) {
    return items.map((item) => ({
      label: formatDeductionItemLabel(item),
      note: (item.note ?? "").trim(),
      amount: item.amount,
    }));
  }
  const lump = Number(line.deductions ?? 0);
  if (lump > 0) {
    // Amount must still appear; do not invent a category (Food, Advance, etc.).
    return [{ label: "", note: "", amount: lump }];
  }
  return [];
}

/** LRA tax conversion uses the run's stored USD→LRD rate for USD employees. */
export function payslipUsedExchangeRate(currency: string): boolean {
  return currency === "USD";
}

export function formatStoredExchangeRate(rate: number): string {
  return `L$${Number(rate)} per $1`;
}

export function formatPayslipCurrencyLine(currency: string, exchangeRate: number): string {
  if (!payslipUsedExchangeRate(currency)) return currency;
  return `${currency} (Rate: ${formatStoredExchangeRate(exchangeRate)})`;
}

export function lraAmountInLrd(
  taxInBase: number,
  currency: string,
  exchangeRate: number,
  taxInLRD?: number,
): number {
  if (typeof taxInLRD === "number" && Number.isFinite(taxInLRD)) return taxInLRD;
  if (currency === "USD") return roundCurrency(taxInBase * exchangeRate);
  return roundCurrency(taxInBase);
}

/**
 * LRA note: statutory LRD amount, no effective-rate wording or percentages.
 * USD slips also include the stored exchange rate actually used for conversion.
 */
export function formatLraPayslipNote(opts: {
  taxInBase: number;
  taxInLRD?: number;
  currency: string;
  exchangeRate: number;
}): string {
  const lrd = lraAmountInLrd(opts.taxInBase, opts.currency, opts.exchangeRate, opts.taxInLRD);
  const amount = `L$${lrd.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  if (payslipUsedExchangeRate(opts.currency)) {
    return `${amount} at ${formatStoredExchangeRate(opts.exchangeRate)}`;
  }
  return amount;
}

export function buildPayslipDeductionRows(
  line: Pick<PayRunLine, "currency" | "exchangeRate" | "deductions" | "deductionItems">,
  calc: PayrollResult,
): PayslipContentRow[] {
  const sym = line.currency === "USD" ? "$" : "L$";
  return [
    {
      label: "NASSCORP (Employee 4%)",
      note: `4% of ${sym}${calc.nasscorp.base.toFixed(2)} regular salary`,
      amount: calc.nasscorp.employeeContribution,
    },
    {
      label: "Income Tax (LRA)",
      note: formatLraPayslipNote({
        taxInBase: calc.Paye.taxInBase,
        taxInLRD: calc.Paye.taxInLRD,
        currency: line.currency,
        exchangeRate: line.exchangeRate,
      }),
      amount: calc.Paye.taxInBase,
    },
    ...buildPayslipManualDeductionRows(line),
  ];
}

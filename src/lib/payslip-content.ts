/**
 * Payslip presentation helpers (labels, FX transparency).
 * Does not change payroll Math Logic — tax brackets, NASSCORP rates, or net pay.
 */

import type { DeductionItem, PayRunLine } from "@/lib/mock-data";
import type { PayrollResult } from "@/lib/slipdesk-payroll-engine";

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

/**
 * LRA basis/note is intentionally blank. Employees see the deducted amount
 * only. FX stays on the Currency field when conversion was used.
 */
export function formatLraPayslipNote(_opts?: {
  taxInBase: number;
  taxInLRD?: number;
  currency: string;
  exchangeRate: number;
}): string {
  return "";
}

export function buildPayslipEarningsRows(
  line: Pick<PayRunLine, "currency" | "rate" | "regularHours" | "overtimeHours" | "holidayHours">,
  calc: PayrollResult,
): PayslipContentRow[] {
  const sym = line.currency === "USD" ? "$" : "L$";
  const rows: PayslipContentRow[] = [
    {
      label: "Regular Salary",
      note: `${line.regularHours} hrs × ${sym}${line.rate.toFixed(2)}/hr`,
      amount: calc.regularSalary,
    },
  ];
  if (line.overtimeHours > 0) {
    rows.push({
      label: "Overtime Pay",
      note: `${line.overtimeHours} hrs × ${sym}${line.rate.toFixed(2)} × 1.5`,
      amount: calc.overtimePay,
    });
  }
  if (line.holidayHours > 0) {
    rows.push({
      label: "Holiday Pay",
      note: `${line.holidayHours} hrs × ${sym}${line.rate.toFixed(2)} × 2.0`,
      amount: calc.holidayPay,
    });
  }
  if (calc.additionalEarnings > 0) {
    // Lump-sum employee.allowances — keep as an earnings/allowance line.
    // Do not invent types (Food, Housing) and do not move this into deductions.
    rows.push({
      label: "Allowances",
      note: "",
      amount: calc.additionalEarnings,
    });
  }
  return rows;
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
      note: formatLraPayslipNote(),
      amount: calc.Paye.taxInBase,
    },
    ...buildPayslipManualDeductionRows(line),
  ];
}

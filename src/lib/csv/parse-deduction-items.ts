import type { DeductionItem } from "@/lib/mock-data";
import { parseMoney } from "@/lib/csv/parse-csv-line";

export function formatDeductionColumnLabel(col: string): string {
  return col
    .replace(/^ded_/, "")
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function csvDeductionColumns(keys: string[]): string[] {
  return keys.filter((h) => h.startsWith("ded_"));
}

/**
 * Itemize `ded_*` CSV columns (Food, Salary Advance, …). A lone `deductions`
 * lump-sum column stays unlabeled — do not invent a type.
 */
export function parseDeductionItemsFromCsvRecord(
  raw: Record<string, string>,
  dedColumns?: string[],
): { deductions: number; deductionItems: DeductionItem[] } {
  const cols = dedColumns ?? csvDeductionColumns(Object.keys(raw));
  const deductionItems: DeductionItem[] = [];
  let deductions = 0;

  if (cols.length > 0) {
    for (const col of cols) {
      const amount = parseMoney((raw[col] ?? "").trim(), 0);
      if (amount > 0) {
        const label = formatDeductionColumnLabel(col);
        deductionItems.push({ label, type: label, amount });
        deductions += amount;
      }
    }
    return { deductions, deductionItems };
  }

  const deductRaw = (raw.deductions ?? "").trim();
  deductions = deductRaw ? parseMoney(deductRaw, 0) : 0;
  return { deductions, deductionItems };
}

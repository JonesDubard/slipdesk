export const PAYROLL_VIEW_ALL = "All";

export const PAYMENT_METHOD_FILTER_LABELS: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  mtn_momo: "MTN Mobile Money",
  orange_money: "Orange Money",
  cash: "Cash",
};

export type PayRunViewSortBy = "number-asc" | "number-desc" | "name-asc" | "name-desc";

export interface PayRunViewLine {
  fullName: string;
  employeeNumber: string;
  department?: string;
  paymentMethod?: string;
}

export interface PayRunViewFilters {
  nameQuery?: string;
  department?: string;
  paymentMethod?: string;
  sortBy?: PayRunViewSortBy;
}

function employeeNumberDigits(value: string | undefined | null): number | null {
  const n = parseInt((value ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** Numeric employee # (EMP-9 before EMP-10). Blank numbers sort last. */
export function compareEmployeeNumbers(a: string, b: string): number {
  const aBlank = !(a ?? "").trim();
  const bBlank = !(b ?? "").trim();
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1;
  if (bBlank) return -1;
  const na = employeeNumberDigits(a);
  const nb = employeeNumberDigits(b);
  if (na !== null && nb !== null && na !== nb) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** View-only filter/sort. Does not add, remove, or mutate pay-run lines. */
export function filterPayRunView<T extends PayRunViewLine>(
  lines: T[],
  opts: PayRunViewFilters = {},
): T[] {
  const q = (opts.nameQuery ?? "").trim().toLowerCase();
  const dept = opts.department && opts.department !== PAYROLL_VIEW_ALL ? opts.department : "";
  const pay = opts.paymentMethod && opts.paymentMethod !== PAYROLL_VIEW_ALL
    ? opts.paymentMethod
    : "";

  let result = lines;
  if (q) {
    result = result.filter(
      (l) =>
        l.fullName.toLowerCase().includes(q) ||
        l.employeeNumber.toLowerCase().includes(q),
    );
  }
  if (dept) {
    result = result.filter((l) => (l.department ?? "") === dept);
  }
  if (pay) {
    result = result.filter((l) => (l.paymentMethod ?? "") === pay);
  }

  const sortBy = opts.sortBy ?? "number-asc";
  return [...result].sort((a, b) => {
    if (sortBy === "name-asc" || sortBy === "name-desc") {
      const cmp = a.fullName.localeCompare(b.fullName);
      return sortBy === "name-asc" ? cmp : -cmp;
    }
    const cmp = compareEmployeeNumbers(a.employeeNumber, b.employeeNumber);
    return sortBy === "number-desc" ? -cmp : cmp;
  });
}

export function uniqueDepartmentsFromLines(lines: PayRunViewLine[]): string[] {
  return [...new Set(lines.map((l) => (l.department ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function uniquePaymentMethodsFromLines(lines: PayRunViewLine[]): string[] {
  return [...new Set(lines.map((l) => l.paymentMethod ?? "").filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

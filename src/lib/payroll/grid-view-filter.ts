export const PAYROLL_VIEW_ALL = "All";

export const PAYMENT_METHOD_FILTER_LABELS: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  mtn_momo: "MTN Mobile Money",
  orange_money: "Orange Money",
  cash: "Cash",
};

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
  nameSort?: "asc" | "desc";
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

  const sort = opts.nameSort ?? "asc";
  return [...result].sort((a, b) => {
    const cmp = a.fullName.localeCompare(b.fullName);
    return sort === "asc" ? cmp : -cmp;
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

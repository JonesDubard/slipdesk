/**
 * Period reports from finalized pay_run_lines only — no payroll recalculation.
 * Register, disbursement, and summary must reconcile on the same line set.
 */

import type { FinalizedPayrollLine } from "@/lib/compliance/statutory-exports";
import type { Cell } from "@/lib/reporting";

export const PAYROLL_REGISTER_HEADERS = [
  "Employee ID #",
  "Employee Name",
  "Branch",
  "Gross Salary",
  "LRA Deduction",
  "NASSCORP Deduction",
  "Other Deduction",
  "Net Salary",
  "Currency",
  "Account #",
] as const;

export const PAYROLL_DISBURSEMENT_HEADERS = [
  "Employee ID #",
  "Employee Name",
  "Net Salary",
  "Currency",
  "Account #",
] as const;

export interface PeriodCurrencyTotals {
  currency: string;
  net: number;
  lra: number;
  nasscorpEe: number;
  otherDeductions: number;
  gross: number;
  employees: number;
}

export interface PeriodSummary {
  employees: number;
  /** Sum of finalized net_pay */
  totalNet: number;
  /** Sum of finalized income_tax (PAYE withheld) */
  totalLra: number;
  /** Sum of finalized nasscorp_ee (employee NASSCORP deducted from pay) */
  totalNasscorp: number;
  byCurrency: PeriodCurrencyTotals[];
}

function money(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

export function accountDisplay(line: FinalizedPayrollLine): string {
  const acct = (line.accountNumber ?? "").trim();
  return acct || "—";
}

export function branchDisplay(line: FinalizedPayrollLine): string {
  return (line.branch ?? "").trim() || "—";
}

export function otherDeduction(line: FinalizedPayrollLine): number {
  return Number(line.deductions ?? 0);
}

export function summarizeFinalizedPeriod(lines: FinalizedPayrollLine[]): PeriodSummary {
  const byCcy = new Map<string, PeriodCurrencyTotals>();
  for (const l of lines) {
    const ccy = (l.currency || "—").trim() || "—";
    const cur = byCcy.get(ccy) ?? {
      currency: ccy, net: 0, lra: 0, nasscorpEe: 0, otherDeductions: 0, gross: 0, employees: 0,
    };
    cur.net += Number(l.netPay) || 0;
    cur.lra += Number(l.incomeTax) || 0;
    cur.nasscorpEe += Number(l.nasscorpEe) || 0;
    cur.otherDeductions += otherDeduction(l);
    cur.gross += Number(l.grossPay) || 0;
    cur.employees += 1;
    byCcy.set(ccy, cur);
  }
  const byCurrency = [...byCcy.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  return {
    employees: lines.length,
    totalNet: byCurrency.reduce((s, c) => s + c.net, 0),
    totalLra: byCurrency.reduce((s, c) => s + c.lra, 0),
    totalNasscorp: byCurrency.reduce((s, c) => s + c.nasscorpEe, 0),
    byCurrency,
  };
}

export function payrollRegisterRows(lines: FinalizedPayrollLine[]): Cell[][] {
  return lines.map((l) => [
    l.employeeNumber || "—",
    l.fullName || "—",
    branchDisplay(l),
    money(l.grossPay),
    money(l.incomeTax),
    money(l.nasscorpEe),
    money(otherDeduction(l)),
    money(l.netPay),
    l.currency || "—",
    accountDisplay(l),
  ]);
}

export function payrollRegisterTotalRows(lines: FinalizedPayrollLine[]): Cell[][] {
  return summarizeFinalizedPeriod(lines).byCurrency.map((c) => [
    "",
    `TOTAL (${c.currency})`,
    "",
    money(c.gross),
    money(c.lra),
    money(c.nasscorpEe),
    money(c.otherDeductions),
    money(c.net),
    c.currency,
    "",
  ]);
}

export function payrollDisbursementRows(lines: FinalizedPayrollLine[]): Cell[][] {
  return lines.map((l) => [
    l.employeeNumber || "—",
    l.fullName || "—",
    money(l.netPay),
    l.currency || "—",
    accountDisplay(l),
  ]);
}

export function payrollDisbursementTotalRows(lines: FinalizedPayrollLine[]): Cell[][] {
  return summarizeFinalizedPeriod(lines).byCurrency.map((c) => [
    "",
    `TOTAL (${c.currency})`,
    money(c.net),
    c.currency,
    "",
  ]);
}

export type FinalizedCustomColumn =
  | "employeeNumber"
  | "fullName"
  | "department"
  | "branch"
  | "currency"
  | "gross"
  | "incomeTax"
  | "nasscorpEe"
  | "otherDeduction"
  | "net"
  | "accountNumber";

export const FINALIZED_CUSTOM_COLUMNS: { id: FinalizedCustomColumn; label: string }[] = [
  { id: "employeeNumber", label: "Employee ID #" },
  { id: "fullName", label: "Employee Name" },
  { id: "department", label: "Department" },
  { id: "branch", label: "Branch" },
  { id: "currency", label: "Currency" },
  { id: "gross", label: "Gross Salary" },
  { id: "incomeTax", label: "LRA Deduction" },
  { id: "nasscorpEe", label: "NASSCORP Deduction" },
  { id: "otherDeduction", label: "Other Deduction" },
  { id: "net", label: "Net Salary" },
  { id: "accountNumber", label: "Account #" },
];

function finalizedCell(line: FinalizedPayrollLine, id: FinalizedCustomColumn): Cell {
  switch (id) {
    case "employeeNumber": return line.employeeNumber || "—";
    case "fullName": return line.fullName || "—";
    case "department": return (line.department ?? "").trim() || "—";
    case "branch": return branchDisplay(line);
    case "currency": return line.currency || "—";
    case "gross": return money(line.grossPay);
    case "incomeTax": return money(line.incomeTax);
    case "nasscorpEe": return money(line.nasscorpEe);
    case "otherDeduction": return money(otherDeduction(line));
    case "net": return money(line.netPay);
    case "accountNumber": return accountDisplay(line);
  }
}

export function buildCustomReportFromFinalized(
  lines: FinalizedPayrollLine[],
  columns: FinalizedCustomColumn[],
  groupBy?: "department" | "branch" | null,
): { headers: string[]; dataRows: Cell[][]; totalRows: Cell[][] } {
  const cols = columns.length ? columns : FINALIZED_CUSTOM_COLUMNS.map((c) => c.id);
  const headers = cols.map((id) => FINALIZED_CUSTOM_COLUMNS.find((c) => c.id === id)?.label ?? id);

  if (groupBy === "department" || groupBy === "branch") {
    const groups = new Map<string, FinalizedPayrollLine[]>();
    for (const l of lines) {
      const key = groupBy === "department"
        ? ((l.department ?? "").trim() || "Unassigned")
        : (branchDisplay(l) === "—" ? "Unassigned" : branchDisplay(l));
      const list = groups.get(key) ?? [];
      list.push(l);
      groups.set(key, list);
    }
    const dataRows: Cell[][] = [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, groupLines]) => {
        const sub = summarizeFinalizedPeriod(groupLines);
        const mixed = sub.byCurrency.length > 1;
        return cols.map((id) => {
          if (id === "fullName" || id === "employeeNumber" || id === "department" || id === "branch") return key;
          if (id === "currency") return mixed ? "mixed" : (sub.byCurrency[0]?.currency ?? "—");
          if (id === "gross") return money(sub.byCurrency.reduce((s, c) => s + c.gross, 0));
          if (id === "incomeTax") return money(sub.totalLra);
          if (id === "nasscorpEe") return money(sub.totalNasscorp);
          if (id === "otherDeduction") return money(sub.byCurrency.reduce((s, c) => s + c.otherDeductions, 0));
          if (id === "net") return money(sub.totalNet);
          if (id === "accountNumber") return String(groupLines.length);
          return "";
        });
      });
    return { headers, dataRows, totalRows: [] };
  }

  const dataRows = lines.map((l) => cols.map((id) => finalizedCell(l, id)));
  const totals = summarizeFinalizedPeriod(lines);
  const totalRows = totals.byCurrency.map((c) => cols.map((id) => {
    if (id === "fullName") return `TOTAL (${c.currency})`;
    if (id === "gross") return money(c.gross);
    if (id === "incomeTax") return money(c.lra);
    if (id === "nasscorpEe") return money(c.nasscorpEe);
    if (id === "otherDeduction") return money(c.otherDeductions);
    if (id === "net") return money(c.net);
    if (id === "currency") return c.currency;
    return "";
  }));
  return { headers, dataRows, totalRows };
}

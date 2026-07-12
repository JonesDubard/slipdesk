/**
 * Slipdesk — Reporting & Analytics compute layer
 *
 * Pure, dependency-light helpers that turn the existing employee list into the
 * numbers the Analytics, Compliance and Reporting modules need. Everything is
 * computed from data already in the app (employees + the payroll engine), so
 * these modules work today without any new database tables.
 */

import * as XLSX from "xlsx";
import {
  calculatePayroll,
  type PayrollResult,
} from "@/lib/slipdesk-payroll-engine";
import type { Employee, CompanyProfile } from "@/context/AppContext";

export const DEFAULT_EXCHANGE_RATE = 185.44;

// ─── Payroll computation ────────────────────────────────────────────────────

export interface EmployeePayroll {
  employee: Employee;
  result: PayrollResult;
  /** All monetary values normalized to USD for cross-currency aggregation. */
  usd: {
    gross: number;
    net: number;
    incomeTax: number;
    nasscorpEe: number;
    nasscorpEr: number;
  };
}

export function toUSD(amount: number, currency: string, rate: number): number {
  return currency === "USD" ? amount : amount / rate;
}

export function computePayroll(
  employees: Employee[],
  exchangeRate: number = DEFAULT_EXCHANGE_RATE,
): EmployeePayroll[] {
  return employees.map((employee) => {
    const result = calculatePayroll({
      employeeId: employee.id,
      currency: employee.currency,
      rate: employee.rate,
      regularHours: employee.standardHours,
      overtimeHours: 0,
      holidayHours: 0,
      exchangeRate,
      additionalEarnings: employee.allowances ?? 0,
    });
    const c = employee.currency;
    return {
      employee,
      result,
      usd: {
        gross: toUSD(result.grossPay, c, exchangeRate),
        net: toUSD(result.netPay, c, exchangeRate),
        incomeTax: toUSD(result.Paye.taxInBase, c, exchangeRate),
        nasscorpEe: toUSD(result.nasscorp.employeeContribution, c, exchangeRate),
        nasscorpEr: toUSD(result.nasscorp.employerContribution, c, exchangeRate),
      },
    };
  });
}

export interface PayrollTotals {
  employees: number;
  gross: number;
  net: number;
  incomeTax: number;
  nasscorpEe: number;
  nasscorpEr: number;
  employerCost: number;
}

export function sumTotals(rows: EmployeePayroll[]): PayrollTotals {
  return rows.reduce<PayrollTotals>(
    (acc, r) => ({
      employees: acc.employees + 1,
      gross: acc.gross + r.usd.gross,
      net: acc.net + r.usd.net,
      incomeTax: acc.incomeTax + r.usd.incomeTax,
      nasscorpEe: acc.nasscorpEe + r.usd.nasscorpEe,
      nasscorpEr: acc.nasscorpEr + r.usd.nasscorpEr,
      employerCost: acc.employerCost + r.usd.gross + r.usd.nasscorpEr,
    }),
    { employees: 0, gross: 0, net: 0, incomeTax: 0, nasscorpEe: 0, nasscorpEr: 0, employerCost: 0 },
  );
}

export interface GroupBucket {
  key: string;
  employees: number;
  gross: number;
  net: number;
}

export type Cell = string | number;

export const fmtUSD = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtMoney = (n: number, currency: string) =>
  `${currency === "USD" ? "$" : "L$"}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function groupByDepartment(rows: EmployeePayroll[]): GroupBucket[] {
  const map = new Map<string, GroupBucket>();
  for (const r of rows) {
    const key = r.employee.department?.trim() || "Unassigned";
    const b = map.get(key) ?? { key, employees: 0, gross: 0, net: 0 };
    b.employees += 1;
    b.gross += r.usd.gross;
    b.net += r.usd.net;
    map.set(key, b);
  }
  return [...map.values()].sort((a, b) => b.gross - a.gross);
}

export function groupByBranch(rows: EmployeePayroll[]): GroupBucket[] {
  const map = new Map<string, GroupBucket>();
  for (const r of rows) {
    const key = r.employee.branch?.trim() || r.employee.county?.trim() || "Unassigned";
    const b = map.get(key) ?? { key, employees: 0, gross: 0, net: 0 };
    b.employees += 1;
    b.gross += r.usd.gross;
    b.net += r.usd.net;
    map.set(key, b);
  }
  return [...map.values()].sort((a, b) => b.gross - a.gross);
}

export type CustomReportColumn =
  | "employeeNumber"
  | "fullName"
  | "department"
  | "branch"
  | "currency"
  | "gross"
  | "incomeTax"
  | "nasscorpEe"
  | "net";

export const CUSTOM_REPORT_COLUMNS: { id: CustomReportColumn; label: string }[] = [
  { id: "employeeNumber", label: "Emp #" },
  { id: "fullName", label: "Name" },
  { id: "department", label: "Department" },
  { id: "branch", label: "Branch" },
  { id: "currency", label: "Currency" },
  { id: "gross", label: "Gross" },
  { id: "incomeTax", label: "Income Tax" },
  { id: "nasscorpEe", label: "NASSCORP EE" },
  { id: "net", label: "Net" },
];

export function buildCustomReport(
  rows: EmployeePayroll[],
  columns: CustomReportColumn[],
  groupBy?: "department" | "branch" | null,
): { headers: string[]; dataRows: Cell[][]; total?: Cell[] } {
  const cols = columns.length ? columns : CUSTOM_REPORT_COLUMNS.map((c) => c.id);
  const headers = cols.map((id) => CUSTOM_REPORT_COLUMNS.find((c) => c.id === id)?.label ?? id);

  const sourceRows = rows;
  if (groupBy === "department" || groupBy === "branch") {
    const groups = groupBy === "department" ? groupByDepartment(rows) : groupByBranch(rows);
    const dataRows: Cell[][] = groups.map((g) => cols.map((id) => {
      if (id === "fullName" || id === "employeeNumber") return g.key;
      if (id === "department" || id === "branch") return g.key;
      if (id === "gross") return fmtUSD(g.gross);
      if (id === "net") return fmtUSD(g.net);
      if (id === "currency") return "USD";
      if (id === "incomeTax" || id === "nasscorpEe") return "—";
      return g.employees;
    }));
    return { headers, dataRows };
  }

  const dataRows: Cell[][] = sourceRows.map((r) => cols.map((id) => cellFor(r, id)));
  return { headers, dataRows };
}

function cellFor(r: EmployeePayroll, id: CustomReportColumn): Cell {
  switch (id) {
    case "employeeNumber": return r.employee.employeeNumber;
    case "fullName": return r.employee.fullName;
    case "department": return r.employee.department || "—";
    case "branch": return r.employee.branch || r.employee.county || "—";
    case "currency": return r.employee.currency;
    case "gross": return fmtMoney(r.result.grossPay, r.employee.currency);
    case "incomeTax": return fmtMoney(r.result.Paye.taxInBase, r.employee.currency);
    case "nasscorpEe": return fmtMoney(r.result.nasscorp.employeeContribution, r.employee.currency);
    case "net": return fmtMoney(r.result.netPay, r.employee.currency);
  }
}

export function currencyDistribution(rows: EmployeePayroll[]): { currency: string; count: number }[] {
  const usd = rows.filter((r) => r.employee.currency === "USD").length;
  const lrd = rows.length - usd;
  return [
    { currency: "USD", count: usd },
    { currency: "LRD", count: lrd },
  ].filter((d) => d.count > 0);
}

// ─── Compliance validation ──────────────────────────────────────────────────

export type ComplianceSeverity = "critical" | "warning";

export interface ComplianceIssue {
  id: string;
  severity: ComplianceSeverity;
  category: "TIN" | "NASSCORP" | "Duplicate" | "Deduction" | "Salary" | "Company";
  message: string;
  employeeId?: string;
  employeeName?: string;
}

export interface ComplianceReport {
  issues: ComplianceIssue[];
  criticalCount: number;
  warningCount: number;
  /** 0–100 overall compliance score. */
  score: number;
  payrollReady: boolean;
  lraReady: boolean;
  nasscorpReady: boolean;
}

export function runComplianceChecks(
  employees: Employee[],
  company: CompanyProfile,
  exchangeRate: number = DEFAULT_EXCHANGE_RATE,
): ComplianceReport {
  const issues: ComplianceIssue[] = [];
  const active = employees.filter((e) => e.isActive && !e.isArchived);

  // Company-level obligations
  if (!company.tin?.trim()) {
    issues.push({
      id: "company-tin",
      severity: "critical",
      category: "Company",
      message: "Company LRA TIN is missing. Required on every payslip and LRA filing.",
    });
  }
  if (!company.nasscorpRegNo?.trim()) {
    issues.push({
      id: "company-nasscorp",
      severity: "critical",
      category: "Company",
      message: "Company NASSCORP registration number is missing.",
    });
  }

  // Duplicate detection (by employee number + by name)
  const numberSeen = new Map<string, Employee>();
  const nameSeen = new Map<string, Employee>();

  for (const e of active) {
    const name = `${e.fullName}`;

    if (!e.nasscorpNumber?.trim()) {
      issues.push({
        id: `nasscorp-${e.id}`,
        severity: "warning",
        category: "NASSCORP",
        message: `${name} has no NASSCORP number.`,
        employeeId: e.id,
        employeeName: name,
      });
    }

    // Missing TIN heuristic: bank details required for salaried payouts
    if (!e.accountNumber?.trim() && e.paymentMethod === "bank_transfer") {
      issues.push({
        id: `bank-${e.id}`,
        severity: "warning",
        category: "Deduction",
        message: `${name} is paid by bank transfer but has no account number on file.`,
        employeeId: e.id,
        employeeName: name,
      });
    }

    if (!Number.isFinite(e.rate) || e.rate <= 0) {
      issues.push({
        id: `salary-${e.id}`,
        severity: "critical",
        category: "Salary",
        message: `${name} has an invalid or zero pay rate.`,
        employeeId: e.id,
        employeeName: name,
      });
    }

    // Minimum wage guardrail reuses the payroll engine warnings
    const calc = calculatePayroll({
      employeeId: e.id,
      currency: e.currency,
      rate: e.rate,
      regularHours: e.standardHours,
      overtimeHours: 0,
      holidayHours: 0,
      exchangeRate,
      additionalEarnings: e.allowances ?? 0,
    });
    for (const w of calc.warnings) {
      issues.push({
        id: `minwage-${e.id}`,
        severity: "warning",
        category: "Salary",
        message: `${name}: ${w.replace(/^⚠\s*/, "")}`,
        employeeId: e.id,
        employeeName: name,
      });
    }

    const numKey = e.employeeNumber?.trim().toLowerCase();
    if (numKey) {
      if (numberSeen.has(numKey)) {
        issues.push({
          id: `dupnum-${e.id}`,
          severity: "critical",
          category: "Duplicate",
          message: `Duplicate employee number "${e.employeeNumber}" (${name}).`,
          employeeId: e.id,
          employeeName: name,
        });
      } else {
        numberSeen.set(numKey, e);
      }
    }

    const nameKey = name.trim().toLowerCase();
    if (nameKey) {
      if (nameSeen.has(nameKey)) {
        issues.push({
          id: `dupname-${e.id}`,
          severity: "warning",
          category: "Duplicate",
          message: `Possible duplicate employee "${name}".`,
          employeeId: e.id,
          employeeName: name,
        });
      } else {
        nameSeen.set(nameKey, e);
      }
    }
  }

  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  // Score: start at 100, critical -12 each, warning -4 each, floored at 0.
  const score = Math.max(0, 100 - criticalCount * 12 - warningCount * 4);

  const lraReady = !issues.some(
    (i) => i.category === "TIN" || i.id === "company-tin" || (i.category === "Salary" && i.severity === "critical"),
  );
  const nasscorpReady = !issues.some((i) => i.id === "company-nasscorp");

  return {
    issues,
    criticalCount,
    warningCount,
    score,
    payrollReady: criticalCount === 0,
    lraReady,
    nasscorpReady,
  };
}

// ─── Export helpers ─────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCSV(filename: string, headers: string[], rows: Cell[][]) {
  const escape = (v: Cell) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

export interface SheetSpec {
  name: string;
  headers: string[];
  rows: Cell[][];
}

export function downloadExcel(filename: string, sheets: SheetSpec[]) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows]);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

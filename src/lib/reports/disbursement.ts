import type { Employee } from "@/context/AppContext";
import type { DeductionItem } from "@/lib/mock-data";
import { computePayroll, type EmployeePayroll } from "@/lib/reporting";

export const PAYMENT_PROVIDER_LABELS: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  mtn_momo: "Lonestar / MTN MoMo",
  orange_money: "Orange Money",
  cash: "Cash",
};

export interface DisbursementRow {
  employeeId: string;
  employeeNumber: string;
  fullName: string;
  branch: string;
  paymentMethod: string;
  paymentProvider: string;
  bankAccountNumber: string;
  mobileMoneyNumber: string;
  grossSalary: number;
  allowances: number;
  deductions: number;
  deductionItems: DeductionItem[];
  totalDeductions: number;
  netSalary: number;
  currency: string;
}

export function buildDisbursementRows(employees: Employee[]): DisbursementRow[] {
  const payrollRows = computePayroll(employees);
  const byId = new Map(payrollRows.map((r) => [r.employee.id, r]));

  return employees
    .filter((e) => e.isActive && !e.isArchived)
    .map((emp) => {
      const pr = byId.get(emp.id);
      const calc = pr?.result;
      const gross = calc?.grossPay ?? 0;
      const manualDed = emp.pendingDeductions ?? 0;
      const statutoryDed =
        (calc?.nasscorp.employeeContribution ?? 0) + (calc?.Paye.taxInBase ?? 0);
      const totalDeductions = (calc?.totalDeductions ?? 0) + manualDed;

      return {
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        fullName: emp.fullName,
        branch: emp.branch ?? "",
        paymentMethod: emp.paymentMethod,
        paymentProvider: PAYMENT_PROVIDER_LABELS[emp.paymentMethod] ?? emp.paymentMethod,
        bankAccountNumber: emp.accountNumber ?? "",
        mobileMoneyNumber: emp.momoNumber ?? "",
        grossSalary: gross,
        allowances: emp.allowances ?? 0,
        deductions: manualDed,
        deductionItems: [],
        totalDeductions,
        netSalary: calc ? Math.max(0, calc.netPay - manualDed) : 0,
        currency: emp.currency,
      };
    });
}

/** Human-readable payroll disbursement report (not a validated bank upload file). */
export function disbursementReportHeaders(): string[] {
  return [
    "Employee ID",
    "Name",
    "Branch",
    "Payment Method",
    "Provider",
    "Bank Account",
    "Mobile Money",
    "Gross",
    "Allowances",
    "Deductions",
    "Total Deductions",
    "Net",
    "Currency",
  ];
}

export function disbursementReportRows(rows: DisbursementRow[]): string[][] {
  return rows.map((r) => [
    r.employeeNumber,
    r.fullName,
    r.branch || "—",
    r.paymentMethod,
    r.paymentProvider,
    r.bankAccountNumber || "—",
    r.mobileMoneyNumber || "—",
    r.grossSalary.toFixed(2),
    r.allowances.toFixed(2),
    r.deductions.toFixed(2),
    r.totalDeductions.toFixed(2),
    r.netSalary.toFixed(2),
    r.currency,
  ]);
}

/**
 * Bank disbursement export — PLACEHOLDER column layout.
 * Not validated against any Liberian bank upload specification.
 */
export function bankDisbursementHeaders(): string[] {
  return [
    "Employee ID",
    "Name",
    "Account Number",
    "Gross",
    "Deductions",
    "Total Deductions",
    "Net",
    "Payment Method",
    "Reference",
  ];
}

export function bankDisbursementRows(rows: DisbursementRow[]): string[][] {
  return rows
    .filter((r) => r.paymentMethod === "bank_transfer")
    .map((r) => [
      r.employeeNumber,
      r.fullName,
      r.bankAccountNumber,
      r.grossSalary.toFixed(2),
      r.deductions.toFixed(2),
      r.totalDeductions.toFixed(2),
      r.netSalary.toFixed(2),
      r.paymentMethod,
      "",
    ]);
}

/**
 * Mobile money disbursement export — PLACEHOLDER column layout.
 * Not validated against MTN/Orange bulk payment file specs.
 */
export function mobileMoneyDisbursementHeaders(): string[] {
  return [
    "Employee ID",
    "Name",
    "Phone Number",
    "Provider",
    "Gross",
    "Deductions",
    "Total Deductions",
    "Net",
    "Reference",
  ];
}

export function mobileMoneyDisbursementRows(rows: DisbursementRow[]): string[][] {
  return rows
    .filter((r) => r.paymentMethod === "mtn_momo" || r.paymentMethod === "orange_money")
    .map((r) => [
      r.employeeNumber,
      r.fullName,
      r.mobileMoneyNumber,
      r.paymentProvider,
      r.grossSalary.toFixed(2),
      r.deductions.toFixed(2),
      r.totalDeductions.toFixed(2),
      r.netSalary.toFixed(2),
      "",
    ]);
}

export function rowsFromFinalizedPayroll(
  lines: Array<{
    employeeNumber: string;
    fullName: string;
    department?: string;
    currency: string;
    grossPay: number;
    additionalEarnings?: number;
    deductions?: number;
    netPay: number;
    incomeTax: number;
    nasscorpEe: number;
    paymentMethod?: string;
    accountNumber?: string;
    mobileNumber?: string;
    branch?: string;
  }>,
): DisbursementRow[] {
  return lines.map((l) => {
    const pm = l.paymentMethod ?? "cash";
    const statutory = (l.incomeTax ?? 0) + (l.nasscorpEe ?? 0);
    const manual = l.deductions ?? 0;
    return {
      employeeId: l.employeeNumber,
      employeeNumber: l.employeeNumber,
      fullName: l.fullName,
      branch: l.branch ?? l.department ?? "",
      paymentMethod: pm,
      paymentProvider: PAYMENT_PROVIDER_LABELS[pm] ?? pm,
      bankAccountNumber: l.accountNumber ?? "",
      mobileMoneyNumber: l.mobileNumber ?? "",
      grossSalary: l.grossPay,
      allowances: l.additionalEarnings ?? 0,
      deductions: manual,
      deductionItems: [],
      totalDeductions: statutory + manual,
      netSalary: l.netPay,
      currency: l.currency,
    };
  });
}

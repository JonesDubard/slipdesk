/**
 * Statutory export column mappings — isolated from payroll calculation engine.
 * PLACEHOLDER: column names/order must be confirmed against official LRA/NASSCORP specs.
 */

import type { EmployeePayroll } from "@/lib/reporting";
import {
  optionalFiniteNumber,
  resolveNasscorpBase,
  resolveTaxablePay,
} from "@/lib/payroll/statutory-bases";

export interface StatutoryEmployerInfo {
  companyName: string;
  tin?: string;
  nasscorpRegNo?: string;
  periodLabel: string;
}

export function lraExportHeaders(): string[] {
  return [
    "Employer Name",
    "Employer TIN",
    "Payroll Period",
    "Employee Number",
    "Employee Name",
    "Gross Income",
    "Taxable Income",
    "PAYE Withheld",
    "Currency",
  ];
}

export function lraExportRows(
  employer: StatutoryEmployerInfo,
  rows: EmployeePayroll[],
): string[][] {
  return rows.map(({ employee, result }) => {
    const taxable =
      result.regularSalary + result.overtimePay + result.holidayPay;
    return [
      employer.companyName,
      employer.tin ?? "",
      employer.periodLabel,
      employee.employeeNumber,
      employee.fullName,
      result.grossPay.toFixed(2),
      taxable.toFixed(2),
      result.Paye.taxInBase.toFixed(2),
      employee.currency,
    ];
  });
}

export function nasscorpExportHeaders(): string[] {
  return [
    "Employer Name",
    "NASSCORP Reg No",
    "Reporting Period",
    "Employee Number",
    "Employee Name",
    "NASSCORP Number",
    "Employee Contribution (4%)",
    "Employer Contribution (6%)",
    "Contribution Base",
    "Currency",
  ];
}

export function nasscorpExportRows(
  employer: StatutoryEmployerInfo,
  rows: EmployeePayroll[],
): string[][] {
  return rows.map(({ employee, result }) => [
    employer.companyName,
    employer.nasscorpRegNo ?? "",
    employer.periodLabel,
    employee.employeeNumber,
    employee.fullName,
    employee.nasscorpNumber ?? "",
    result.nasscorp.employeeContribution.toFixed(2),
    result.nasscorp.employerContribution.toFixed(2),
    result.nasscorp.base.toFixed(2),
    employee.currency,
  ]);
}

/** Finalized pay_run_lines — no recalculation from live employee rates. */
export interface FinalizedPayrollLine {
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
  nasscorpEr: number;
  /** PAYE base used at finalization (regular + OT + holiday). */
  taxablePay?: number;
  /** NASSCORP contribution base used at finalization (regularSalary). */
  nasscorpBase?: number;
  /** Present so pre-migration rows can reconstruct nasscorp.base = rate × hours. */
  rate?: number;
  regularHours?: number;
  nasscorpNumber?: string;
  paymentMethod?: string;
  accountNumber?: string;
  mobileNumber?: string;
  branch?: string;
}

/** Snake_case fields read from a pay_run_lines row (partial rows allowed). */
export type PayRunLineRowInput = {
  employee_id?: string | null;
  employee_number?: string | number | null;
  full_name?: string | null;
  department?: string | null;
  currency?: string | null;
  gross_pay?: number | string | null;
  additional_earnings?: number | string | null;
  deductions?: number | string | null;
  net_pay?: number | string | null;
  income_tax?: number | string | null;
  nasscorp_ee?: number | string | null;
  nasscorp_er?: number | string | null;
  taxable_pay?: number | string | null;
  nasscorp_base?: number | string | null;
  rate?: number | string | null;
  regular_hours?: number | string | null;
};

/** Employee fields joined onto a finalized line for disbursement / NASSCORP export. */
export type EmployeePayExtras = {
  nasscorp_number?: string | null;
  payment_method?: string | null;
  account_number?: string | null;
  momo_number?: string | null;
  branch?: string | null;
};

/**
 * Map a persisted pay_run_lines row to the export/report shape.
 * Prefers taxable_pay / nasscorp_base when present; otherwise reconstructs.
 */
export function mapPayRunLineRowToFinalized(
  l: PayRunLineRowInput,
  emp?: EmployeePayExtras,
): FinalizedPayrollLine {
  const grossPay = Number(l.gross_pay ?? 0);
  const additionalEarnings = Number(l.additional_earnings ?? 0);
  const rate = optionalFiniteNumber(l.rate);
  const regularHours = optionalFiniteNumber(l.regular_hours);
  return {
    employeeNumber: String(l.employee_number ?? ""),
    fullName: String(l.full_name ?? ""),
    department: l.department ?? undefined,
    currency: String(l.currency ?? "USD"),
    grossPay,
    additionalEarnings,
    deductions: Number(l.deductions ?? 0),
    netPay: Number(l.net_pay ?? 0),
    incomeTax: Number(l.income_tax ?? 0),
    nasscorpEe: Number(l.nasscorp_ee ?? 0),
    nasscorpEr: Number(l.nasscorp_er ?? 0),
    taxablePay: resolveTaxablePay({
      taxablePay: l.taxable_pay,
      grossPay,
      additionalEarnings,
    }),
    nasscorpBase: resolveNasscorpBase({
      nasscorpBase: l.nasscorp_base,
      rate,
      regularHours,
    }),
    rate,
    regularHours,
    nasscorpNumber: emp?.nasscorp_number ?? "",
    paymentMethod: emp?.payment_method ?? "cash",
    accountNumber: emp?.account_number ?? "",
    mobileNumber: emp?.momo_number ?? "",
    branch: emp?.branch ?? "",
  };
}

export function lraExportRowsFromFinalized(
  employer: StatutoryEmployerInfo,
  lines: FinalizedPayrollLine[],
): string[][] {
  return lines.map((l) => {
    const taxable = resolveTaxablePay({
      taxablePay: l.taxablePay,
      grossPay: l.grossPay,
      additionalEarnings: l.additionalEarnings,
    });
    return [
      employer.companyName,
      employer.tin ?? "",
      employer.periodLabel,
      l.employeeNumber,
      l.fullName,
      l.grossPay.toFixed(2),
      taxable.toFixed(2),
      l.incomeTax.toFixed(2),
      l.currency,
    ];
  });
}

export function nasscorpExportRowsFromFinalized(
  employer: StatutoryEmployerInfo,
  lines: FinalizedPayrollLine[],
): string[][] {
  return lines.map((l) => {
    const base = resolveNasscorpBase({
      nasscorpBase: l.nasscorpBase,
      rate: l.rate,
      regularHours: l.regularHours,
    });
    return [
      employer.companyName,
      employer.nasscorpRegNo ?? "",
      employer.periodLabel,
      l.employeeNumber,
      l.fullName,
      l.nasscorpNumber ?? "",
      l.nasscorpEe.toFixed(2),
      l.nasscorpEr.toFixed(2),
      (base ?? 0).toFixed(2),
      l.currency,
    ];
  });
}

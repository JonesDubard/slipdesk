/**
 * Statutory export column mappings — isolated from payroll calculation engine.
 * PLACEHOLDER: column names/order must be confirmed against official LRA/NASSCORP specs.
 */

import type { EmployeePayroll } from "@/lib/reporting";

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
  firstName?: string;
  middleName?: string;
  lastName?: string;
  department?: string;
  currency: string;
  grossPay: number;
  additionalEarnings?: number;
  deductions?: number;
  netPay: number;
  incomeTax: number;
  nasscorpEe: number;
  nasscorpEr: number;
  nasscorpBase?: number;
  nasscorpNumber?: string;
  paymentMethod?: string;
  accountNumber?: string;
  mobileNumber?: string;
  branch?: string;
  payDate?: string;
  runType?: string;
}

export function lraExportRowsFromFinalized(
  employer: StatutoryEmployerInfo,
  lines: FinalizedPayrollLine[],
): string[][] {
  return lines.map((l) => [
    employer.companyName,
    employer.tin ?? "",
    employer.periodLabel,
    l.employeeNumber,
    l.fullName,
    l.grossPay.toFixed(2),
    l.grossPay.toFixed(2),
    l.incomeTax.toFixed(2),
    l.currency,
  ]);
}

export function nasscorpExportRowsFromFinalized(
  employer: StatutoryEmployerInfo,
  lines: FinalizedPayrollLine[],
): string[][] {
  return lines.map((l) => [
    employer.companyName,
    employer.nasscorpRegNo ?? "",
    employer.periodLabel,
    l.employeeNumber,
    l.fullName,
    l.nasscorpNumber ?? "",
    l.nasscorpEe.toFixed(2),
    l.nasscorpEr.toFixed(2),
    (l.nasscorpBase ?? l.grossPay).toFixed(2),
    l.currency,
  ]);
}

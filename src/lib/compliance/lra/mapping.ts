/**
 * LRA PAYE mapping from finalized payroll.
 *
 * Official filing is monthly PAYE withholding remitted to the LRA (typically by the 10th
 * of the following month) via e-Tax / ELITAS. No public official spreadsheet/schema
 * equivalent to NASSCORP PAYROLL-FORMAT-2025.xlsx has been published. Do not invent one.
 *
 * Sources checked: LRA site (revenue.lra.gov.lr / ELITAS), Liberia Revenue Code,
 * PwC Worldwide Tax Summaries (payroll withholding due by the 10th).
 */

import type { FinalizedPayrollLine } from "@/lib/compliance/statutory-exports";

export const LRA_OFFICIAL_FORMAT_STATUS = "unconfirmed" as const;

export const LRA_MAPPED_HEADERS = [
  "Employer Name",
  "Employer TIN",
  "Payroll Period",
  "Employee ID #",
  "Employee Name",
  "Gross Pay",
  "PAYE Withheld",
  "Currency",
] as const;

export interface LraIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface LraMappedRow {
  employerName: string;
  employerTin: string;
  periodLabel: string;
  employeeNumber: string;
  fullName: string;
  grossPay: number;
  payeWithheld: number;
  currency: string;
}

export function mapLraWorkingSchedule(opts: {
  employerName: string;
  employerTin: string;
  periodLabel: string;
  lines: FinalizedPayrollLine[];
}): LraMappedRow[] {
  return opts.lines.map((l) => ({
    employerName: opts.employerName.trim(),
    employerTin: opts.employerTin.trim(),
    periodLabel: opts.periodLabel,
    employeeNumber: l.employeeNumber || "",
    fullName: l.fullName || "",
    grossPay: Number(l.grossPay) || 0,
    payeWithheld: Number(l.incomeTax) || 0,
    currency: l.currency || "",
  }));
}

export function lraWorkingScheduleRows(rows: LraMappedRow[]): (string | number)[][] {
  return rows.map((r) => [
    r.employerName,
    r.employerTin,
    r.periodLabel,
    r.employeeNumber || "—",
    r.fullName || "—",
    r.grossPay.toFixed(2),
    r.payeWithheld.toFixed(2),
    r.currency || "—",
  ]);
}

export function validateLraMapping(opts: {
  employerTin: string;
  lines: FinalizedPayrollLine[];
}): { readyForOfficialExport: false; errors: LraIssue[]; warnings: LraIssue[] } {
  const errors: LraIssue[] = [];
  const warnings: LraIssue[] = [];

  if (!opts.lines.length) {
    errors.push({
      severity: "error",
      code: "no-period",
      message: "Select a finalized payroll period to map PAYE withheld.",
    });
  }
  if (!opts.employerTin.trim()) {
    errors.push({
      severity: "error",
      code: "employer-tin",
      message: "Company LRA TIN is missing (Settings). Required for any LRA filing.",
    });
  }

  warnings.push({
    severity: "warning",
    code: "format-unconfirmed",
    message: "This is an LRA/PAYE working report from finalized payroll, not an official e-Tax / ELITAS upload file. No public official spreadsheet template was found.",
  });
  warnings.push({
    severity: "warning",
    code: "due-date",
    message: "PAYE withheld is generally due to the LRA by the 10th of the month after salaries are paid. Confirm the current rule for this employer.",
  });

  return { readyForOfficialExport: false, errors, warnings };
}

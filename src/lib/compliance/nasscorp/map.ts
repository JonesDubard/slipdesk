import type { FinalizedPayrollLine } from "@/lib/compliance/statutory-exports";
import {
  DEFAULT_NASSCORP_PAYROLL_TYPE,
  type NasscorpPayrollType,
} from "@/lib/compliance/nasscorp/spec";
import type { NasscorpEmployeeInput, NasscorpFilingInput } from "@/lib/compliance/nasscorp/validate";

export function toNasscorpEmployeeInput(line: FinalizedPayrollLine): NasscorpEmployeeInput {
  const iso = (line.payDate ?? "").trim().slice(0, 10);
  return {
    nassCorpNo: (line.nasscorpNumber ?? "").trim(),
    firstName: (line.firstName ?? "").trim(),
    middleName: (line.middleName ?? "").trim(),
    lastName: (line.lastName ?? "").trim(),
    grossPay: Number(line.grossPay),
    payrollDate: iso,
    runType: (line.runType ?? "").trim(),
    currency: (line.currency ?? "").trim(),
    label: line.fullName || line.employeeNumber || "Employee",
  };
}

export function buildNasscorpFilingInput(opts: {
  employerId: string;
  employerName: string;
  payrollDate: string;
  payrollType?: NasscorpPayrollType;
  lines: FinalizedPayrollLine[];
}): NasscorpFilingInput {
  return {
    employerId: opts.employerId.trim(),
    employerName: opts.employerName.trim(),
    payrollDate: opts.payrollDate.trim().slice(0, 10),
    payrollType: opts.payrollType ?? DEFAULT_NASSCORP_PAYROLL_TYPE,
    employees: opts.lines.map(toNasscorpEmployeeInput),
  };
}

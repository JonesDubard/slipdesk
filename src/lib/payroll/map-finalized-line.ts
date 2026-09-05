import type { FinalizedPayrollLine } from "@/lib/compliance/statutory-exports";

export const FINALIZED_EMPLOYEE_SELECT =
  "id, payment_method, account_number, momo_number, branch, nasscorp_number, first_name, middle_name, last_name";

export function mapFinalizedPayrollLine(
  line: Record<string, unknown>,
  emp: Record<string, unknown> | undefined,
  run: { payDate?: string | null; runType?: string | null },
): FinalizedPayrollLine {
  return {
    employeeNumber: String(line.employee_number ?? ""),
    fullName: String(line.full_name ?? ""),
    firstName: String(emp?.first_name ?? ""),
    middleName: String(emp?.middle_name ?? ""),
    lastName: String(emp?.last_name ?? ""),
    department: String(line.department ?? ""),
    currency: String(line.currency ?? ""),
    grossPay: Number(line.gross_pay ?? 0),
    additionalEarnings: Number(line.additional_earnings ?? 0),
    deductions: Number(line.deductions ?? 0),
    netPay: Number(line.net_pay ?? 0),
    incomeTax: Number(line.income_tax ?? 0),
    nasscorpEe: Number(line.nasscorp_ee ?? 0),
    nasscorpEr: Number(line.nasscorp_er ?? 0),
    nasscorpBase: Number(line.gross_pay ?? 0),
    nasscorpNumber: String(emp?.nasscorp_number ?? ""),
    paymentMethod: String(emp?.payment_method ?? "cash"),
    accountNumber: String(emp?.account_number ?? ""),
    mobileNumber: String(emp?.momo_number ?? ""),
    branch: String(emp?.branch ?? ""),
    payDate: String(run.payDate ?? "").slice(0, 10),
    runType: String(run.runType ?? ""),
  };
}

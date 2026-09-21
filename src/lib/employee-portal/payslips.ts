/**
 * Read-only payslip views sourced from persisted pay_run_lines (no re-calc).
 */

import type { DeductionItem } from "@/lib/mock-data";
import { parseStoredDeductionItems } from "@/lib/payslip-content";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type EmployeePayslip = {
  id: string;
  payRunId: string;
  employeeId: string;
  periodLabel: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  currency: string;
  rate: number;
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
  additionalEarnings: number;
  exchangeRate: number;
  grossPay: number;
  incomeTax: number;
  nasscorpEe: number;
  nasscorpEr: number;
  netPay: number;
  deductions?: number;
  deductionItems?: DeductionItem[];
  employeeNumber: string;
  fullName: string;
  jobTitle: string;
  department: string;
  status: string;
};

function mapEmployeePayslip(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  line: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: any,
): EmployeePayslip {
  return {
    id: line.id,
    payRunId: line.pay_run_id,
    employeeId: line.employee_id,
    periodLabel: run.period_label,
    payPeriodStart: run.pay_period_start,
    payPeriodEnd: run.pay_period_end,
    payDate: run.pay_date,
    currency: line.currency,
    rate: Number(line.rate),
    regularHours: Number(line.regular_hours),
    overtimeHours: Number(line.overtime_hours),
    holidayHours: Number(line.holiday_hours),
    additionalEarnings: Number(line.additional_earnings),
    exchangeRate: Number(line.exchange_rate),
    grossPay: Number(line.gross_pay),
    incomeTax: Number(line.income_tax),
    nasscorpEe: Number(line.nasscorp_ee),
    nasscorpEr: Number(line.nasscorp_er),
    netPay: Number(line.net_pay),
    deductions: Number(line.deductions ?? 0),
    deductionItems: parseStoredDeductionItems(line.deduction_items),
    employeeNumber: line.employee_number,
    fullName: line.full_name,
    jobTitle: line.job_title,
    department: line.department,
    status: run.status,
  };
}

/**
 * List paid payslips for a single employee. Always filters by employeeId —
 * callers must pass the authenticated employee's id only.
 */
export async function listEmployeePayslips(
  client: AnyClient,
  employeeId: string,
  companyId: string,
  limit = 24,
): Promise<EmployeePayslip[]> {
  if (!employeeId || !companyId) return [];

  const { data: lines, error } = await client
    .from("pay_run_lines")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !lines?.length) return [];

  const runIds = [...new Set((lines as { pay_run_id: string }[]).map((l) => l.pay_run_id))];
  const { data: runs } = await client
    .from("pay_runs")
    .select("id, period_label, pay_period_start, pay_period_end, pay_date, status")
    .in("id", runIds)
    .eq("status", "paid");

  const runMap = new Map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((runs ?? []) as any[]).map((r) => [r.id, r]),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (lines as any[])
    .filter((line) => runMap.has(line.pay_run_id))
    .map((line) => mapEmployeePayslip(line, runMap.get(line.pay_run_id)));
}

/**
 * Fetch one payslip line. Returns null when missing OR when it belongs to
 * a different employee (defense in depth for IDOR attempts).
 */
export async function getEmployeePayslip(
  client: AnyClient,
  payslipLineId: string,
  employeeId: string,
  companyId: string,
): Promise<EmployeePayslip | null> {
  if (!payslipLineId || !employeeId || !companyId) return null;

  const { data: line, error } = await client
    .from("pay_run_lines")
    .select("*")
    .eq("id", payslipLineId)
    .eq("employee_id", employeeId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !line) return null;

  const { data: run } = await client
    .from("pay_runs")
    .select("id, period_label, pay_period_start, pay_period_end, pay_date, status")
    .eq("id", line.pay_run_id)
    .eq("status", "paid")
    .maybeSingle();

  if (!run) return null;

  return mapEmployeePayslip(line, run);
}

import { PayrollInput } from "./slipdesk-payroll-engine";

export function employeeToPayrollInput(employee: {
  id: string;
  currency: "USD" | "LRD";
  rate: number;
  standardHours: number;
}): PayrollInput {
  return {
    employeeId: employee.id,
    currency: employee.currency,
    rate: employee.rate,
    regularHours: employee.standardHours,
    overtimeHours: 0,
    holidayHours: 0,
    exchangeRate: 185.44,
    additionalEarnings: 0,
  };
}
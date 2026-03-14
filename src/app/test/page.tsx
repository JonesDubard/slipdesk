"use client";
import { calculatePayroll } from "@/lib/slipdesk-payroll-engine";

export default function TestPage() {
  const result = calculatePayroll({
    employeeId: "EMP-001",
    currency: "USD",
    rate: 8.50,
    regularHours: 173.33,
    overtimeHours: 10,
    holidayHours: 0,
    exchangeRate: 185.44,
  });
  return <pre className="p-8">{JSON.stringify(result, null, 2)}</pre>;
}
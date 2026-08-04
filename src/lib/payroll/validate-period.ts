/**
 * Pre-payroll validation — warnings/errors; never silently ignore.
 * Pure engine; persistence + notifications happen in callers.
 */

import type { LeaveRequestRecord } from "@/lib/leave/leave";
import { leaveOverlapsPeriod } from "@/lib/leave/leave";
import type { LeaveBalance } from "@/lib/leave/balances";
import { LABOR_RULES } from "@/lib/labor-rules";

export type ValidationSeverity = "warning" | "error" | "info";

export type PayrollValidationIssue = {
  severity: ValidationSeverity;
  code: string;
  message: string;
  employeeId?: string;
  meta?: Record<string, unknown>;
};

export function validatePayrollPeriod(input: {
  periodStart: string;
  periodEnd: string;
  attendance: Array<{
    id: string;
    employeeId: string;
    workDate: string;
    status: string;
    hoursWorked: number;
  }>;
  leaveRequests: LeaveRequestRecord[];
  balances: LeaveBalance[];
  maxShiftHours?: number;
}): PayrollValidationIssue[] {
  const issues: PayrollValidationIssue[] = [];
  const maxShift = input.maxShiftHours ?? LABOR_RULES.MAX_DAILY_HOURS_WARNING;

  // Missing attendance (open / missing_clock_out) in period — excluding approved leave days
  for (const a of input.attendance) {
    if (a.workDate < input.periodStart || a.workDate > input.periodEnd) continue;
    const onLeave = input.leaveRequests.some(
      (l) =>
        l.employeeId === a.employeeId &&
        l.status === "approved" &&
        leaveOverlapsPeriod(l.startDate, l.endDate, a.workDate, a.workDate),
    );
    if (onLeave) continue;
    if (a.status === "open" || a.status === "missing_clock_out") {
      issues.push({
        severity: "warning",
        code: "missing_attendance",
        message: `Missing clock-out or incomplete attendance on ${a.workDate}.`,
        employeeId: a.employeeId,
        meta: { workDate: a.workDate, status: a.status },
      });
    }
    if (a.hoursWorked > maxShift) {
      issues.push({
        severity: "warning",
        code: "invalid_overtime",
        message: `Hours ${a.hoursWorked} on ${a.workDate} exceed max shift ${maxShift}.`,
        employeeId: a.employeeId,
        meta: { workDate: a.workDate, hoursWorked: a.hoursWorked },
      });
    }
  }

  // Duplicate attendance same employee+date (shouldn't happen with unique constraint — still check)
  const seen = new Map<string, number>();
  for (const a of input.attendance) {
    if (a.workDate < input.periodStart || a.workDate > input.periodEnd) continue;
    const key = `${a.employeeId}|${a.workDate}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, n] of seen) {
    if (n > 1) {
      const [employeeId, workDate] = key.split("|");
      issues.push({
        severity: "error",
        code: "duplicate_attendance",
        message: `Duplicate attendance rows for ${workDate}.`,
        employeeId,
        meta: { workDate, count: n },
      });
    }
  }

  // Pending leave approvals overlapping period
  for (const l of input.leaveRequests) {
    if (l.status !== "pending" && l.status !== "info_requested") continue;
    if (!leaveOverlapsPeriod(l.startDate, l.endDate, input.periodStart, input.periodEnd)) continue;
    issues.push({
      severity: "warning",
      code: "pending_leave",
      message: `Pending leave (${l.leaveType}) ${l.startDate}→${l.endDate} overlaps this pay period.`,
      employeeId: l.employeeId,
      meta: { leaveId: l.id },
    });
  }

  // Overlapping approved leave for same employee
  const approved = input.leaveRequests.filter((l) => l.status === "approved");
  for (let i = 0; i < approved.length; i++) {
    for (let j = i + 1; j < approved.length; j++) {
      const a = approved[i];
      const b = approved[j];
      if (a.employeeId !== b.employeeId) continue;
      if (leaveOverlapsPeriod(a.startDate, a.endDate, b.startDate, b.endDate)) {
        issues.push({
          severity: "error",
          code: "overlapping_leave",
          message: `Overlapping approved leave for employee (${a.startDate}–${a.endDate} and ${b.startDate}–${b.endDate}).`,
          employeeId: a.employeeId,
          meta: { leaveIds: [a.id, b.id] },
        });
      }
    }
  }

  // Negative balances
  for (const bal of input.balances) {
    if (bal.remaining < 0) {
      issues.push({
        severity: "error",
        code: "negative_balance",
        message: `Negative ${bal.leaveType} leave balance (${bal.remaining}).`,
        employeeId: bal.employeeId,
        meta: { leaveType: bal.leaveType, year: bal.year },
      });
    }
  }

  return issues;
}

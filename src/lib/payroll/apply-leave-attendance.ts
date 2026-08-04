/**
 * Apply approved leave + accumulated OT into employee pending payroll fields.
 * Called when starting / syncing a pay run — not from Resend or UI directly.
 */

import { unpaidLeaveHoursDeduction, roundHours } from "@/lib/labor-rules";
import type { LeaveRequestRecord } from "@/lib/leave/leave";
import { leaveOverlapsPeriod } from "@/lib/leave/leave";
import { sumUnappliedOvertime } from "@/lib/attendance/attendance";

export type PayrollHourSeed = {
  employeeId: string;
  standardHours: number;
  pendingRegularHours: number | null;
  pendingOvertimeHours: number | null;
  pendingHolidayHours: number | null;
};

export type AppliedPayrollHours = {
  employeeId: string;
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
  unpaidLeaveDaysApplied: number;
  overtimeFromAttendance: number;
};

/**
 * Pure merge: attendance OT + unpaid leave deductions into starting pay-run hours.
 */
export function mergeAttendanceAndLeaveIntoHours(opts: {
  seed: PayrollHourSeed;
  approvedLeave: LeaveRequestRecord[];
  overtimeRows: Array<{ employeeId: string; overtimeHours: number; appliedToPayroll?: boolean; workDate: string }>;
  periodStart: string;
  periodEnd: string;
}): AppliedPayrollHours {
  const { seed } = opts;
  const leaveForEmp = opts.approvedLeave.filter(
    (l) =>
      l.employeeId === seed.employeeId &&
      l.status === "approved" &&
      !l.payrollApplied &&
      leaveOverlapsPeriod(l.startDate, l.endDate, opts.periodStart, opts.periodEnd),
  );

  const unpaidDays = leaveForEmp
    .filter((l) => l.isUnpaid || l.leaveType === "unpaid")
    .reduce((s, l) => s + Number(l.days), 0);

  const baseRegular = seed.pendingRegularHours ?? seed.standardHours;
  const deduction = unpaidLeaveHoursDeduction(unpaidDays);
  const regularHours = roundHours(Math.max(0, baseRegular - deduction));

  const otFromAttendance = sumUnappliedOvertime(
    opts.overtimeRows
      .filter((r) => r.employeeId === seed.employeeId)
      .map((r) => ({
        overtimeHours: r.overtimeHours,
        appliedToPayroll: r.appliedToPayroll,
        workDate: r.workDate,
      })),
    opts.periodStart,
    opts.periodEnd,
  );

  const pendingOt = seed.pendingOvertimeHours ?? 0;
  // Prefer attendance-derived OT when present; still allow manual pending OT on top if no attendance OT
  const overtimeHours = roundHours(otFromAttendance > 0 ? otFromAttendance : pendingOt);

  return {
    employeeId: seed.employeeId,
    regularHours,
    overtimeHours,
    holidayHours: seed.pendingHolidayHours ?? 0,
    unpaidLeaveDaysApplied: unpaidDays,
    overtimeFromAttendance: otFromAttendance,
  };
}

/** Inclusive calendar month bounds from a period label like "August 2026" or ISO month start. */
export function periodBoundsFromPayDate(payDate: string): { start: string; end: string } {
  const d = new Date(`${payDate}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) {
    return { start: payDate, end: payDate };
  }
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

/**
 * Attendance ↔ leave reconciliation helpers.
 */

import { leaveOverlapsPeriod, type LeaveRequestRecord } from "@/lib/leave/leave";

export function isDateOnApprovedLeave(
  workDate: string,
  approvedLeave: Array<Pick<LeaveRequestRecord, "startDate" | "endDate" | "status" | "employeeId">>,
  employeeId: string,
): boolean {
  return approvedLeave.some(
    (l) =>
      l.employeeId === employeeId &&
      l.status === "approved" &&
      leaveOverlapsPeriod(l.startDate, l.endDate, workDate, workDate),
  );
}

export function shouldFlagMissingClockOut(opts: {
  workDate: string;
  employeeId: string;
  status: string;
  approvedLeave: Array<Pick<LeaveRequestRecord, "startDate" | "endDate" | "status" | "employeeId">>;
}): boolean {
  if (opts.status !== "open" && opts.status !== "missing_clock_out") return false;
  if (isDateOnApprovedLeave(opts.workDate, opts.approvedLeave, opts.employeeId)) return false;
  return opts.status === "open";
}

export function reminderKey(companyId: string, employeeId: string, workDate: string): string {
  return `${companyId}|${employeeId}|${workDate}|missing_clockout`;
}

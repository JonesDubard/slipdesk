/**
 * Attendance + overtime domain helpers.
 */

import {
  LABOR_RULES,
  hoursBetween,
  roundHours,
  splitDailyHours,
} from "@/lib/labor-rules";

export type AttendanceSource = "clock" | "manual" | "correction";
export type AttendanceStatus = "open" | "complete" | "corrected" | "missing_clock_out";

export type AttendanceRecord = {
  id: string;
  companyId: string;
  employeeId: string;
  workDate: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  hoursWorked: number;
  source: AttendanceSource;
  status: AttendanceStatus;
  notes: string | null;
  correctedBy: string | null;
  payPeriodLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OvertimeRecord = {
  id: string;
  companyId: string;
  employeeId: string;
  attendanceId: string | null;
  workDate: string;
  regularHours: number;
  overtimeHours: number;
  dailyThreshold: number;
  otMultiplier: number;
  payPeriodLabel: string | null;
  appliedToPayroll: boolean;
};

export function mapAttendanceRow(row: Record<string, unknown>): AttendanceRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    employeeId: String(row.employee_id),
    workDate: String(row.work_date).slice(0, 10),
    clockInAt: (row.clock_in_at as string) ?? null,
    clockOutAt: (row.clock_out_at as string) ?? null,
    hoursWorked: Number(row.hours_worked ?? 0),
    source: row.source as AttendanceSource,
    status: row.status as AttendanceStatus,
    notes: (row.notes as string) ?? null,
    correctedBy: (row.corrected_by as string) ?? null,
    payPeriodLabel: (row.pay_period_label as string) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function computeAttendanceHours(opts: {
  clockInAt?: string | null;
  clockOutAt?: string | null;
  manualHours?: number | null;
}): { hoursWorked: number; status: AttendanceStatus } {
  if (opts.manualHours != null && Number.isFinite(opts.manualHours)) {
    return { hoursWorked: roundHours(Math.max(0, opts.manualHours)), status: "complete" };
  }
  if (opts.clockInAt && !opts.clockOutAt) {
    return { hoursWorked: 0, status: "open" };
  }
  if (opts.clockInAt && opts.clockOutAt) {
    const h = hoursBetween(opts.clockInAt, opts.clockOutAt);
    return { hoursWorked: h, status: "complete" };
  }
  return { hoursWorked: 0, status: "open" };
}

export function buildOvertimeFromHours(
  hoursWorked: number,
  dailyThreshold = LABOR_RULES.STANDARD_DAILY_HOURS,
  otMultiplier = LABOR_RULES.OT_MULTIPLIER,
): {
  regularHours: number;
  overtimeHours: number;
  dailyThreshold: number;
  otMultiplier: number;
  warnMaxDay: boolean;
} {
  const split = splitDailyHours(hoursWorked, dailyThreshold);
  return {
    ...split,
    dailyThreshold,
    otMultiplier,
    warnMaxDay: hoursWorked > LABOR_RULES.MAX_DAILY_HOURS_WARNING,
  };
}

/**
 * Aggregate unapplied OT hours for an employee in an optional date window.
 */
export function sumUnappliedOvertime(
  rows: Array<{ overtimeHours: number; appliedToPayroll?: boolean; workDate: string }>,
  fromDate?: string,
  toDate?: string,
): number {
  return roundHours(
    rows
      .filter((r) => !r.appliedToPayroll)
      .filter((r) => !fromDate || r.workDate >= fromDate)
      .filter((r) => !toDate || r.workDate <= toDate)
      .reduce((s, r) => s + (Number(r.overtimeHours) || 0), 0),
  );
}

export function validateManualHours(hours: number): string | null {
  if (!Number.isFinite(hours) || hours < 0) return "Hours must be a non-negative number.";
  if (hours > 24) return "Hours cannot exceed 24 in a day.";
  return null;
}

/** Today as YYYY-MM-DD in local-ish UTC date (server). */
export function workDateToday(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

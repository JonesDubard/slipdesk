/**
 * Leave request domain — state machine + payroll handoff helpers.
 * Approvals never auto-apply from the employee side.
 */

export type LeaveType = "annual" | "sick" | "unpaid" | "compassionate" | "maternity" | "other";
export type LeaveStatus =
  | "pending"
  | "info_requested"
  | "approved"
  | "rejected"
  | "cancelled";

export type LeaveReviewAction = "approve" | "reject" | "request_info";

export type LeaveRequestRecord = {
  id: string;
  companyId: string;
  employeeId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  isUnpaid: boolean;
  status: LeaveStatus;
  hrNote: string | null;
  payPeriodLabel: string | null;
  payrollApplied: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  employeeName?: string | null;
  employeeNumber?: string | null;
};

const LEAVE_TYPES: LeaveType[] = ["annual", "sick", "unpaid", "compassionate", "maternity", "other"];

export function isLeaveType(v: unknown): v is LeaveType {
  return typeof v === "string" && LEAVE_TYPES.includes(v as LeaveType);
}

export function countLeaveDays(startDate: string, endDate: string): number {
  const s = new Date(`${startDate}T00:00:00Z`);
  const e = new Date(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime()) || e < s) return 0;
  const ms = e.getTime() - s.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
}

export function validateLeaveSubmit(input: {
  leaveType: unknown;
  startDate: string;
  endDate: string;
  reason?: string;
  isUnpaid?: boolean;
}): { ok: true; leaveType: LeaveType; days: number; isUnpaid: boolean } | { ok: false; error: string } {
  if (!isLeaveType(input.leaveType)) return { ok: false, error: "Invalid leave type." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
    return { ok: false, error: "Dates must be YYYY-MM-DD." };
  }
  const days = countLeaveDays(input.startDate, input.endDate);
  if (days <= 0) return { ok: false, error: "End date must be on or after start date." };
  if (days > 90) return { ok: false, error: "Leave requests over 90 days require HR to split periods." };
  const isUnpaid = input.leaveType === "unpaid" ? true : Boolean(input.isUnpaid);
  return { ok: true, leaveType: input.leaveType, days, isUnpaid };
}

/**
 * Leave status transitions.
 * pending → approved | rejected | info_requested | cancelled
 * info_requested → pending (employee replied) | approved | rejected | cancelled
 * terminal: approved | rejected | cancelled
 */
export function canTransitionLeave(
  from: LeaveStatus,
  action: LeaveReviewAction | "cancel" | "resubmit",
): boolean {
  if (from === "approved" || from === "rejected" || from === "cancelled") return false;
  if (action === "cancel") return from === "pending" || from === "info_requested";
  if (action === "resubmit") return from === "info_requested";
  if (from === "pending" || from === "info_requested") {
    return action === "approve" || action === "reject" || action === "request_info";
  }
  return false;
}

export function nextLeaveStatus(
  action: LeaveReviewAction | "cancel" | "resubmit",
): LeaveStatus {
  switch (action) {
    case "approve":
      return "approved";
    case "reject":
      return "rejected";
    case "request_info":
      return "info_requested";
    case "cancel":
      return "cancelled";
    case "resubmit":
      return "pending";
  }
}

export function mapLeaveRow(row: Record<string, unknown>): LeaveRequestRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    employeeId: String(row.employee_id),
    leaveType: row.leave_type as LeaveType,
    startDate: String(row.start_date).slice(0, 10),
    endDate: String(row.end_date).slice(0, 10),
    days: Number(row.days),
    reason: (row.reason as string) ?? null,
    isUnpaid: Boolean(row.is_unpaid),
    status: row.status as LeaveStatus,
    hrNote: (row.hr_note as string) ?? null,
    payPeriodLabel: (row.pay_period_label as string) ?? null,
    payrollApplied: Boolean(row.payroll_applied),
    reviewedBy: (row.reviewed_by as string) ?? null,
    reviewedAt: (row.reviewed_at as string) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    employeeName: (row.employees as { full_name?: string } | undefined)?.full_name
      ?? (row.employee_name as string) ?? null,
    employeeNumber: (row.employees as { employee_number?: string } | undefined)?.employee_number
      ?? (row.employee_number as string) ?? null,
  };
}

/** Period label overlap helper — leave falls in payroll month if dates intersect month window. */
export function leaveOverlapsPeriod(
  startDate: string,
  endDate: string,
  periodStart: string,
  periodEnd: string,
): boolean {
  return startDate <= periodEnd && endDate >= periodStart;
}

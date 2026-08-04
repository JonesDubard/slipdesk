/**
 * Leave / attendance notification emitters.
 * Always best-effort: never throw to callers — workflows must succeed if email fails.
 */

import { sendTemplatedEmail, isValidEmail, appUrl } from "./service";
import type { TemplateKey, NotificationEventType, SendResult } from "./types";
import type { Branding } from "./templates";

type LeaveNotifyOpts = {
  companyId: string;
  employeeId: string;
  employeeName: string;
  /** Destination email (employee or HR/company). */
  recipient: string;
  companyName: string;
  leaveType: string;
  leaveDates: string;
  leaveDays?: string;
  hrNote?: string;
  workflowRef?: string;
  branding?: Branding;
};

async function safeSend(
  eventType: NotificationEventType,
  templateKey: TemplateKey,
  opts: LeaveNotifyOpts & { ctaPath: string; ctaLabel: string },
): Promise<SendResult & { logId: string | null }> {
  if (!isValidEmail(opts.recipient)) {
    return { ok: false, status: "skipped", skippedReason: "No valid recipient", logId: null };
  }
  try {
    return await sendTemplatedEmail({
      employeeId: opts.employeeId,
      companyId: opts.companyId,
      recipient: opts.recipient,
      templateKey,
      eventType,
      vars: {
        employeeName: opts.employeeName,
        companyName: opts.companyName,
        leaveType: opts.leaveType,
        leaveDates: opts.leaveDates,
        leaveDays: opts.leaveDays,
        hrNote: opts.hrNote,
        ctaUrl: `${appUrl()}${opts.ctaPath}`,
        ctaLabel: opts.ctaLabel,
        branding: opts.branding,
      },
      meta: { workflowRef: opts.workflowRef, leaveType: opts.leaveType },
    });
  } catch (err) {
    console.warn("[leave-notify]", err);
    return {
      ok: false,
      status: "failed",
      errorReason: err instanceof Error ? err.message : "notify failed",
      logId: null,
    };
  }
}

/** Notify HR/company that a leave request was submitted. */
export async function notifyLeaveSubmitted(opts: LeaveNotifyOpts) {
  return safeSend("leave_submitted", "leave_submitted", {
    ...opts,
    ctaPath: "/hr/leave",
    ctaLabel: "Review leave",
  });
}

export async function notifyLeaveApproved(opts: LeaveNotifyOpts) {
  return safeSend("leave_approved", "leave_approved", {
    ...opts,
    ctaPath: "/portal/leave",
    ctaLabel: "View leave",
  });
}

export async function notifyLeaveRejected(opts: LeaveNotifyOpts) {
  return safeSend("leave_rejected", "leave_rejected", {
    ...opts,
    ctaPath: "/portal/leave",
    ctaLabel: "View leave",
  });
}

export async function notifyLeaveInfoRequested(opts: LeaveNotifyOpts) {
  return safeSend("leave_info_requested", "leave_info_requested", {
    ...opts,
    ctaPath: "/portal/leave",
    ctaLabel: "Update request",
  });
}

export async function notifyAttendanceMissingClockout(opts: {
  companyId: string;
  employeeId: string;
  employeeName: string;
  recipient: string;
  companyName: string;
  workDate: string;
  branding?: Branding;
}): Promise<SendResult & { logId: string | null }> {
  if (!isValidEmail(opts.recipient)) {
    return { ok: false, status: "skipped", skippedReason: "No valid recipient", logId: null };
  }
  try {
    return await sendTemplatedEmail({
      employeeId: opts.employeeId,
      companyId: opts.companyId,
      recipient: opts.recipient,
      templateKey: "attendance_missing_clockout",
      eventType: "attendance_missing_clockout",
      vars: {
        employeeName: opts.employeeName,
        companyName: opts.companyName,
        workDate: opts.workDate,
        ctaUrl: `${appUrl()}/portal/attendance`,
        ctaLabel: "Complete attendance",
        branding: opts.branding,
      },
      meta: { workDate: opts.workDate },
    });
  } catch (err) {
    console.warn("[attendance-notify]", err);
    return { ok: false, status: "failed", errorReason: "notify failed", logId: null };
  }
}

export async function notifyAttendanceCorrected(opts: {
  companyId: string;
  employeeId: string;
  employeeName: string;
  recipient: string;
  companyName: string;
  workDate: string;
  hoursWorked: string;
  branding?: Branding;
}): Promise<SendResult & { logId: string | null }> {
  if (!isValidEmail(opts.recipient)) {
    return { ok: false, status: "skipped", skippedReason: "No valid recipient", logId: null };
  }
  try {
    return await sendTemplatedEmail({
      employeeId: opts.employeeId,
      companyId: opts.companyId,
      recipient: opts.recipient,
      templateKey: "attendance_corrected",
      eventType: "attendance_corrected",
      vars: {
        employeeName: opts.employeeName,
        companyName: opts.companyName,
        workDate: opts.workDate,
        hoursWorked: opts.hoursWorked,
        ctaUrl: `${appUrl()}/portal/attendance`,
        ctaLabel: "View attendance",
        branding: opts.branding,
      },
      meta: { workDate: opts.workDate },
    });
  } catch (err) {
    console.warn("[attendance-notify]", err);
    return { ok: false, status: "failed", errorReason: "notify failed", logId: null };
  }
}

export async function notifyAttendanceAutoMissingClockout(opts: {
  companyId: string;
  employeeId: string;
  employeeName: string;
  recipient: string;
  companyName: string;
  workDate: string;
  branding?: Branding;
}): Promise<SendResult & { logId: string | null }> {
  if (!isValidEmail(opts.recipient)) {
    return { ok: false, status: "skipped", skippedReason: "No valid recipient", logId: null };
  }
  try {
    return await sendTemplatedEmail({
      employeeId: opts.employeeId,
      companyId: opts.companyId,
      recipient: opts.recipient,
      templateKey: "attendance_auto_missing_clockout",
      eventType: "attendance_auto_missing_clockout",
      vars: {
        employeeName: opts.employeeName,
        companyName: opts.companyName,
        workDate: opts.workDate,
        ctaUrl: `${appUrl()}/portal/attendance`,
        ctaLabel: "Complete attendance",
        branding: opts.branding,
      },
      meta: { workDate: opts.workDate, source: "scheduler" },
    });
  } catch (err) {
    console.warn("[attendance-notify]", err);
    return { ok: false, status: "failed", errorReason: "notify failed", logId: null };
  }
}

export async function notifyLeaveBalanceLow(opts: {
  companyId: string;
  employeeId: string;
  employeeName: string;
  recipient: string;
  companyName: string;
  leaveType: string;
  remaining: string;
  branding?: Branding;
}) {
  if (!isValidEmail(opts.recipient)) {
    return { ok: false, status: "skipped" as const, skippedReason: "No valid recipient", logId: null };
  }
  try {
    return await sendTemplatedEmail({
      employeeId: opts.employeeId,
      companyId: opts.companyId,
      recipient: opts.recipient,
      templateKey: "leave_balance_low",
      eventType: "leave_balance_low",
      vars: {
        employeeName: opts.employeeName,
        companyName: opts.companyName,
        leaveType: opts.leaveType,
        remaining: opts.remaining,
        ctaUrl: `${appUrl()}/portal/leave`,
        ctaLabel: "View leave",
        branding: opts.branding,
      },
    });
  } catch (err) {
    console.warn("[leave-balance-notify]", err);
    return { ok: false, status: "failed" as const, errorReason: "notify failed", logId: null };
  }
}

export async function notifyLeaveBalanceExhausted(opts: {
  companyId: string;
  employeeId: string;
  employeeName: string;
  recipient: string;
  companyName: string;
  leaveType: string;
  remaining: string;
  branding?: Branding;
}) {
  if (!isValidEmail(opts.recipient)) {
    return { ok: false, status: "skipped" as const, skippedReason: "No valid recipient", logId: null };
  }
  try {
    return await sendTemplatedEmail({
      employeeId: opts.employeeId,
      companyId: opts.companyId,
      recipient: opts.recipient,
      templateKey: "leave_balance_exhausted",
      eventType: "leave_balance_exhausted",
      vars: {
        employeeName: opts.employeeName,
        companyName: opts.companyName,
        leaveType: opts.leaveType,
        remaining: opts.remaining,
        ctaUrl: `${appUrl()}/portal/leave`,
        ctaLabel: "View leave",
        branding: opts.branding,
      },
    });
  } catch (err) {
    console.warn("[leave-balance-notify]", err);
    return { ok: false, status: "failed" as const, errorReason: "notify failed", logId: null };
  }
}

export async function notifyPayrollValidationWarning(opts: {
  companyId: string;
  employeeId: string;
  recipient: string;
  companyName: string;
  validationSummary: string;
  branding?: Branding;
}) {
  if (!isValidEmail(opts.recipient)) {
    return { ok: false, status: "skipped" as const, skippedReason: "No valid recipient", logId: null };
  }
  try {
    return await sendTemplatedEmail({
      employeeId: opts.employeeId,
      companyId: opts.companyId,
      recipient: opts.recipient,
      templateKey: "payroll_validation_warning",
      eventType: "payroll_validation_warning",
      vars: {
        employeeName: "Payroll reviewer",
        companyName: opts.companyName,
        validationSummary: opts.validationSummary,
        ctaUrl: `${appUrl()}/payroll`,
        ctaLabel: "Open payroll",
        branding: opts.branding,
      },
    });
  } catch (err) {
    console.warn("[payroll-validate-notify]", err);
    return { ok: false, status: "failed" as const, errorReason: "notify failed", logId: null };
  }
}

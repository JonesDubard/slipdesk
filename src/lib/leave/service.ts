/**
 * Leave request persistence + review (service-role). Notifications are fire-and-forget.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  canTransitionLeave,
  mapLeaveRow,
  nextLeaveStatus,
  validateLeaveSubmit,
  type LeaveRequestRecord,
  type LeaveReviewAction,
} from "@/lib/leave/leave";
import {
  finalizeLeaveBalanceOnApprove,
  releaseLeaveBalance,
  reserveLeaveBalance,
} from "@/lib/leave/balance-service";
import { unpaidLeaveHoursDeduction } from "@/lib/labor-rules";
import {
  notifyLeaveApproved,
  notifyLeaveInfoRequested,
  notifyLeaveRejected,
  notifyLeaveSubmitted,
} from "@/lib/notifications/leave-attendance-notify";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

async function logEvent(
  db: AnyClient,
  opts: {
    companyId: string;
    leaveRequestId: string;
    actorId?: string | null;
    action: string;
    note?: string | null;
  },
) {
  await db.from("leave_approval_events").insert({
    company_id: opts.companyId,
    leave_request_id: opts.leaveRequestId,
    actor_id: opts.actorId ?? null,
    action: opts.action,
    note: opts.note ?? null,
  });
}

async function companyBranding(db: AnyClient, companyId: string) {
  const { data } = await db
    .from("companies")
    .select("name, email, logo_url, brand_primary_color, brand_secondary_color, email_footer")
    .eq("id", companyId)
    .maybeSingle();
  return data;
}

export async function submitLeaveRequest(opts: {
  employeeId: string;
  companyId: string;
  actorUserId: string;
  leaveType: unknown;
  startDate: string;
  endDate: string;
  reason?: string;
  isUnpaid?: boolean;
  payPeriodLabel?: string;
}): Promise<{ ok: true; request: LeaveRequestRecord } | { ok: false; error: string; status: number }> {
  const validated = validateLeaveSubmit(opts);
  if (!validated.ok) return { ok: false, error: validated.error, status: 400 };

  const admin = createAdminClient() as AnyClient;
  const { data, error } = await admin
    .from("leave_requests")
    .insert({
      company_id: opts.companyId,
      employee_id: opts.employeeId,
      leave_type: validated.leaveType,
      start_date: opts.startDate,
      end_date: opts.endDate,
      days: validated.days,
      reason: opts.reason?.trim() || null,
      is_unpaid: validated.isUnpaid,
      status: "pending",
      pay_period_label: opts.payPeriodLabel ?? null,
    })
    .select("*")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Could not create leave request.", status: 400 };

  const reserved = await reserveLeaveBalance({
    companyId: opts.companyId,
    employeeId: opts.employeeId,
    leaveType: validated.leaveType,
    days: validated.days,
    leaveRequestId: data.id,
    actorId: opts.actorUserId,
  });
  if (!reserved.ok) {
    await admin.from("leave_requests").delete().eq("id", data.id);
    return { ok: false, error: reserved.error, status: 400 };
  }

  await logEvent(admin, {
    companyId: opts.companyId,
    leaveRequestId: data.id,
    actorId: opts.actorUserId,
    action: "submitted",
    note: opts.reason,
  });

  const company = await companyBranding(admin, opts.companyId);
  const { data: emp } = await admin
    .from("employees")
    .select("full_name, email")
    .eq("id", opts.employeeId)
    .maybeSingle();

  // HR notification — never blocks success
  void notifyLeaveSubmitted({
    companyId: opts.companyId,
    employeeId: opts.employeeId,
    employeeName: emp?.full_name ?? "Employee",
    recipient: company?.email ?? "",
    companyName: company?.name ?? "your company",
    leaveType: validated.leaveType,
    leaveDates: `${opts.startDate} → ${opts.endDate}`,
    leaveDays: String(validated.days),
    workflowRef: data.id,
    branding: {
      companyName: company?.name ?? "Slipdesk",
      logoUrl: company?.logo_url,
      primaryColor: company?.brand_primary_color,
      secondaryColor: company?.brand_secondary_color,
      footer: company?.email_footer,
    },
  });

  return { ok: true, request: mapLeaveRow(data) };
}

export async function listEmployeeLeave(employeeId: string): Promise<LeaveRequestRecord[]> {
  const admin = createAdminClient() as AnyClient;
  const { data } = await admin
    .from("leave_requests")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((r: Record<string, unknown>) => mapLeaveRow(r));
}

export async function listCompanyLeave(
  companyId: string,
  status?: string,
): Promise<LeaveRequestRecord[]> {
  const admin = createAdminClient() as AnyClient;
  let q = admin
    .from("leave_requests")
    .select("*, employees(full_name, employee_number)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && status !== "all") q = q.eq("status", status);
  const { data } = await q;
  return (data ?? []).map((r: Record<string, unknown>) => mapLeaveRow(r));
}

export async function reviewLeaveRequest(opts: {
  companyId: string;
  leaveRequestId: string;
  actorUserId: string;
  action: LeaveReviewAction;
  note?: string;
}): Promise<{ ok: true; request: LeaveRequestRecord } | { ok: false; error: string; status: number }> {
  const admin = createAdminClient() as AnyClient;
  const { data: row } = await admin
    .from("leave_requests")
    .select("*")
    .eq("id", opts.leaveRequestId)
    .eq("company_id", opts.companyId)
    .maybeSingle();

  if (!row) return { ok: false, error: "Leave request not found.", status: 404 };
  if (!canTransitionLeave(row.status, opts.action)) {
    return { ok: false, error: `Cannot ${opts.action} a request in status ${row.status}.`, status: 409 };
  }

  const next = nextLeaveStatus(opts.action);
  const note = opts.note?.trim() || null;

  const { data: updated, error } = await admin
    .from("leave_requests")
    .update({
      status: next,
      hr_note: note,
      reviewed_by: opts.actorUserId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.leaveRequestId)
    .select("*")
    .single();

  if (error || !updated) return { ok: false, error: error?.message ?? "Update failed.", status: 400 };

  await logEvent(admin, {
    companyId: opts.companyId,
    leaveRequestId: opts.leaveRequestId,
    actorId: opts.actorUserId,
    action: opts.action === "request_info" ? "info_requested" : opts.action === "approve" ? "approved" : "rejected",
    note,
  });

  if (next === "approved") {
    await finalizeLeaveBalanceOnApprove({
      companyId: opts.companyId,
      employeeId: updated.employee_id,
      leaveType: updated.leave_type,
      days: Number(updated.days),
      leaveRequestId: updated.id,
      actorId: opts.actorUserId,
    });
  } else if (next === "rejected") {
    await releaseLeaveBalance({
      companyId: opts.companyId,
      employeeId: updated.employee_id,
      leaveType: updated.leave_type,
      days: Number(updated.days),
      leaveRequestId: updated.id,
      actorId: opts.actorUserId,
      reason: "leave_rejected",
    });
  }

  // Apply unpaid leave to pending regular hours immediately on approve
  if (next === "approved" && (updated.is_unpaid || updated.leave_type === "unpaid")) {
    const { data: emp } = await admin
      .from("employees")
      .select("id, standard_hours, pending_regular_hours")
      .eq("id", updated.employee_id)
      .maybeSingle();
    if (emp) {
      const base = emp.pending_regular_hours ?? emp.standard_hours ?? 173.33;
      const nextHours = Math.max(0, Number(base) - unpaidLeaveHoursDeduction(Number(updated.days)));
      await admin
        .from("employees")
        .update({ pending_regular_hours: nextHours })
        .eq("id", emp.id);
      await admin
        .from("leave_requests")
        .update({ payroll_applied: true, updated_at: new Date().toISOString() })
        .eq("id", updated.id);
    }
  }

  const company = await companyBranding(admin, opts.companyId);
  const { data: emp } = await admin
    .from("employees")
    .select("full_name, email")
    .eq("id", updated.employee_id)
    .maybeSingle();

  const common = {
    companyId: opts.companyId,
    employeeId: updated.employee_id as string,
    employeeName: emp?.full_name ?? "Employee",
    recipient: emp?.email ?? "",
    companyName: company?.name ?? "your company",
    leaveType: String(updated.leave_type),
    leaveDates: `${String(updated.start_date).slice(0, 10)} → ${String(updated.end_date).slice(0, 10)}`,
    leaveDays: String(updated.days),
    hrNote: note ?? undefined,
    workflowRef: updated.id as string,
    branding: {
      companyName: company?.name ?? "Slipdesk",
      logoUrl: company?.logo_url,
      primaryColor: company?.brand_primary_color,
      secondaryColor: company?.brand_secondary_color,
      footer: company?.email_footer,
    },
  };

  if (next === "approved") void notifyLeaveApproved(common);
  else if (next === "rejected") void notifyLeaveRejected(common);
  else if (next === "info_requested") void notifyLeaveInfoRequested(common);

  return { ok: true, request: mapLeaveRow(updated) };
}

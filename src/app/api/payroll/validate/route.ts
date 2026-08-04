import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, normalizeRole, type Role } from "@/lib/rbac";
import { validatePayrollPeriod } from "@/lib/payroll/validate-period";
import { mapLeaveRow } from "@/lib/leave/leave";
import { getAttendanceConfig } from "@/lib/attendance/config-service";
import { periodBoundsFromPayDate } from "@/lib/payroll/apply-leave-attendance";
import { logAuditServer } from "@/lib/audit-server";
import { notifyPayrollValidationWarning } from "@/lib/notifications/leave-attendance-notify";

async function resolveHr(userId: string) {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const { data: owned } = await db
    .from("companies")
    .select("id, email, name")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (owned?.id) {
    return {
      companyId: owned.id as string,
      role: "company_owner" as Role,
      admin,
      companyEmail: owned.email as string | null,
      companyName: owned.name as string,
    };
  }
  const { data: member } = await db
    .from("company_members")
    .select("company_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (member?.company_id) {
    const { data: company } = await db
      .from("companies")
      .select("email, name")
      .eq("id", member.company_id)
      .maybeSingle();
    return {
      companyId: member.company_id as string,
      role: normalizeRole(member.role),
      admin,
      companyEmail: (company?.email as string) ?? null,
      companyName: (company?.name as string) ?? "your company",
    };
  }
  return null;
}

/**
 * POST { payDate?: string, periodStart?: string, periodEnd?: string, periodLabel?: string }
 * Returns validation issues; persists logs; emits notification event (not blocking).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hr = await resolveHr(user.id);
  if (!hr || !can(hr.role, "payroll:view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  let periodStart = String(body.periodStart ?? "");
  let periodEnd = String(body.periodEnd ?? "");
  if (!periodStart || !periodEnd) {
    const bounds = periodBoundsFromPayDate(String(body.payDate ?? new Date().toISOString().slice(0, 10)));
    periodStart = bounds.start;
    periodEnd = bounds.end;
  }
  const periodLabel = String(body.periodLabel ?? `${periodStart}–${periodEnd}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = hr.admin as any;
  const cfg = await getAttendanceConfig(hr.companyId);

  const { data: attendance } = await db
    .from("attendance_records")
    .select("id, employee_id, work_date, status, hours_worked")
    .eq("company_id", hr.companyId)
    .gte("work_date", periodStart)
    .lte("work_date", periodEnd);

  const { data: leaveRows } = await db
    .from("leave_requests")
    .select("*")
    .eq("company_id", hr.companyId);

  const { data: balances } = await db
    .from("leave_balances")
    .select("*")
    .eq("company_id", hr.companyId)
    .eq("year", new Date(periodStart).getUTCFullYear());

  const issues = validatePayrollPeriod({
    periodStart,
    periodEnd,
    maxShiftHours: cfg.maxShiftHours,
    attendance: ((attendance ?? []) as { id: string; employee_id: string; work_date: string; status: string; hours_worked: number }[]).map(
      (a) => ({
        id: a.id,
        employeeId: a.employee_id,
        workDate: String(a.work_date).slice(0, 10),
        status: a.status,
        hoursWorked: Number(a.hours_worked),
      }),
    ),
    leaveRequests: (leaveRows ?? []).map((r: Record<string, unknown>) => mapLeaveRow(r)),
    balances: ((balances ?? []) as {
      employee_id: string;
      company_id: string;
      leave_type: string;
      year: number;
      allocated: number;
      used: number;
      pending: number;
      remaining: number;
    }[]).map((b) => ({
      employeeId: b.employee_id,
      companyId: b.company_id,
      leaveType: b.leave_type as import("@/lib/leave/leave").LeaveType,
      year: b.year,
      allocated: Number(b.allocated),
      used: Number(b.used),
      pending: Number(b.pending),
      remaining: Number(b.remaining),
    })),
  });

  for (const issue of issues) {
    await db.from("payroll_validation_logs").insert({
      company_id: hr.companyId,
      period_label: periodLabel,
      period_start: periodStart,
      period_end: periodEnd,
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      employee_id: issue.employeeId ?? null,
      meta: issue.meta ?? {},
      actor_id: user.id,
    });
  }

  await logAuditServer(hr.admin, {
    companyId: hr.companyId,
    action: "payroll.validation",
    entityType: "pay_run",
    entityId: periodLabel,
    actorId: user.id,
    newValue: {
      issueCount: issues.length,
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
    },
  });

  if (issues.length && hr.companyEmail) {
    const summary = `${issues.length} issue(s): ${issues
      .slice(0, 5)
      .map((i) => i.code)
      .join(", ")}${issues.length > 5 ? "…" : ""}`;
    void notifyPayrollValidationWarning({
      companyId: hr.companyId,
      employeeId: issues[0]?.employeeId ?? user.id,
      recipient: hr.companyEmail,
      companyName: hr.companyName,
      validationSummary: summary,
    });
  }

  return NextResponse.json({
    ok: true,
    periodStart,
    periodEnd,
    issues,
    errorCount: issues.filter((i) => i.severity === "error").length,
    warningCount: issues.filter((i) => i.severity === "warning").length,
  });
}

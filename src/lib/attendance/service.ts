/**
 * Attendance + overtime persistence. Notifications are best-effort only.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { LABOR_RULES } from "@/lib/labor-rules";
import {
  computeAttendanceHours,
  mapAttendanceRow,
  validateManualHours,
  workDateToday,
  type AttendanceRecord,
} from "@/lib/attendance/attendance";
import { getAttendanceConfig } from "@/lib/attendance/config-service";
import { resolveOtMode } from "@/lib/attendance/config";
import { computeOvertimeForDays, isoWeekKey } from "@/lib/attendance/overtime";
import { reminderKey, shouldFlagMissingClockOut } from "@/lib/attendance/reconcile";
import { mapLeaveRow } from "@/lib/leave/leave";
import {
  notifyAttendanceAutoMissingClockout,
  notifyAttendanceCorrected,
  notifyAttendanceMissingClockout,
} from "@/lib/notifications/leave-attendance-notify";
import { logAuditServer } from "@/lib/audit-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/**
 * Recompute OT for an employee using company daily/weekly mode (no double-count).
 */
async function recomputeEmployeeOvertime(
  db: AnyClient,
  opts: { companyId: string; employeeId: string; attendanceId: string; workDate: string; hoursWorked: number },
) {
  const cfg = await getAttendanceConfig(opts.companyId);
  const otMode = resolveOtMode(cfg);

  // Load recent attendance days (~8 weeks) for weekly calc
  const { data: attRows } = await db
    .from("attendance_records")
    .select("id, work_date, hours_worked, status")
    .eq("employee_id", opts.employeeId)
    .order("work_date", { ascending: false })
    .limit(60);

  const days = ((attRows ?? []) as { work_date: string; hours_worked: number; status: string }[])
    .filter((r) => r.status === "complete" || r.status === "corrected")
    .map((r) => ({
      workDate: String(r.work_date).slice(0, 10),
      hoursWorked: Number(r.hours_worked) || 0,
    }));

  // Ensure current day is included with latest hours
  const without = days.filter((d) => d.workDate !== opts.workDate);
  without.push({ workDate: opts.workDate, hoursWorked: opts.hoursWorked });

  const weeks = computeOvertimeForDays(without, {
    otMode,
    dailyThreshold: cfg.dailyHoursThreshold,
    weeklyThreshold: cfg.weeklyHoursThreshold,
  });

  const week = weeks.find((w) => w.days.some((d) => d.workDate === opts.workDate)) ?? weeks[0];
  const day = week?.days.find((d) => d.workDate === opts.workDate);

  await db.from("overtime_records").upsert(
    {
      company_id: opts.companyId,
      employee_id: opts.employeeId,
      attendance_id: opts.attendanceId,
      work_date: opts.workDate,
      regular_hours: day?.regularHours ?? Math.min(opts.hoursWorked, cfg.dailyHoursThreshold),
      overtime_hours: day?.attributedOtHours ?? 0,
      daily_ot_hours: day?.dailyOtHours ?? 0,
      weekly_ot_extra: week?.weeklyExtra ?? 0,
      iso_week: week?.isoWeek ?? isoWeekKey(opts.workDate),
      ot_mode: otMode,
      daily_threshold: cfg.dailyHoursThreshold,
      ot_multiplier: cfg.otMultiplier,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employee_id,work_date" },
  );

  if (week) {
    await db.from("weekly_overtime_records").upsert(
      {
        company_id: opts.companyId,
        employee_id: opts.employeeId,
        iso_week: week.isoWeek,
        week_start: week.weekStart,
        week_end: week.weekEnd,
        total_hours: week.totalHours,
        daily_ot_sum: week.dailyOtSum,
        weekly_ot_raw: week.weeklyOtRaw,
        payable_ot_hours: week.payableOtHours,
        weekly_threshold: cfg.weeklyHoursThreshold,
        ot_mode: otMode,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "employee_id,iso_week" },
    );
  }

  const { data: rows } = await db
    .from("overtime_records")
    .select("overtime_hours")
    .eq("employee_id", opts.employeeId)
    .eq("applied_to_payroll", false);
  const totalOt = (rows ?? []).reduce(
    (s: number, r: { overtime_hours: number }) => s + Number(r.overtime_hours || 0),
    0,
  );
  await db
    .from("employees")
    .update({ pending_overtime_hours: Math.round(totalOt * 100) / 100 })
    .eq("id", opts.employeeId);
}

async function upsertOvertime(
  db: AnyClient,
  opts: {
    companyId: string;
    employeeId: string;
    attendanceId: string;
    workDate: string;
    hoursWorked: number;
  },
) {
  return recomputeEmployeeOvertime(db, opts);
}

export async function clockIn(opts: {
  employeeId: string;
  companyId: string;
  workDate?: string;
}): Promise<{ ok: true; record: AttendanceRecord } | { ok: false; error: string; status: number }> {
  const admin = createAdminClient() as AnyClient;
  const workDate = opts.workDate ?? workDateToday();
  const { data: existing } = await admin
    .from("attendance_records")
    .select("*")
    .eq("employee_id", opts.employeeId)
    .eq("work_date", workDate)
    .maybeSingle();

  if (existing?.clock_in_at && !existing.clock_out_at) {
    return { ok: false, error: "Already clocked in for this day.", status: 409 };
  }
  if (existing?.status === "complete" || existing?.clock_out_at) {
    return { ok: false, error: "Attendance already completed for this day. Ask HR to correct it.", status: 409 };
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("attendance_records")
    .upsert(
      {
        company_id: opts.companyId,
        employee_id: opts.employeeId,
        work_date: workDate,
        clock_in_at: now,
        clock_out_at: null,
        hours_worked: 0,
        source: "clock",
        status: "open",
        updated_at: now,
      },
      { onConflict: "employee_id,work_date" },
    )
    .select("*")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Clock-in failed.", status: 400 };
  return { ok: true, record: mapAttendanceRow(data) };
}

export async function clockOut(opts: {
  employeeId: string;
  companyId: string;
  workDate?: string;
}): Promise<{ ok: true; record: AttendanceRecord } | { ok: false; error: string; status: number }> {
  const admin = createAdminClient() as AnyClient;
  const workDate = opts.workDate ?? workDateToday();
  const { data: existing } = await admin
    .from("attendance_records")
    .select("*")
    .eq("employee_id", opts.employeeId)
    .eq("work_date", workDate)
    .maybeSingle();

  if (!existing?.clock_in_at) {
    return { ok: false, error: "Clock in first.", status: 400 };
  }
  if (existing.clock_out_at) {
    return { ok: false, error: "Already clocked out.", status: 409 };
  }

  const now = new Date().toISOString();
  const computed = computeAttendanceHours({
    clockInAt: existing.clock_in_at,
    clockOutAt: now,
  });

  const { data, error } = await admin
    .from("attendance_records")
    .update({
      clock_out_at: now,
      hours_worked: computed.hoursWorked,
      status: "complete",
      updated_at: now,
    })
    .eq("id", existing.id)
    .select("*")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Clock-out failed.", status: 400 };

  await upsertOvertime(admin, {
    companyId: opts.companyId,
    employeeId: opts.employeeId,
    attendanceId: data.id,
    workDate,
    hoursWorked: computed.hoursWorked,
  });

  return { ok: true, record: mapAttendanceRow(data) };
}

export async function manualHoursEntry(opts: {
  employeeId: string;
  companyId: string;
  workDate: string;
  hours: number;
  notes?: string;
  actorUserId?: string;
  asCorrection?: boolean;
}): Promise<{ ok: true; record: AttendanceRecord } | { ok: false; error: string; status: number }> {
  const err = validateManualHours(opts.hours);
  if (err) return { ok: false, error: err, status: 400 };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.workDate)) {
    return { ok: false, error: "workDate must be YYYY-MM-DD.", status: 400 };
  }

  const admin = createAdminClient() as AnyClient;
  const computed = computeAttendanceHours({ manualHours: opts.hours });
  const source = opts.asCorrection ? "correction" : "manual";
  const status = opts.asCorrection ? "corrected" : "complete";

  const { data, error } = await admin
    .from("attendance_records")
    .upsert(
      {
        company_id: opts.companyId,
        employee_id: opts.employeeId,
        work_date: opts.workDate,
        hours_worked: computed.hoursWorked,
        source,
        status,
        notes: opts.notes?.trim() || null,
        corrected_by: opts.asCorrection ? opts.actorUserId ?? null : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "employee_id,work_date" },
    )
    .select("*")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Save failed.", status: 400 };

  await upsertOvertime(admin, {
    companyId: opts.companyId,
    employeeId: opts.employeeId,
    attendanceId: data.id,
    workDate: opts.workDate,
    hoursWorked: computed.hoursWorked,
  });

  if (opts.asCorrection) {
    const { data: emp } = await admin
      .from("employees")
      .select("full_name, email")
      .eq("id", opts.employeeId)
      .maybeSingle();
    const { data: company } = await admin
      .from("companies")
      .select("name, logo_url, brand_primary_color, brand_secondary_color, email_footer")
      .eq("id", opts.companyId)
      .maybeSingle();
    void notifyAttendanceCorrected({
      companyId: opts.companyId,
      employeeId: opts.employeeId,
      employeeName: emp?.full_name ?? "Employee",
      recipient: emp?.email ?? "",
      companyName: company?.name ?? "your company",
      workDate: opts.workDate,
      hoursWorked: String(computed.hoursWorked),
      branding: {
        companyName: company?.name ?? "Slipdesk",
        logoUrl: company?.logo_url,
        primaryColor: company?.brand_primary_color,
        secondaryColor: company?.brand_secondary_color,
        footer: company?.email_footer,
      },
    });
  }

  return { ok: true, record: mapAttendanceRow(data) };
}

export async function listEmployeeAttendance(employeeId: string, limit = 60): Promise<AttendanceRecord[]> {
  const admin = createAdminClient() as AnyClient;
  const { data } = await admin
    .from("attendance_records")
    .select("*")
    .eq("employee_id", employeeId)
    .order("work_date", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: Record<string, unknown>) => mapAttendanceRow(r));
}

export async function listCompanyAttendance(companyId: string, limit = 200) {
  const admin = createAdminClient() as AnyClient;
  const { data } = await admin
    .from("attendance_records")
    .select("*, employees(full_name, employee_number, email)")
    .eq("company_id", companyId)
    .order("work_date", { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** Mark stale open clock-ins as missing_clock_out; skip approved leave; dedupe reminders. */
export async function flagMissingClockOuts(
  companyId: string,
  opts?: { auto?: boolean },
): Promise<{ flagged: number; skippedLeave: number }> {
  const admin = createAdminClient() as AnyClient;
  const cfg = await getAttendanceConfig(companyId);
  const today = workDateToday();
  const { data: openRows } = await admin
    .from("attendance_records")
    .select("*, employees(full_name, email)")
    .eq("company_id", companyId)
    .in("status", ["open", "missing_clock_out"])
    .lt("work_date", today);

  const { data: leaveRows } = await admin
    .from("leave_requests")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "approved");
  const approvedLeave = (leaveRows ?? []).map((r: Record<string, unknown>) => mapLeaveRow(r));

  let flagged = 0;
  let skippedLeave = 0;
  const { data: company } = await admin
    .from("companies")
    .select("name, logo_url, brand_primary_color, brand_secondary_color, email_footer")
    .eq("id", companyId)
    .maybeSingle();

  for (const row of openRows ?? []) {
    const workDate = String(row.work_date).slice(0, 10);
    const employeeId = row.employee_id as string;
    if (
      !shouldFlagMissingClockOut({
        workDate,
        employeeId,
        status: row.status,
        approvedLeave,
      })
    ) {
      // On leave — close open rows quietly without reminder
      if (
        approvedLeave.some(
          (l: (typeof approvedLeave)[number]) =>
            l.employeeId === employeeId &&
            l.status === "approved" &&
            workDate >= l.startDate &&
            workDate <= l.endDate,
        )
      ) {
        if (row.status === "open") {
          await admin
            .from("attendance_records")
            .update({
              status: "complete",
              notes: (row.notes ? `${row.notes}; ` : "") + "Exempt — approved leave",
              hours_worked: 0,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
        }
        skippedLeave++;
      }
      continue;
    }

    await admin
      .from("attendance_records")
      .update({ status: "missing_clock_out", updated_at: new Date().toISOString() })
      .eq("id", row.id);

    const key = reminderKey(companyId, employeeId, workDate);
    const { data: existingReminder } = await admin
      .from("attendance_reminder_log")
      .select("id")
      .eq("reminder_key", key)
      .maybeSingle();
    if (existingReminder) continue;

    const { error: remErr } = await admin.from("attendance_reminder_log").insert({
      company_id: companyId,
      employee_id: employeeId,
      attendance_id: row.id,
      work_date: workDate,
      reminder_key: key,
    });
    if (remErr) continue; // unique race — skip duplicate

    const branding = {
      companyName: company?.name ?? "Slipdesk",
      logoUrl: company?.logo_url,
      primaryColor: company?.brand_primary_color,
      secondaryColor: company?.brand_secondary_color,
      footer: company?.email_footer,
    };
    const notifyFn = opts?.auto ? notifyAttendanceAutoMissingClockout : notifyAttendanceMissingClockout;
    void notifyFn({
      companyId,
      employeeId,
      employeeName: row.employees?.full_name ?? "Employee",
      recipient: row.employees?.email ?? "",
      companyName: company?.name ?? "your company",
      workDate,
      branding,
    });

    await logAuditServer(admin, {
      companyId,
      action: opts?.auto ? "attendance.scheduler_missing_clockout" : "attendance.flag_missing_clockout",
      entityType: "attendance_record",
      entityId: row.id,
      newValue: { workDate, employeeId, cutoffHour: cfg.missingClockoutCutoffHour },
    });
    flagged++;
  }

  return { flagged, skippedLeave };
}

export { LABOR_RULES };

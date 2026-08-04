/**
 * Attendance validation scheduler — domain logic only.
 * Cron route decides when to call; this never sends email except via Notification Service events.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAttendanceConfig, getAttendanceConfig } from "@/lib/attendance/config-service";
import { shouldRunSchedulerNow } from "@/lib/attendance/config";
import { flagMissingClockOuts } from "@/lib/attendance/service";
import { logAuditServer } from "@/lib/audit-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export async function runAttendanceValidationForCompany(
  companyId: string,
  now = new Date(),
): Promise<{
  ran: boolean;
  reason?: string;
  flagged: number;
  skippedLeave: number;
  localDate?: string;
  localHour?: number;
}> {
  await ensureAttendanceConfig(companyId);
  const cfg = await getAttendanceConfig(companyId);
  const gate = shouldRunSchedulerNow(cfg, now);
  if (!gate.run) {
    return {
      ran: false,
      reason: cfg.schedulerEnabled
        ? `Outside scheduler hour (local ${gate.localHour}, want ${cfg.schedulerHourLocal})`
        : "Scheduler disabled",
      flagged: 0,
      skippedLeave: 0,
      localDate: gate.localDate,
      localHour: gate.localHour,
    };
  }

  const admin = createAdminClient() as AnyClient;

  // Avoid duplicate runs same local date+hour
  const { data: prior } = await admin
    .from("attendance_scheduler_runs")
    .select("id")
    .eq("company_id", companyId)
    .eq("local_date", gate.localDate)
    .eq("local_hour", gate.localHour)
    .maybeSingle();
  if (prior) {
    return {
      ran: false,
      reason: "Already ran for this local hour",
      flagged: 0,
      skippedLeave: 0,
      localDate: gate.localDate,
      localHour: gate.localHour,
    };
  }

  const result = await flagMissingClockOuts(companyId, { auto: true });

  await admin.from("attendance_scheduler_runs").insert({
    company_id: companyId,
    local_date: gate.localDate,
    local_hour: gate.localHour,
    flagged_count: result.flagged,
    skipped_leave: result.skippedLeave,
    meta: { timezone: cfg.timezone },
  });

  await logAuditServer(admin, {
    companyId,
    action: "attendance.scheduler_run",
    entityType: "attendance_scheduler_runs",
    entityId: companyId,
    newValue: {
      localDate: gate.localDate,
      localHour: gate.localHour,
      flagged: result.flagged,
      skippedLeave: result.skippedLeave,
    },
  });

  return {
    ran: true,
    flagged: result.flagged,
    skippedLeave: result.skippedLeave,
    localDate: gate.localDate,
    localHour: gate.localHour,
  };
}

/** Cron entry: iterate all companies with config (or all companies). */
export async function runAttendanceValidationJob(now = new Date()) {
  const admin = createAdminClient() as AnyClient;
  const { data: companies } = await admin.from("companies").select("id").limit(500);
  const results = [];
  for (const c of companies ?? []) {
    results.push({
      companyId: c.id,
      ...(await runAttendanceValidationForCompany(c.id, now)),
    });
  }
  return results;
}

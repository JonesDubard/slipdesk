/**
 * Load / upsert company attendance config (service role).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  defaultAttendanceConfig,
  mapAttendanceConfigRow,
  type CompanyAttendanceConfig,
} from "@/lib/attendance/config";
import { logAuditServer } from "@/lib/audit-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export async function getAttendanceConfig(companyId: string): Promise<CompanyAttendanceConfig> {
  const admin = createAdminClient() as AnyClient;
  const { data } = await admin
    .from("company_attendance_config")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) return defaultAttendanceConfig(companyId);
  return mapAttendanceConfigRow(data);
}

export async function ensureAttendanceConfig(companyId: string): Promise<CompanyAttendanceConfig> {
  const existing = await getAttendanceConfig(companyId);
  const admin = createAdminClient() as AnyClient;
  const { data } = await admin
    .from("company_attendance_config")
    .select("company_id")
    .eq("company_id", companyId)
    .maybeSingle();
  if (data) return existing;

  const d = defaultAttendanceConfig(companyId);
  await admin.from("company_attendance_config").insert({
    company_id: companyId,
    timezone: d.timezone,
    daily_ot_enabled: d.dailyOtEnabled,
    weekly_ot_enabled: d.weeklyOtEnabled,
    daily_hours_threshold: d.dailyHoursThreshold,
    weekly_hours_threshold: d.weeklyHoursThreshold,
    ot_multiplier: d.otMultiplier,
    max_shift_hours: d.maxShiftHours,
    grace_period_minutes: d.gracePeriodMinutes,
    missing_clockout_cutoff_hour: d.missingClockoutCutoffHour,
    scheduler_enabled: d.schedulerEnabled,
    scheduler_hour_local: d.schedulerHourLocal,
    leave_approval_timeout_days: d.leaveApprovalTimeoutDays,
    low_balance_notify: d.lowBalanceNotify,
  });
  return d;
}

export async function updateAttendanceConfig(
  companyId: string,
  patch: Partial<CompanyAttendanceConfig>,
  actorId?: string,
): Promise<CompanyAttendanceConfig> {
  await ensureAttendanceConfig(companyId);
  const admin = createAdminClient() as AnyClient;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.timezone != null) row.timezone = patch.timezone;
  if (patch.dailyOtEnabled != null) row.daily_ot_enabled = patch.dailyOtEnabled;
  if (patch.weeklyOtEnabled != null) row.weekly_ot_enabled = patch.weeklyOtEnabled;
  if (patch.dailyHoursThreshold != null) row.daily_hours_threshold = patch.dailyHoursThreshold;
  if (patch.weeklyHoursThreshold != null) row.weekly_hours_threshold = patch.weeklyHoursThreshold;
  if (patch.otMultiplier != null) row.ot_multiplier = patch.otMultiplier;
  if (patch.maxShiftHours != null) row.max_shift_hours = patch.maxShiftHours;
  if (patch.gracePeriodMinutes != null) row.grace_period_minutes = patch.gracePeriodMinutes;
  if (patch.missingClockoutCutoffHour != null) {
    row.missing_clockout_cutoff_hour = patch.missingClockoutCutoffHour;
  }
  if (patch.schedulerEnabled != null) row.scheduler_enabled = patch.schedulerEnabled;
  if (patch.schedulerHourLocal != null) row.scheduler_hour_local = patch.schedulerHourLocal;
  if (patch.leaveApprovalTimeoutDays != null) {
    row.leave_approval_timeout_days = patch.leaveApprovalTimeoutDays;
  }
  if (patch.lowBalanceNotify != null) row.low_balance_notify = patch.lowBalanceNotify;

  await admin.from("company_attendance_config").update(row).eq("company_id", companyId);
  await logAuditServer(admin, {
    companyId,
    action: "attendance.config_update",
    entityType: "company_attendance_config",
    entityId: companyId,
    actorId: actorId ?? null,
    newValue: patch,
  });
  return getAttendanceConfig(companyId);
}

/**
 * Company attendance / OT configuration (v0.2.1).
 * Defaults mirror LABOR_RULES — companies override per row in company_attendance_config.
 */

import { LABOR_RULES } from "@/lib/labor-rules";

export type OtMode = "daily_only" | "weekly_only" | "both";

export type CompanyAttendanceConfig = {
  companyId: string;
  timezone: string;
  dailyOtEnabled: boolean;
  weeklyOtEnabled: boolean;
  dailyHoursThreshold: number;
  weeklyHoursThreshold: number;
  otMultiplier: number;
  maxShiftHours: number;
  gracePeriodMinutes: number;
  missingClockoutCutoffHour: number;
  schedulerEnabled: boolean;
  schedulerHourLocal: number;
  leaveApprovalTimeoutDays: number;
  lowBalanceNotify: boolean;
};

export function defaultAttendanceConfig(companyId: string): CompanyAttendanceConfig {
  return {
    companyId,
    timezone: "Africa/Monrovia",
    dailyOtEnabled: true,
    weeklyOtEnabled: false,
    dailyHoursThreshold: LABOR_RULES.STANDARD_DAILY_HOURS,
    weeklyHoursThreshold: LABOR_RULES.STANDARD_WEEKLY_HOURS,
    otMultiplier: LABOR_RULES.OT_MULTIPLIER,
    maxShiftHours: LABOR_RULES.MAX_DAILY_HOURS_WARNING,
    gracePeriodMinutes: 15,
    missingClockoutCutoffHour: 2,
    schedulerEnabled: true,
    schedulerHourLocal: 2,
    leaveApprovalTimeoutDays: 7,
    lowBalanceNotify: true,
  };
}

export function resolveOtMode(cfg: Pick<CompanyAttendanceConfig, "dailyOtEnabled" | "weeklyOtEnabled">): OtMode {
  if (cfg.dailyOtEnabled && cfg.weeklyOtEnabled) return "both";
  if (cfg.weeklyOtEnabled) return "weekly_only";
  return "daily_only";
}

export function mapAttendanceConfigRow(row: Record<string, unknown>): CompanyAttendanceConfig {
  return {
    companyId: String(row.company_id),
    timezone: String(row.timezone ?? "Africa/Monrovia"),
    dailyOtEnabled: row.daily_ot_enabled !== false,
    weeklyOtEnabled: Boolean(row.weekly_ot_enabled),
    dailyHoursThreshold: Number(row.daily_hours_threshold ?? LABOR_RULES.STANDARD_DAILY_HOURS),
    weeklyHoursThreshold: Number(row.weekly_hours_threshold ?? LABOR_RULES.STANDARD_WEEKLY_HOURS),
    otMultiplier: Number(row.ot_multiplier ?? LABOR_RULES.OT_MULTIPLIER),
    maxShiftHours: Number(row.max_shift_hours ?? LABOR_RULES.MAX_DAILY_HOURS_WARNING),
    gracePeriodMinutes: Number(row.grace_period_minutes ?? 15),
    missingClockoutCutoffHour: Number(row.missing_clockout_cutoff_hour ?? 2),
    schedulerEnabled: row.scheduler_enabled !== false,
    schedulerHourLocal: Number(row.scheduler_hour_local ?? 2),
    leaveApprovalTimeoutDays: Number(row.leave_approval_timeout_days ?? 7),
    lowBalanceNotify: row.low_balance_notify !== false,
  };
}

/**
 * Local wall-clock parts for a company timezone (best-effort via Intl).
 */
export function localPartsInTimezone(now: Date, timeZone: string): { date: string; hour: number } {
  try {
    const dateParts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const y = dateParts.find((p) => p.type === "year")?.value ?? "1970";
    const m = dateParts.find((p) => p.type === "month")?.value ?? "01";
    const d = dateParts.find((p) => p.type === "day")?.value ?? "01";
    const hourStr = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).format(now);
    const hour = Math.min(23, Math.max(0, parseInt(hourStr, 10) || 0));
    return { date: `${y}-${m}-${d}`, hour };
  } catch {
    return { date: now.toISOString().slice(0, 10), hour: now.getUTCHours() };
  }
}

export function shouldRunSchedulerNow(
  cfg: CompanyAttendanceConfig,
  now = new Date(),
): { run: boolean; localDate: string; localHour: number } {
  const { date, hour } = localPartsInTimezone(now, cfg.timezone);
  if (!cfg.schedulerEnabled) return { run: false, localDate: date, localHour: hour };
  return {
    run: hour === cfg.schedulerHourLocal,
    localDate: date,
    localHour: hour,
  };
}

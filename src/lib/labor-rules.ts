/**
 * Liberian labour defaults for Leave + Time & Attendance (v0.2.0).
 *
 * Confirmed against Decent Work Act 2015 summaries (WageIndicator / secondary guides):
 * - Ordinary hours: 8/day and 48/week for adults
 * - Overtime pay: at least 150% of ordinary hourly rate (1.5×)
 * - Public holiday work: commonly 200% (already used as HOLIDAY_MULTIPLIER in payroll)
 *
 * FLAGGED FOR HUMAN CONFIRMATION (not hardcoded as business rules):
 * - Exact annual leave entitlement days by tenure / sector
 * - Sick leave / maternity / other statutory leave day counts
 * - Weekly OT cap (guides cite ~5 OT hours/week averaged) — not enforced in v0.2.0
 * - Whether daily>8 OR weekly>48 (or both) triggers OT in every sector — this release
 *   uses daily threshold only, as specified for v0.2.0 (beyond 8 hrs/day)
 *
 * All numeric thresholds are named constants — never magic numbers in workflows.
 */

export const LABOR_RULES = {
  /** Ordinary hours per day before overtime (Decent Work Act ordinary day). */
  STANDARD_DAILY_HOURS: 8,
  /** Ordinary hours per week (Decent Work Act ordinary week). Informational / future weekly OT. */
  STANDARD_WEEKLY_HOURS: 48,
  /** Minimum overtime multiplier (150% of ordinary rate). */
  OT_MULTIPLIER: 1.5,
  /** Public-holiday premium used by payroll engine (flag if sector differs). */
  HOLIDAY_MULTIPLIER: 2.0,
  /** Soft daily cap including OT commonly cited (12h) — warning only, not hard block. */
  MAX_DAILY_HOURS_WARNING: 12,
} as const;

export type LaborRules = typeof LABOR_RULES;

/**
 * Split worked hours into regular + overtime using the configurable daily threshold.
 */
export function splitDailyHours(
  hoursWorked: number,
  dailyThreshold: number = LABOR_RULES.STANDARD_DAILY_HOURS,
): { regularHours: number; overtimeHours: number } {
  const h = Math.max(0, Number(hoursWorked) || 0);
  const threshold = Math.max(0, Number(dailyThreshold) || LABOR_RULES.STANDARD_DAILY_HOURS);
  if (h <= threshold) return { regularHours: roundHours(h), overtimeHours: 0 };
  return {
    regularHours: roundHours(threshold),
    overtimeHours: roundHours(h - threshold),
  };
}

export function roundHours(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Hours to deduct from a monthly regular-hours pending field for unpaid leave days.
 * Uses STANDARD_DAILY_HOURS — not a magic 8.
 */
export function unpaidLeaveHoursDeduction(
  leaveDays: number,
  dailyHours: number = LABOR_RULES.STANDARD_DAILY_HOURS,
): number {
  return roundHours(Math.max(0, leaveDays) * dailyHours);
}

export function hoursBetween(clockInIso: string, clockOutIso: string): number {
  const a = new Date(clockInIso).getTime();
  const b = new Date(clockOutIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return roundHours((b - a) / (1000 * 60 * 60));
}

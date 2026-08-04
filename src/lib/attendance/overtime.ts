/**
 * Overtime calculation — daily, weekly, or both (no double-counting).
 *
 * Strategy when mode = "both":
 * 1. daily_ot_i = max(0, hours_i − dailyThreshold) for each day
 * 2. weekly_ot_raw = max(0, sum(hours) − weeklyThreshold)
 * 3. payable_ot = max(sum(daily_ot), weekly_ot_raw)
 *    → if weekly_ot_raw > sum(daily_ot), the difference is "weekly extra"
 *       (hours that never exceeded the daily cap but pushed the week over)
 * 4. This never charges the same hour as both daily and weekly OT.
 *
 * daily_only: payable = sum(daily_ot)
 * weekly_only: payable = weekly_ot_raw (daily_ot ignored for pay)
 */

import { LABOR_RULES, roundHours, splitDailyHours } from "@/lib/labor-rules";
import type { OtMode } from "@/lib/attendance/config";

export type DayHours = { workDate: string; hoursWorked: number };

export type WeekOtResult = {
  isoWeek: string;
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  dailyOtSum: number;
  weeklyOtRaw: number;
  payableOtHours: number;
  weeklyExtra: number;
  otMode: OtMode;
  days: Array<{
    workDate: string;
    hoursWorked: number;
    regularHours: number;
    dailyOtHours: number;
    /** Portion of payable OT attributed to this day for payroll pending rollup */
    attributedOtHours: number;
  }>;
};

/** ISO week key YYYY-Www (UTC date parts). */
export function isoWeekKey(workDate: string): string {
  const d = new Date(`${workDate}T00:00:00Z`);
  // ISO week: Thursday-based year
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const y = tmp.getUTCFullYear();
  return `${y}-W${String(weekNo).padStart(2, "0")}`;
}

export function isoWeekBounds(workDate: string): { start: string; end: string } {
  const d = new Date(`${workDate}T00:00:00Z`);
  const day = d.getUTCDay() || 7; // Mon=1 … Sun=7
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (day - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

/**
 * Compute payable OT for one ISO week of attendance days.
 */
export function computeWeekOvertime(
  days: DayHours[],
  opts: {
    otMode?: OtMode;
    dailyThreshold?: number;
    weeklyThreshold?: number;
  } = {},
): WeekOtResult {
  const otMode = opts.otMode ?? "daily_only";
  const dailyThreshold = opts.dailyThreshold ?? LABOR_RULES.STANDARD_DAILY_HOURS;
  const weeklyThreshold = opts.weeklyThreshold ?? LABOR_RULES.STANDARD_WEEKLY_HOURS;

  const sorted = [...days].sort((a, b) => a.workDate.localeCompare(b.workDate));
  const anchor = sorted[0]?.workDate ?? new Date().toISOString().slice(0, 10);
  const bounds = isoWeekBounds(anchor);
  const isoWeek = isoWeekKey(anchor);

  const dayParts = sorted.map((d) => {
    const split = splitDailyHours(d.hoursWorked, dailyThreshold);
    return {
      workDate: d.workDate,
      hoursWorked: roundHours(d.hoursWorked),
      regularHours: split.regularHours,
      dailyOtHours: split.overtimeHours,
      attributedOtHours: 0,
    };
  });

  const totalHours = roundHours(dayParts.reduce((s, d) => s + d.hoursWorked, 0));
  const dailyOtSum = roundHours(dayParts.reduce((s, d) => s + d.dailyOtHours, 0));
  const weeklyOtRaw = roundHours(Math.max(0, totalHours - weeklyThreshold));

  let payableOtHours = 0;
  let weeklyExtra = 0;

  if (otMode === "daily_only") {
    payableOtHours = dailyOtSum;
    weeklyExtra = 0;
    for (const d of dayParts) d.attributedOtHours = d.dailyOtHours;
  } else if (otMode === "weekly_only") {
    payableOtHours = weeklyOtRaw;
    weeklyExtra = weeklyOtRaw;
    // Attribute weekly OT proportionally to hours worked that week
    attributeProportionally(dayParts, payableOtHours);
  } else {
    // both — no double count
    payableOtHours = roundHours(Math.max(dailyOtSum, weeklyOtRaw));
    weeklyExtra = roundHours(Math.max(0, payableOtHours - dailyOtSum));
    for (const d of dayParts) d.attributedOtHours = d.dailyOtHours;
    if (weeklyExtra > 0) {
      // Spread weekly-extra across days that still have regular (non-daily-OT) hours
      const carriers = dayParts.filter((d) => d.hoursWorked > d.dailyOtHours);
      const pool = carriers.length ? carriers : dayParts;
      const base = pool.reduce((s, d) => s + Math.max(0, d.hoursWorked - d.dailyOtHours), 0) || pool.length;
      let remaining = weeklyExtra;
      pool.forEach((d, i) => {
        const weight = pool.length
          ? Math.max(0, d.hoursWorked - d.dailyOtHours) || 1 / pool.length
          : 1;
        const share =
          i === pool.length - 1
            ? remaining
            : roundHours((weeklyExtra * weight) / base);
        d.attributedOtHours = roundHours(d.attributedOtHours + share);
        remaining = roundHours(remaining - share);
      });
    }
  }

  return {
    isoWeek,
    weekStart: bounds.start,
    weekEnd: bounds.end,
    totalHours,
    dailyOtSum,
    weeklyOtRaw,
    payableOtHours,
    weeklyExtra,
    otMode,
    days: dayParts,
  };
}

function attributeProportionally(
  dayParts: Array<{ hoursWorked: number; attributedOtHours: number }>,
  totalOt: number,
) {
  const sumH = dayParts.reduce((s, d) => s + d.hoursWorked, 0) || 1;
  let remaining = totalOt;
  dayParts.forEach((d, i) => {
    const share =
      i === dayParts.length - 1
        ? remaining
        : roundHours((totalOt * d.hoursWorked) / sumH);
    d.attributedOtHours = share;
    remaining = roundHours(remaining - share);
  });
}

/** Group flat day list by ISO week and compute each week. */
export function computeOvertimeForDays(
  days: DayHours[],
  opts: {
    otMode?: OtMode;
    dailyThreshold?: number;
    weeklyThreshold?: number;
  } = {},
): WeekOtResult[] {
  const byWeek = new Map<string, DayHours[]>();
  for (const d of days) {
    const key = isoWeekKey(d.workDate);
    const arr = byWeek.get(key) ?? [];
    arr.push(d);
    byWeek.set(key, arr);
  }
  return [...byWeek.values()].map((weekDays) => computeWeekOvertime(weekDays, opts));
}

export function sumPayableOvertime(weeks: WeekOtResult[]): number {
  return roundHours(weeks.reduce((s, w) => s + w.payableOtHours, 0));
}

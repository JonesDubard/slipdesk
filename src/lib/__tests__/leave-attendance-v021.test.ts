import { describe, it, expect } from "vitest";
import { computeWeekOvertime, computeOvertimeForDays, sumPayableOvertime } from "@/lib/attendance/overtime";
import {
  applyBalanceDelta,
  approvePending,
  canReservePending,
  emptyBalance,
  isExhausted,
  isLowBalance,
  releasePending,
} from "@/lib/leave/balances";
import { isDateOnApprovedLeave, reminderKey, shouldFlagMissingClockOut } from "@/lib/attendance/reconcile";
import { validatePayrollPeriod } from "@/lib/payroll/validate-period";
import { shouldRunSchedulerNow, resolveOtMode, defaultAttendanceConfig } from "@/lib/attendance/config";
import { renderTemplate } from "@/lib/notifications/templates";
import { readFileSync } from "fs";
import { join } from "path";

describe("weekly + daily overtime (no double-count)", () => {
  const days = [
    { workDate: "2026-08-03", hoursWorked: 10 }, // Mon +2 daily
    { workDate: "2026-08-04", hoursWorked: 10 }, // +2
    { workDate: "2026-08-05", hoursWorked: 10 }, // +2
    { workDate: "2026-08-06", hoursWorked: 10 }, // +2
    { workDate: "2026-08-07", hoursWorked: 10 }, // +2 → daily sum 10; week total 50 → weekly raw 2
  ];

  it("daily_only sums daily OT", () => {
    const w = computeWeekOvertime(days, { otMode: "daily_only", dailyThreshold: 8, weeklyThreshold: 48 });
    expect(w.dailyOtSum).toBe(10);
    expect(w.payableOtHours).toBe(10);
    expect(w.weeklyExtra).toBe(0);
  });

  it("weekly_only uses week threshold", () => {
    const w = computeWeekOvertime(days, { otMode: "weekly_only", dailyThreshold: 8, weeklyThreshold: 48 });
    expect(w.payableOtHours).toBe(2);
    expect(w.dailyOtSum).toBe(10);
  });

  it("both takes max without double-counting", () => {
    const w = computeWeekOvertime(days, { otMode: "both", dailyThreshold: 8, weeklyThreshold: 48 });
    expect(w.payableOtHours).toBe(10); // max(10, 2)
    expect(w.weeklyExtra).toBe(0);
  });

  it("both adds weekly extra when week OT exceeds daily sum", () => {
    // 6 days × 8.5 = 51; daily OT = 0.5×6=3; weekly raw = 3 — equal
    // 6 × 8 = 48 → daily 0, weekly 0
    // 7 × 8 = 56 with no daily OT if threshold 9: weekly only path
    const flat = Array.from({ length: 6 }, (_, i) => ({
      workDate: `2026-08-0${3 + i}`,
      hoursWorked: 9,
    }));
    // total 54, daily OT 6, weekly raw 6 → payable 6
    const w = computeWeekOvertime(flat, { otMode: "both", dailyThreshold: 8, weeklyThreshold: 48 });
    expect(w.totalHours).toBe(54);
    expect(w.dailyOtSum).toBe(6);
    expect(w.weeklyOtRaw).toBe(6);
    expect(w.payableOtHours).toBe(6);

    // Hours under daily but over weekly: 6×8.5 with daily threshold 9
    const underDaily = Array.from({ length: 6 }, (_, i) => ({
      workDate: `2026-08-0${3 + i}`,
      hoursWorked: 8.5,
    }));
    const w2 = computeWeekOvertime(underDaily, { otMode: "both", dailyThreshold: 9, weeklyThreshold: 48 });
    expect(w2.dailyOtSum).toBe(0);
    expect(w2.weeklyOtRaw).toBe(3);
    expect(w2.payableOtHours).toBe(3);
    expect(w2.weeklyExtra).toBe(3);
  });

  it("sums payable across weeks", () => {
    const weeks = computeOvertimeForDays(
      [
        { workDate: "2026-08-03", hoursWorked: 10 },
        { workDate: "2026-08-10", hoursWorked: 10 },
      ],
      { otMode: "daily_only" },
    );
    expect(weeks.length).toBe(2);
    expect(sumPayableOvertime(weeks)).toBe(4);
  });
});

describe("leave balances", () => {
  it("reserves pending, approves to used, releases on reject", () => {
    let bal = emptyBalance("c", "e", "annual", 2026, 20);
    expect(canReservePending(bal, 5, false).ok).toBe(true);
    bal = applyBalanceDelta(bal, { pending: 5 });
    expect(bal.remaining).toBe(15);
    bal = approvePending(bal, 5);
    expect(bal.used).toBe(5);
    expect(bal.pending).toBe(0);
    expect(bal.remaining).toBe(15);

    bal = applyBalanceDelta(bal, { pending: 3 });
    bal = releasePending(bal, 3);
    expect(bal.pending).toBe(0);
    expect(isLowBalance(emptyBalance("c", "e", "annual", 2026, 5), 2)).toBe(false);
    const low = emptyBalance("c", "e", "annual", 2026, 5);
    low.remaining = 2;
    low.allocated = 5;
    low.used = 3;
    expect(isLowBalance(low, 2)).toBe(true);
    expect(isExhausted({ ...low, remaining: 0, used: 5 })).toBe(true);
  });

  it("blocks over-allocation when negative not allowed", () => {
    const bal = emptyBalance("c", "e", "sick", 2026, 2);
    const r = canReservePending(bal, 3, false);
    expect(r.ok).toBe(false);
  });
});

describe("attendance reconciliation", () => {
  const leave = [
    {
      employeeId: "e1",
      status: "approved" as const,
      startDate: "2026-08-10",
      endDate: "2026-08-12",
    },
  ];

  it("excludes approved leave from missing clock-out", () => {
    expect(isDateOnApprovedLeave("2026-08-11", leave, "e1")).toBe(true);
    expect(
      shouldFlagMissingClockOut({
        workDate: "2026-08-11",
        employeeId: "e1",
        status: "open",
        approvedLeave: leave,
      }),
    ).toBe(false);
    expect(
      shouldFlagMissingClockOut({
        workDate: "2026-08-13",
        employeeId: "e1",
        status: "open",
        approvedLeave: leave,
      }),
    ).toBe(true);
  });

  it("builds stable reminder keys for dedupe", () => {
    expect(reminderKey("c", "e", "2026-08-01")).toBe("c|e|2026-08-01|missing_clockout");
  });
});

describe("payroll validation", () => {
  it("flags missing attendance, pending leave, negative balances, overlap", () => {
    const issues = validatePayrollPeriod({
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      attendance: [
        { id: "a1", employeeId: "e1", workDate: "2026-08-05", status: "missing_clock_out", hoursWorked: 0 },
        { id: "a2", employeeId: "e2", workDate: "2026-08-06", status: "complete", hoursWorked: 14 },
      ],
      leaveRequests: [
        {
          id: "l1",
          companyId: "c",
          employeeId: "e1",
          leaveType: "annual",
          startDate: "2026-08-20",
          endDate: "2026-08-21",
          days: 2,
          reason: null,
          isUnpaid: false,
          status: "pending",
          hrNote: null,
          payPeriodLabel: null,
          payrollApplied: false,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "l2",
          companyId: "c",
          employeeId: "e3",
          leaveType: "annual",
          startDate: "2026-08-10",
          endDate: "2026-08-15",
          days: 6,
          reason: null,
          isUnpaid: false,
          status: "approved",
          hrNote: null,
          payPeriodLabel: null,
          payrollApplied: false,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "l3",
          companyId: "c",
          employeeId: "e3",
          leaveType: "sick",
          startDate: "2026-08-14",
          endDate: "2026-08-16",
          days: 3,
          reason: null,
          isUnpaid: false,
          status: "approved",
          hrNote: null,
          payPeriodLabel: null,
          payrollApplied: false,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: "",
          updatedAt: "",
        },
      ],
      balances: [
        { companyId: "c", employeeId: "e4", leaveType: "annual", year: 2026, allocated: 10, used: 12, pending: 0, remaining: -2 },
      ],
    });
    expect(issues.some((i) => i.code === "missing_attendance")).toBe(true);
    expect(issues.some((i) => i.code === "invalid_overtime")).toBe(true);
    expect(issues.some((i) => i.code === "pending_leave")).toBe(true);
    expect(issues.some((i) => i.code === "overlapping_leave")).toBe(true);
    expect(issues.some((i) => i.code === "negative_balance")).toBe(true);
  });
});

describe("scheduler config", () => {
  it("resolves OT mode and scheduler hour gate", () => {
    expect(resolveOtMode({ dailyOtEnabled: true, weeklyOtEnabled: true })).toBe("both");
    expect(resolveOtMode({ dailyOtEnabled: false, weeklyOtEnabled: true })).toBe("weekly_only");
    const cfg = defaultAttendanceConfig("c1");
    cfg.schedulerHourLocal = 99 as unknown as number; // force miss via shouldRun with real hour
    const gate = shouldRunSchedulerNow({ ...cfg, schedulerEnabled: false });
    expect(gate.run).toBe(false);
  });
});

describe("new notification templates", () => {
  it("renders balance and payroll validation templates", () => {
    for (const key of [
      "leave_balance_low",
      "leave_balance_exhausted",
      "attendance_auto_missing_clockout",
      "payroll_validation_warning",
    ] as const) {
      const r = renderTemplate(key, {
        employeeName: "Ada",
        companyName: "Co",
        leaveType: "annual",
        remaining: "1",
        workDate: "2026-08-01",
        validationSummary: "2 warnings",
      });
      expect(r.subject.length).toBeGreaterThan(3);
      expect(r.html.length).toBeGreaterThan(20);
    }
  });
});

describe("0015 migration rollback", () => {
  it("up and down exist and are paired", () => {
    const root = join(process.cwd(), "supabase/migrations");
    const up = readFileSync(join(root, "0015_leave_attendance_hardening.sql"), "utf8");
    const down = readFileSync(join(root, "0015_leave_attendance_hardening_down.sql"), "utf8");
    expect(up).toContain("leave_balances");
    expect(up).toContain("weekly_overtime_records");
    expect(up).toContain("payroll_validation_logs");
    expect(up).toContain("company_attendance_config");
    expect(down).toContain("drop table if exists public.leave_balances");
    expect(down).toContain("drop table if exists public.weekly_overtime_records");
  });
});

import { describe, it, expect, vi } from "vitest";
import { LABOR_RULES, splitDailyHours, unpaidLeaveHoursDeduction } from "@/lib/labor-rules";
import {
  canTransitionLeave,
  countLeaveDays,
  nextLeaveStatus,
  validateLeaveSubmit,
} from "@/lib/leave/leave";
import { buildOvertimeFromHours, sumUnappliedOvertime } from "@/lib/attendance/attendance";
import {
  mergeAttendanceAndLeaveIntoHours,
  periodBoundsFromPayDate,
} from "@/lib/payroll/apply-leave-attendance";
import { calculatePayroll } from "@/lib/slipdesk-payroll-engine";
import { renderTemplate } from "@/lib/notifications/templates";

describe("Liberia labor rules (configurable)", () => {
  it("encodes 8h/day and 1.5x OT without magic numbers in callers", () => {
    expect(LABOR_RULES.STANDARD_DAILY_HOURS).toBe(8);
    expect(LABOR_RULES.STANDARD_WEEKLY_HOURS).toBe(48);
    expect(LABOR_RULES.OT_MULTIPLIER).toBe(1.5);
  });

  it("splits daily hours at the configurable threshold", () => {
    expect(splitDailyHours(8)).toEqual({ regularHours: 8, overtimeHours: 0 });
    expect(splitDailyHours(10)).toEqual({ regularHours: 8, overtimeHours: 2 });
    expect(splitDailyHours(10, 7)).toEqual({ regularHours: 7, overtimeHours: 3 });
  });

  it("unpaid leave deducts STANDARD_DAILY_HOURS per day", () => {
    expect(unpaidLeaveHoursDeduction(2)).toBe(16);
  });
});

describe("leave state machine", () => {
  it("validates submit and counts inclusive days", () => {
    expect(countLeaveDays("2026-08-01", "2026-08-03")).toBe(3);
    const ok = validateLeaveSubmit({
      leaveType: "annual",
      startDate: "2026-08-01",
      endDate: "2026-08-02",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.days).toBe(2);
  });

  it("allows approve/reject/info from pending; blocks terminal", () => {
    expect(canTransitionLeave("pending", "approve")).toBe(true);
    expect(canTransitionLeave("pending", "request_info")).toBe(true);
    expect(canTransitionLeave("approved", "reject")).toBe(false);
    expect(nextLeaveStatus("approve")).toBe("approved");
    expect(nextLeaveStatus("request_info")).toBe("info_requested");
  });
});

describe("overtime → payroll gross", () => {
  it("attendance OT hours increase gross at 1.5x", () => {
    const split = buildOvertimeFromHours(10);
    expect(split.overtimeHours).toBe(2);
    const base = calculatePayroll({
      employeeId: "e1",
      currency: "USD",
      rate: 10,
      regularHours: 160,
      overtimeHours: 0,
      holidayHours: 0,
      exchangeRate: 190,
    });
    const withOt = calculatePayroll({
      employeeId: "e1",
      currency: "USD",
      rate: 10,
      regularHours: 160,
      overtimeHours: split.overtimeHours,
      holidayHours: 0,
      exchangeRate: 190,
    });
    expect(withOt.overtimePay).toBe(10 * 2 * LABOR_RULES.OT_MULTIPLIER);
    expect(withOt.grossPay).toBeGreaterThan(base.grossPay);
  });

  it("sums only unapplied OT in period", () => {
    expect(
      sumUnappliedOvertime(
        [
          { overtimeHours: 2, appliedToPayroll: false, workDate: "2026-08-02" },
          { overtimeHours: 3, appliedToPayroll: true, workDate: "2026-08-03" },
          { overtimeHours: 1, appliedToPayroll: false, workDate: "2026-07-01" },
        ],
        "2026-08-01",
        "2026-08-31",
      ),
    ).toBe(2);
  });
});

describe("leave approval → next payroll hours", () => {
  it("reduces regular hours for approved unpaid leave overlapping the period", () => {
    const applied = mergeAttendanceAndLeaveIntoHours({
      seed: {
        employeeId: "e1",
        standardHours: 173.33,
        pendingRegularHours: 173.33,
        pendingOvertimeHours: 0,
        pendingHolidayHours: 0,
      },
      approvedLeave: [
        {
          id: "l1",
          companyId: "c1",
          employeeId: "e1",
          leaveType: "unpaid",
          startDate: "2026-08-10",
          endDate: "2026-08-11",
          days: 2,
          reason: null,
          isUnpaid: true,
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
      overtimeRows: [
        { employeeId: "e1", overtimeHours: 4, appliedToPayroll: false, workDate: "2026-08-05" },
      ],
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });

    expect(applied.unpaidLeaveDaysApplied).toBe(2);
    expect(applied.regularHours).toBeCloseTo(173.33 - 16, 2);
    expect(applied.overtimeHours).toBe(4);
    expect(applied.overtimeFromAttendance).toBe(4);
  });

  it("periodBoundsFromPayDate covers the calendar month", () => {
    expect(periodBoundsFromPayDate("2026-08-15")).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    });
  });
});

describe("leave / attendance notification templates", () => {
  it("renders leave and attendance templates without secrets", () => {
    for (const key of [
      "leave_submitted",
      "leave_approved",
      "leave_rejected",
      "leave_info_requested",
      "attendance_missing_clockout",
      "attendance_corrected",
    ] as const) {
      const r = renderTemplate(key, {
        employeeName: "Ada",
        companyName: "Jones Logistics",
        leaveType: "annual",
        leaveDates: "2026-08-01 → 2026-08-02",
        leaveDays: "2",
        workDate: "2026-08-03",
        hoursWorked: "9",
        ctaUrl: "https://app.example/portal/leave",
      });
      expect(r.subject.length).toBeGreaterThan(5);
      expect(r.html).toContain("Ada");
      expect(r.html).not.toContain("password");
    }
  });
});

describe("notification failure isolation", () => {
  it("notify helpers catch failures and do not throw", async () => {
    vi.resetModules();
    vi.doMock("@/lib/notifications/service", async () => {
      const actual = await vi.importActual<typeof import("@/lib/notifications/service")>(
        "@/lib/notifications/service",
      );
      return {
        ...actual,
        sendTemplatedEmail: async () => {
          throw new Error("Resend down");
        },
        isValidEmail: () => true,
        appUrl: () => "http://localhost:3000",
      };
    });
    const { notifyLeaveApproved } = await import("@/lib/notifications/leave-attendance-notify");
    const result = await notifyLeaveApproved({
      companyId: "c",
      employeeId: "e",
      employeeName: "Ada",
      recipient: "ada@example.com",
      companyName: "Co",
      leaveType: "annual",
      leaveDates: "2026-08-01 → 2026-08-02",
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("failed");
  });
});

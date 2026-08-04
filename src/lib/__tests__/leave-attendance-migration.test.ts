import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(process.cwd(), "supabase/migrations");

describe("0014 leave/attendance migration", () => {
  it("creates leave, attendance, overtime tables and extends notification events", () => {
    const up = readFileSync(join(root, "0014_leave_attendance.sql"), "utf8");
    expect(up).toContain("create table if not exists public.leave_requests");
    expect(up).toContain("create table if not exists public.leave_approval_events");
    expect(up).toContain("create table if not exists public.attendance_records");
    expect(up).toContain("create table if not exists public.overtime_records");
    expect(up).toContain("leave_submitted");
    expect(up).toContain("attendance_missing_clockout");
  });

  it("down migration drops new tables and restores preference check", () => {
    const down = readFileSync(join(root, "0014_leave_attendance_down.sql"), "utf8");
    expect(down).toContain("drop table if exists public.overtime_records");
    expect(down).toContain("drop table if exists public.attendance_records");
    expect(down).toContain("drop table if exists public.leave_approval_events");
    expect(down).toContain("drop table if exists public.leave_requests");
    expect(down).toContain("'welcome'");
  });
});

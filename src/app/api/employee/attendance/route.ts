import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLinkedEmployee } from "@/lib/employee-portal/session";
import {
  clockIn,
  clockOut,
  listEmployeeAttendance,
  manualHoursEntry,
} from "@/lib/attendance/service";
import { LABOR_RULES } from "@/lib/labor-rules";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const linked = await resolveLinkedEmployee(admin, user.id);
  if (!linked) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const records = await listEmployeeAttendance(linked.id);
  return NextResponse.json({
    records,
    laborRules: {
      standardDailyHours: LABOR_RULES.STANDARD_DAILY_HOURS,
      otMultiplier: LABOR_RULES.OT_MULTIPLIER,
      standardWeeklyHours: LABOR_RULES.STANDARD_WEEKLY_HOURS,
    },
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const linked = await resolveLinkedEmployee(admin, user.id);
  if (!linked) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const blocked = await assertNotDemoCompany(admin, linked.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  if (action === "clock_in") {
    const result = await clockIn({ employeeId: linked.id, companyId: linked.companyId });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, record: result.record });
  }

  if (action === "clock_out") {
    const result = await clockOut({ employeeId: linked.id, companyId: linked.companyId });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, record: result.record });
  }

  if (action === "manual") {
    const result = await manualHoursEntry({
      employeeId: linked.id,
      companyId: linked.companyId,
      workDate: String(body.workDate ?? ""),
      hours: Number(body.hours),
      notes: body.notes != null ? String(body.notes) : undefined,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, record: result.record });
  }

  return NextResponse.json({ error: "action must be clock_in, clock_out, or manual." }, { status: 400 });
}

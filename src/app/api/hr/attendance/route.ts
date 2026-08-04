import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, normalizeRole, type Role } from "@/lib/rbac";
import {
  flagMissingClockOuts,
  listCompanyAttendance,
  manualHoursEntry,
} from "@/lib/attendance/service";
import { LABOR_RULES } from "@/lib/labor-rules";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

async function resolveHr(userId: string) {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const { data: owned } = await db
    .from("companies")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (owned?.id) return { companyId: owned.id as string, role: "company_owner" as Role, admin };
  const { data: member } = await db
    .from("company_members")
    .select("company_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (member?.company_id) {
    return { companyId: member.company_id as string, role: normalizeRole(member.role), admin };
  }
  return null;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hr = await resolveHr(user.id);
  if (!hr || !can(hr.role, "attendance:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const records = await listCompanyAttendance(hr.companyId);
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

  const hr = await resolveHr(user.id);
  if (!hr || !can(hr.role, "attendance:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const blocked = await assertNotDemoCompany(hr.admin, hr.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  if (action === "correct") {
    const result = await manualHoursEntry({
      employeeId: String(body.employeeId ?? ""),
      companyId: hr.companyId,
      workDate: String(body.workDate ?? ""),
      hours: Number(body.hours),
      notes: body.notes != null ? String(body.notes) : undefined,
      actorUserId: user.id,
      asCorrection: true,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, record: result.record });
  }

  if (action === "flag_missing_clockouts") {
    const result = await flagMissingClockOuts(hr.companyId);
    return NextResponse.json({ ok: true, flagged: result.flagged, skippedLeave: result.skippedLeave });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, normalizeRole, type Role } from "@/lib/rbac";
import {
  ensureAttendanceConfig,
  updateAttendanceConfig,
} from "@/lib/attendance/config-service";
import { upsertLeavePolicy } from "@/lib/leave/balance-service";
import type { LeaveType } from "@/lib/leave/leave";
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
  const config = await ensureAttendanceConfig(hr.companyId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: policies } = await (hr.admin as any)
    .from("leave_policies")
    .select("*")
    .eq("company_id", hr.companyId);
  return NextResponse.json({ config, policies: policies ?? [] });
}

export async function PATCH(req: NextRequest) {
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
  if (body.leavePolicy) {
    await upsertLeavePolicy({
      companyId: hr.companyId,
      leaveType: body.leavePolicy.leaveType as LeaveType,
      annualAllocation:
        body.leavePolicy.annualAllocation == null
          ? null
          : Number(body.leavePolicy.annualAllocation),
      tracksBalance: body.leavePolicy.tracksBalance,
      lowBalanceThreshold: body.leavePolicy.lowBalanceThreshold,
      allowNegative: body.leavePolicy.allowNegative,
      actorId: user.id,
    });
  }
  const config = await updateAttendanceConfig(hr.companyId, body.config ?? body, user.id);
  return NextResponse.json({ ok: true, config });
}

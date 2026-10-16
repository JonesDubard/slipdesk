import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { resolveAppCompanyAccess } from "@/lib/auth/resolve-app-company";
import {
  ensureAttendanceConfig,
  updateAttendanceConfig,
} from "@/lib/attendance/config-service";
import { upsertLeavePolicy } from "@/lib/leave/balance-service";
import type { LeaveType } from "@/lib/leave/leave";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const hr = await resolveAppCompanyAccess(user.id);
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
  const hr = await resolveAppCompanyAccess(user.id);
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

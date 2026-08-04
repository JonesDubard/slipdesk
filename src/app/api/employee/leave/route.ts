import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLinkedEmployee } from "@/lib/employee-portal/session";
import { listEmployeeLeave, submitLeaveRequest } from "@/lib/leave/service";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const linked = await resolveLinkedEmployee(admin, user.id);
  if (!linked) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const requests = await listEmployeeLeave(linked.id);
  return NextResponse.json({ requests });
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
  const result = await submitLeaveRequest({
    employeeId: linked.id,
    companyId: linked.companyId,
    actorUserId: user.id,
    leaveType: body.leaveType,
    startDate: String(body.startDate ?? ""),
    endDate: String(body.endDate ?? ""),
    reason: body.reason != null ? String(body.reason) : undefined,
    isUnpaid: Boolean(body.isUnpaid),
    payPeriodLabel: body.payPeriodLabel != null ? String(body.payPeriodLabel) : undefined,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, request: result.request });
}

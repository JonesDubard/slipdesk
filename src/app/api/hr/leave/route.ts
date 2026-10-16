import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { resolveAppCompanyAccess } from "@/lib/auth/resolve-app-company";
import { listCompanyLeave, reviewLeaveRequest } from "@/lib/leave/service";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";
import type { LeaveReviewAction } from "@/lib/leave/leave";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hr = await resolveAppCompanyAccess(user.id);
  if (!hr || !can(hr.role, "leave:review")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status") ?? "pending";
  const requests = await listCompanyLeave(hr.companyId, status);
  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hr = await resolveAppCompanyAccess(user.id);
  if (!hr || !can(hr.role, "leave:review")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const blocked = await assertNotDemoCompany(hr.admin, hr.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "") as LeaveReviewAction;
  if (!["approve", "reject", "request_info"].includes(action)) {
    return NextResponse.json({ error: "action must be approve, reject, or request_info." }, { status: 400 });
  }

  const result = await reviewLeaveRequest({
    companyId: hr.companyId,
    leaveRequestId: String(body.id ?? ""),
    actorUserId: user.id,
    action,
    note: body.note != null ? String(body.note) : undefined,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, request: result.request });
}

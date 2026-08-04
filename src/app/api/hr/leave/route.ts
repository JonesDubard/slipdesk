import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, normalizeRole, type Role } from "@/lib/rbac";
import { listCompanyLeave, reviewLeaveRequest } from "@/lib/leave/service";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";
import type { LeaveReviewAction } from "@/lib/leave/leave";

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

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hr = await resolveHr(user.id);
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

  const hr = await resolveHr(user.id);
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

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReviewChangeRequests } from "@/lib/employee-portal/session";
import {
  approvedPatchFromRequest,
  mapChangeRequestRow,
  type ChangeRequestFieldType,
} from "@/lib/employee-portal/change-requests";
import { normalizeLiberianPhone } from "@/lib/employee-portal/phone";
import { logAuditServer } from "@/lib/audit-server";
import { normalizeRole } from "@/lib/rbac";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

type Ctx = { params: Promise<{ id: string }> };

async function resolveReviewer(userId: string) {
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
  if (owned?.id) return { companyId: owned.id as string, role: "company_owner", admin };

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

/**
 * POST body: { action: "approve" | "reject", rejectionReason?: string }
 * Approvals apply the patch to employees and write audit entries.
 * Requests NEVER auto-apply — this is the only mutation path.
 */
export async function POST(req: NextRequest, routeCtx: Ctx) {
  const { id } = await routeCtx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const reviewer = await resolveReviewer(user.id);
  if (!reviewer || !canReviewChangeRequests(reviewer.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be approve or reject." }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = reviewer.admin as any;
  const { data: request, error } = await db
    .from("employee_change_requests")
    .select("*")
    .eq("id", id)
    .eq("company_id", reviewer.companyId)
    .maybeSingle();

  if (error || !request) {
    return NextResponse.json({ error: "Change request not found." }, { status: 404 });
  }
  if (request.status !== "pending") {
    return NextResponse.json({ error: "Request is no longer pending." }, { status: 409 });
  }

  const blocked = await assertNotDemoCompany(reviewer.admin, reviewer.companyId);
  if (blocked) return blocked;

  if (action === "reject") {
    const reason = String(body.rejectionReason ?? "").trim() || "Rejected by HR";
    const { data: updated, error: updErr } = await db
      .from("employee_change_requests")
      .update({
        status: "rejected",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }

    await logAuditServer(reviewer.admin, {
      companyId: reviewer.companyId,
      action: "employee.change_request.reject",
      entityType: "employee_change_request",
      entityId: id,
      actorId: user.id,
      actorEmail: user.email,
      oldValue: { status: "pending" },
      newValue: { status: "rejected", rejectionReason: reason },
    });

    return NextResponse.json({ request: mapChangeRequestRow(updated) });
  }

  // ── Approve: apply patch then mark approved ──────────────────────────────
  const fieldType = request.field_type as ChangeRequestFieldType;
  const newValue = (request.new_value ?? {}) as Record<string, unknown>;
  let phoneE164: string | null = null;
  if (fieldType === "phone") {
    phoneE164 = normalizeLiberianPhone(String(newValue.phone ?? ""));
    if (!phoneE164) {
      return NextResponse.json({ error: "Approved phone is not a valid Liberian number." }, { status: 400 });
    }
  }

  const patch = approvedPatchFromRequest(fieldType, newValue, phoneE164);
  const { error: empErr } = await db
    .from("employees")
    .update(patch)
    .eq("id", request.employee_id)
    .eq("company_id", reviewer.companyId);

  if (empErr) {
    return NextResponse.json({ error: empErr.message }, { status: 400 });
  }

  const { data: updated, error: updErr } = await db
    .from("employee_change_requests")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 400 });
  }

  await logAuditServer(reviewer.admin, {
    companyId: reviewer.companyId,
    action: "employee.change_request.approve",
    entityType: "employee_change_request",
    entityId: id,
    actorId: user.id,
    actorEmail: user.email,
    oldValue: request.old_value,
    newValue: { status: "approved", applied: patch },
  });

  await logAuditServer(reviewer.admin, {
    companyId: reviewer.companyId,
    action: "employee.update",
    entityType: "employee",
    entityId: request.employee_id,
    actorId: user.id,
    actorEmail: user.email,
    oldValue: request.old_value,
    newValue: patch,
  });

  return NextResponse.json({ request: mapChangeRequestRow(updated) });
}

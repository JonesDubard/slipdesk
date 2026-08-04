import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManagePortalCredentials } from "@/lib/employee-portal/hr-access";
import {
  assignOrResetPortalPassword,
  disablePortalAccess,
} from "@/lib/employee-portal/auth";
import { normalizeRole } from "@/lib/rbac";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

type Ctx = { params: Promise<{ id: string }> };

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
 * POST { action: "assign" | "reset" | "disable", temporaryPassword?: string }
 * On assign/reset, response includes temporaryPassword once — for the admin only.
 */
export async function POST(req: NextRequest, routeCtx: Ctx) {
  const { id: employeeId } = await routeCtx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hr = await resolveHr(user.id);
  if (!hr || !canManagePortalCredentials(hr.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const blocked = await assertNotDemoCompany(hr.admin, hr.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "assign");

  if (action === "disable") {
    const result = await disablePortalAccess({
      employeeId,
      companyId: hr.companyId,
      actorUserId: user.id,
      actorEmail: user.email,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, portalEnabled: false });
  }

  if (action !== "assign" && action !== "reset") {
    return NextResponse.json({ error: "action must be assign, reset, or disable." }, { status: 400 });
  }

  const result = await assignOrResetPortalPassword({
    employeeId,
    companyId: hr.companyId,
    actorUserId: user.id,
    actorEmail: user.email,
    mode: action,
    temporaryPassword: body.temporaryPassword ? String(body.temporaryPassword) : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    portalEnabled: true,
    temporaryPassword: result.temporaryPassword,
    phone: result.phone,
    employeeName: result.employeeName,
    mustChangePassword: true,
    relayNote:
      "Show this temporary PIN to the employee in person or by a secure channel you control. It is not stored and will not be shown again.",
  });
}

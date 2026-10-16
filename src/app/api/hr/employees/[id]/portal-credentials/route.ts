import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManagePortalCredentials } from "@/lib/employee-portal/hr-access";
import {
  assignOrResetPortalPassword,
  disablePortalAccess,
} from "@/lib/employee-portal/auth";
import { resolveAppCompanyAccess } from "@/lib/auth/resolve-app-company";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST { action: "assign" | "reset" | "disable", temporaryPassword?: string }
 * On assign/reset, response includes temporaryPassword once — for the admin only.
 */
export async function POST(req: NextRequest, routeCtx: Ctx) {
  const { id: employeeId } = await routeCtx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hr = await resolveAppCompanyAccess(user.id);
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

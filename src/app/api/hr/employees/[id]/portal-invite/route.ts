import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManagePortalCredentials } from "@/lib/employee-portal/hr-access";
import { invitePortalByEmail } from "@/lib/employee-portal/auth";
import { resolveAppCompanyAccess } from "@/lib/auth/resolve-app-company";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/hr/employees/[id]/portal-invite
 * Sends the existing one-hour /portal/reset-password link. Does not return a PIN.
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

  await req.json().catch(() => ({}));

  const result = await invitePortalByEmail({
    employeeId,
    companyId: hr.companyId,
    actorUserId: user.id,
    actorEmail: user.email,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    portalEnabled: true,
    phone: result.phone,
    employeeName: result.employeeName,
    mustChangePassword: false,
    relayNote: "An email invite was sent. The employee chooses their own password from that link.",
  });
}

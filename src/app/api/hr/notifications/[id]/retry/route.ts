import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { resolveAppCompanyAccess } from "@/lib/auth/resolve-app-company";
import { retryNotification } from "@/lib/notifications/service";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hr = await resolveAppCompanyAccess(user.id);
  if (!hr || !can(hr.role, "notifications:view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const blocked = await assertNotDemoCompany(hr.admin, hr.companyId);
  if (blocked) return blocked;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await (hr.admin as any)
    .from("notification_logs")
    .select("id, company_id, status")
    .eq("id", id)
    .eq("company_id", hr.companyId)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Notification not found." }, { status: 404 });

  const result = await retryNotification(id);
  return NextResponse.json({ ok: result.ok, status: result.status, error: result.errorReason });
}

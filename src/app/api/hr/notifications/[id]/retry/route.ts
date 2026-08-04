import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, normalizeRole } from "@/lib/rbac";
import { retryNotification } from "@/lib/notifications/service";
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

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hr = await resolveHr(user.id);
  if (!hr || !can(hr.role as import("@/lib/rbac").Role, "notifications:view")) {
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

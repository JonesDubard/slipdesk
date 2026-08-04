import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { changeEmployeePassword } from "@/lib/employee-portal/auth";
import { resolveLinkedEmployee } from "@/lib/employee-portal/session";
import { notifyPasswordChanged } from "@/lib/notifications/service";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const linked = await resolveLinkedEmployee(admin, user.id);
  if (!linked) {
    return NextResponse.json({ error: "Employee portal session required." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const currentPassword = body.currentPassword != null ? String(body.currentPassword) : undefined;
  const newPassword = String(body.newPassword ?? "");

  const result = await changeEmployeePassword({
    employeeId: linked.id,
    currentPassword,
    newPassword,
    actorUserId: user.id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (linked.email) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: company } = await (admin as any)
      .from("companies")
      .select("name, logo_url, brand_primary_color, brand_secondary_color, email_footer")
      .eq("id", linked.companyId)
      .maybeSingle();
    void notifyPasswordChanged({
      employeeId: linked.id,
      companyId: linked.companyId,
      email: linked.email,
      fullName: linked.fullName,
      companyName: company?.name ?? "your company",
      branding: {
        companyName: company?.name ?? "Slipdesk",
        logoUrl: company?.logo_url,
        primaryColor: company?.brand_primary_color,
        secondaryColor: company?.brand_secondary_color,
        footer: company?.email_footer,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

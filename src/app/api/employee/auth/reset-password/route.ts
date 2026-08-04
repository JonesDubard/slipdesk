import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { changeEmployeePassword } from "@/lib/employee-portal/auth";
import { notifyPasswordChanged } from "@/lib/notifications/service";
import { validateAndConsumeToken } from "@/lib/notifications/service";
import { validatePasswordPolicy } from "@/lib/employee-portal/password";
import { logEmployeeAuthEvent } from "@/lib/employee-portal/auth-events";

/**
 * Completes password reset using a single-use emailed token.
 * Does not require an existing session.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const newPassword = String(body.newPassword ?? "");

  const policy = validatePasswordPolicy(newPassword);
  if (policy) return NextResponse.json({ error: policy }, { status: 400 });
  if (!token) return NextResponse.json({ error: "Reset link is invalid." }, { status: 400 });

  const validated = await validateAndConsumeToken(token, "password_reset");
  if (!validated.ok) {
    const messages = {
      invalid: "Reset link is invalid.",
      expired: "Reset link has expired. Request a new one.",
      used: "Reset link has already been used. Request a new one.",
    };
    return NextResponse.json({ error: messages[validated.reason] }, { status: 400 });
  }

  const result = await changeEmployeePassword({
    employeeId: validated.record.employeeId,
    newPassword,
    allowWithoutCurrent: true,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const admin = createAdminClient();
  await logEmployeeAuthEvent(admin, {
    employeeId: validated.record.employeeId,
    companyId: validated.record.companyId,
    eventType: "password_changed",
    meta: { via: "email_reset" },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const { data: emp } = await db
    .from("employees")
    .select("full_name, email, company_id")
    .eq("id", validated.record.employeeId)
    .maybeSingle();
  const { data: company } = await db
    .from("companies")
    .select("name, logo_url, brand_primary_color, brand_secondary_color, email_footer")
    .eq("id", validated.record.companyId)
    .maybeSingle();

  if (emp?.email) {
    void notifyPasswordChanged({
      employeeId: validated.record.employeeId,
      companyId: validated.record.companyId,
      email: emp.email,
      fullName: emp.full_name,
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

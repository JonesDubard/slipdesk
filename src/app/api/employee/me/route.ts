import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLinkedEmployee } from "@/lib/employee-portal/session";
import { getCredentialStatus } from "@/lib/employee-portal/auth";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const employee = await resolveLinkedEmployee(admin, user.id);
  if (!employee) {
    return NextResponse.json({ error: "Employee portal session required." }, { status: 403 });
  }

  const cred = await getCredentialStatus(employee.id);

  return NextResponse.json({
    employee,
    mustChangePassword: cred?.mustChangePassword ?? false,
    hasCredentials: cred?.hasCredentials ?? false,
  });
}

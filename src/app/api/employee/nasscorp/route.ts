import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOwnEmployee, resolveLinkedEmployee } from "@/lib/employee-portal/session";
import { getNasscorpContributions } from "@/lib/employee-portal/nasscorp";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const linked = await resolveLinkedEmployee(admin, user.id);
  const requestedId = req.nextUrl.searchParams.get("employeeId");
  const gate = assertOwnEmployee(linked, requestedId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const summary = await getNasscorpContributions(
    admin,
    gate.employee.id,
    gate.employee.companyId,
    gate.employee.nasscorpNumber,
  );
  return NextResponse.json({ nasscorp: summary });
}

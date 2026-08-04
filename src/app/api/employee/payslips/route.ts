import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOwnEmployee, resolveLinkedEmployee } from "@/lib/employee-portal/session";
import { listEmployeePayslips } from "@/lib/employee-portal/payslips";

/**
 * GET /api/employee/payslips
 * Optional ?employeeId= — must match the authenticated employee or returns 403.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service role for reads but always scope by linked employee id.
  const admin = createAdminClient();
  const linked = await resolveLinkedEmployee(admin, user.id);
  const requestedId = req.nextUrl.searchParams.get("employeeId");
  const gate = assertOwnEmployee(linked, requestedId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const payslips = await listEmployeePayslips(admin, gate.employee.id, gate.employee.companyId);
  return NextResponse.json({ payslips });
}

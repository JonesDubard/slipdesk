import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOwnEmployee, resolveLinkedEmployee } from "@/lib/employee-portal/session";
import { getEmployeePayslip } from "@/lib/employee-portal/payslips";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const linked = await resolveLinkedEmployee(admin, user.id);
  const requestedEmployeeId = req.nextUrl.searchParams.get("employeeId");
  const gate = assertOwnEmployee(linked, requestedEmployeeId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const payslip = await getEmployeePayslip(admin, id, gate.employee.id, gate.employee.companyId);
  if (!payslip) {
    return NextResponse.json({ error: "Payslip not found." }, { status: 404 });
  }

  return NextResponse.json({ payslip });
}

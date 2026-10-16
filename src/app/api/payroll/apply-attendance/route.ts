import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAppCompanyAccess } from "@/lib/auth/resolve-app-company";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";
import { periodBoundsFromPayDate } from "@/lib/payroll/apply-leave-attendance";
import {
  attendanceApplyCallerGate,
  employeesInAuthorizedCompany,
  payRunInAuthorizedCompany,
} from "@/lib/payroll/apply-attendance-access";

/**
 * After a pay run is marked paid: mark overlapping OT rows applied and clear pending OT.
 * Leave unpaid deductions were already applied to pending_regular_hours on approve.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const payRunId = String(body.payRunId ?? "");
  if (!payRunId) return NextResponse.json({ error: "payRunId required" }, { status: 400 });

  const access = await resolveAppCompanyAccess(user.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const caller = attendanceApplyCallerGate({ companyId: access.companyId, role: access.role });
  if (!caller.proceed) {
    return NextResponse.json({ error: caller.error }, { status: caller.status });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = access.admin as any;
  const { data: run } = await db
    .from("pay_runs")
    .select("id, company_id, pay_date, period_label, status")
    .eq("id", payRunId)
    .eq("company_id", caller.companyId)
    .maybeSingle();

  const payRun = run
    ? { companyId: String(run.company_id), status: String(run.status) }
    : null;
  if (!payRunInAuthorizedCompany(payRun, caller.companyId)) {
    return NextResponse.json({ error: "Paid pay run not found." }, { status: 404 });
  }

  const blocked = await assertNotDemoCompany(db, caller.companyId);
  if (blocked) return blocked;

  const { data: lines } = await db
    .from("pay_run_lines")
    .select("employee_id")
    .eq("pay_run_id", payRunId)
    .eq("company_id", caller.companyId);

  const ids = [...new Set(((lines ?? []) as { employee_id: string }[]).map((line) => line.employee_id).filter(Boolean))];
  let employeeCompanyIds: string[] = [];
  if (ids.length) {
    const { data: employees } = await db
      .from("employees")
      .select("id, company_id")
      .in("id", ids)
      .eq("company_id", caller.companyId);
    const found = new Set(((employees ?? []) as { id: string }[]).map((row) => row.id));
    if (ids.some((id) => !found.has(id))) {
      return NextResponse.json({ error: "Paid pay run not found." }, { status: 404 });
    }
    employeeCompanyIds = ((employees ?? []) as { company_id: string }[]).map((row) => row.company_id);
  }
  if (!employeesInAuthorizedCompany(employeeCompanyIds, caller.companyId)) {
    return NextResponse.json({ error: "Paid pay run not found." }, { status: 404 });
  }

  const bounds = periodBoundsFromPayDate(String(run.pay_date).slice(0, 10));

  await db
    .from("overtime_records")
    .update({
      applied_to_payroll: true,
      pay_period_label: run.period_label,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", caller.companyId)
    .eq("applied_to_payroll", false)
    .gte("work_date", bounds.start)
    .lte("work_date", bounds.end);

  if (ids.length) {
    await db
      .from("employees")
      .update({ pending_overtime_hours: 0 })
      .in("id", ids)
      .eq("company_id", caller.companyId);
  }

  return NextResponse.json({ ok: true, period: bounds });
}

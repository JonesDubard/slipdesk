import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAppCompanyAccess } from "@/lib/auth/resolve-app-company";
import { notifyPayslipsReady } from "@/lib/notifications/service";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";
import {
  paidRunInCompany,
  payslipNotifyCallerGate,
  recipientsInCompany,
} from "@/lib/payroll/notify-payslips-access";

/**
 * Triggered after payroll is marked paid — emails employees with a secure View Payslip link (no PDF).
 * Body: { payRunId: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const payRunId = String(body.payRunId ?? "");
  if (!payRunId) return NextResponse.json({ error: "payRunId required" }, { status: 400 });

  const access = await resolveAppCompanyAccess(user.id, supabase);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const caller = payslipNotifyCallerGate({ companyId: access.companyId, role: access.role });
  if (!caller.proceed) {
    return NextResponse.json({ error: caller.error }, { status: caller.status });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = access.admin as any;
  const { data: run } = await db
    .from("pay_runs")
    .select("id, company_id, period_label, status")
    .eq("id", payRunId)
    .eq("company_id", caller.companyId)
    .maybeSingle();

  const payRun = run
    ? { companyId: String(run.company_id), status: String(run.status) }
    : null;
  if (!paidRunInCompany(payRun, caller.companyId)) {
    return NextResponse.json({ error: "Paid pay run not found." }, { status: 404 });
  }

  const blocked = await assertNotDemoCompany(db, caller.companyId);
  if (blocked) return blocked;

  const { data: company } = await db
    .from("companies")
    .select("id, name, logo_url, brand_primary_color, brand_secondary_color, email_footer")
    .eq("id", caller.companyId)
    .maybeSingle();

  const { data: lines } = await db
    .from("pay_run_lines")
    .select("id, employee_id, full_name")
    .eq("pay_run_id", payRunId)
    .eq("company_id", caller.companyId);

  const lineRows = (lines ?? []) as { id: string; employee_id: string; full_name: string }[];
  const employeeIds = [...new Set(lineRows.map((line) => line.employee_id).filter(Boolean))];
  let employeeRows: { id: string; email: string | null; full_name: string | null; company_id: string }[] = [];
  if (employeeIds.length) {
    const { data: emps } = await db
      .from("employees")
      .select("id, email, full_name, portal_enabled, company_id")
      .in("id", employeeIds)
      .eq("company_id", caller.companyId);
    employeeRows = (emps ?? []) as typeof employeeRows;
  }
  if (!recipientsInCompany(employeeRows.map((row) => row.company_id), employeeIds.length, caller.companyId)) {
    return NextResponse.json({ error: "Paid pay run not found." }, { status: 404 });
  }

  const empMap = new Map(employeeRows.map((row) => [row.id, row]));
  const payload = lineRows.map((line) => {
    const emp = empMap.get(line.employee_id);
    return {
      id: line.employee_id,
      email: emp?.email ?? null,
      fullName: emp?.full_name ?? line.full_name,
      payslipLineId: line.id,
    };
  });

  const result = await notifyPayslipsReady({
    companyId: caller.companyId,
    companyName: company?.name ?? "your company",
    periodLabel: run.period_label,
    branding: {
      companyName: company?.name ?? "Slipdesk",
      logoUrl: company?.logo_url,
      primaryColor: company?.brand_primary_color,
      secondaryColor: company?.brand_secondary_color,
      footer: company?.email_footer,
    },
    employees: payload,
  });

  return NextResponse.json({ ok: true, ...result });
}

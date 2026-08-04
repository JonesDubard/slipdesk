import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyPayslipsReady } from "@/lib/notifications/service";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

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

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  const { data: run } = await db
    .from("pay_runs")
    .select("id, company_id, period_label, status")
    .eq("id", payRunId)
    .maybeSingle();

  if (!run || run.status !== "paid") {
    return NextResponse.json({ error: "Paid pay run not found." }, { status: 404 });
  }

  const blocked = await assertNotDemoCompany(admin, run.company_id);
  if (blocked) return blocked;

  const { data: company } = await db
    .from("companies")
    .select("id, name, logo_url, brand_primary_color, brand_secondary_color, email_footer")
    .eq("id", run.company_id)
    .maybeSingle();

  const { data: lines } = await db
    .from("pay_run_lines")
    .select("id, employee_id, full_name")
    .eq("pay_run_id", payRunId)
    .eq("company_id", run.company_id);

  const employeeIds = [...new Set(((lines ?? []) as { employee_id: string }[]).map((l) => l.employee_id))];
  const { data: emps } = await db
    .from("employees")
    .select("id, email, full_name, portal_enabled")
    .in("id", employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"]);

  const empMap = new Map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((emps ?? []) as any[]).map((e) => [e.id, e]),
  );

  const payload = ((lines ?? []) as { id: string; employee_id: string; full_name: string }[])
    .map((line) => {
      const emp = empMap.get(line.employee_id);
      return {
        id: line.employee_id,
        email: emp?.email ?? null,
        fullName: emp?.full_name ?? line.full_name,
        payslipLineId: line.id,
      };
    });

  const result = await notifyPayslipsReady({
    companyId: run.company_id,
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

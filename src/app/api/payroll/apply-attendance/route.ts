import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";
import { periodBoundsFromPayDate } from "@/lib/payroll/apply-leave-attendance";

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

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  const { data: run } = await db
    .from("pay_runs")
    .select("id, company_id, pay_date, period_label, status")
    .eq("id", payRunId)
    .maybeSingle();

  if (!run || run.status !== "paid") {
    return NextResponse.json({ error: "Paid pay run not found." }, { status: 404 });
  }

  const blocked = await assertNotDemoCompany(admin, run.company_id);
  if (blocked) return blocked;

  const bounds = periodBoundsFromPayDate(String(run.pay_date).slice(0, 10));

  await db
    .from("overtime_records")
    .update({
      applied_to_payroll: true,
      pay_period_label: run.period_label,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", run.company_id)
    .eq("applied_to_payroll", false)
    .gte("work_date", bounds.start)
    .lte("work_date", bounds.end);

  const { data: lines } = await db
    .from("pay_run_lines")
    .select("employee_id")
    .eq("pay_run_id", payRunId);

  const ids = [...new Set(((lines ?? []) as { employee_id: string }[]).map((l) => l.employee_id))];
  if (ids.length) {
    await db
      .from("employees")
      .update({ pending_overtime_hours: 0 })
      .in("id", ids);
  }

  return NextResponse.json({ ok: true, period: bounds });
}

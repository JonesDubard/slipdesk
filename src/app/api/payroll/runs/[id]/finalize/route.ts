import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";
import {
  FINALIZED_PAY_RUN_STATUSES,
  canEditPayrollDraft,
  resolvePayrollAccess,
  type PayRunStatus,
} from "@/lib/payroll/resolve-payroll-access";
import {
  computeDraftTotals,
  parseDraftPayload,
} from "@/lib/payroll/draft-persistence";

type RouteCtx = { params: Promise<{ id: string }> };

/** POST /api/payroll/runs/[id]/finalize — mark paid and persist pay_run_lines. */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await resolvePayrollAccess(user.id, supabase);
  if (!access || !canEditPayrollDraft(access.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const blocked = await assertNotDemoCompany(access.admin, access.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = access.admin as any;

  const { data: existing, error: loadErr } = await db
    .from("pay_runs")
    .select("*")
    .eq("id", id)
    .eq("company_id", access.companyId)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 400 });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (FINALIZED_PAY_RUN_STATUSES.includes(existing.status as PayRunStatus)) {
    return NextResponse.json({ error: "Already finalized", code: "FINALIZED" }, { status: 409 });
  }

  const draft = parseDraftPayload(existing.draft_payload);
  const lines = Array.isArray(body.lines) ? body.lines : (draft?.lines ?? []);
  const exchangeRate = Number(existing.exchange_rate ?? 185.44);
  const totals = computeDraftTotals(lines, exchangeRate);

  const { error: updateErr } = await db
    .from("pay_runs")
    .update({
      status: "paid",
      employee_count: totals.employeeCount,
      total_gross: totals.totalGross,
      total_net: totals.totalNet,
      total_income_tax: totals.totalIncomeTax,
      total_nasscorp: totals.totalNasscorp,
      draft_payload: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", access.companyId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

  await db.from("pay_run_lines").delete().eq("pay_run_id", id);

  const lineRows = lines
    .filter((l: { calc?: unknown }) => l.calc)
    .map((l: Record<string, unknown>) => ({
      pay_run_id: id,
      company_id: access.companyId,
      employee_id: l.employeeId,
      employee_number: l.employeeNumber,
      full_name: l.fullName,
      job_title: l.jobTitle,
      department: l.department,
      currency: l.currency,
      rate: l.rate,
      regular_hours: l.regularHours,
      overtime_hours: l.overtimeHours,
      holiday_hours: l.holidayHours,
      additional_earnings: l.additionalEarnings,
      deductions: l.deductions ?? 0,
      deduction_items: l.deductionItems ?? null,
      exchange_rate: l.exchangeRate,
      gross_pay: (l.calc as { grossPay: number }).grossPay,
      income_tax: (l.calc as { Paye: { taxInBase: number } }).Paye.taxInBase,
      nasscorp_ee: (l.calc as { nasscorp: { employeeContribution: number } }).nasscorp.employeeContribution,
      nasscorp_er: (l.calc as { nasscorp: { employerContribution: number } }).nasscorp.employerContribution,
      net_pay: (l.calc as { netPay: number }).netPay,
    }));

  if (lineRows.length) {
    const { error: lineErr } = await db.from("pay_run_lines").insert(lineRows);
    if (lineErr) {
      return NextResponse.json(
        { error: "Run marked paid but line insert failed", detail: lineErr.message },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true, payRunId: id });
}

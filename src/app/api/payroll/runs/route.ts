import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";
import {
  DRAFT_AUTOSAVE_STATUSES,
  canEditPayrollDraft,
  canViewPayroll,
  resolvePayrollAccess,
} from "@/lib/payroll/resolve-payroll-access";
import {
  buildDraftPayload,
  computeDraftTotals,
  type RunType,
} from "@/lib/payroll/draft-persistence";
import {
  applyBranchFilterToQuery,
  parseBranchIdParam,
  resolveBranchForCompany,
} from "@/lib/payroll/branch-scope";

/** GET /api/payroll/runs — list in-progress drafts for the company. */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await resolvePayrollAccess(user.id);
  if (!access || !canViewPayroll(access.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const activeOnly = req.nextUrl.searchParams.get("active") !== "false";
  const finalizedOnly = req.nextUrl.searchParams.get("finalized") === "true";
  const branchFilter = parseBranchIdParam(req.nextUrl.searchParams.get("branchId"));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (access.admin as any)
    .from("pay_runs")
    .select(
      "id, period_label, pay_date, status, run_type, exchange_rate, employee_count, branch_id, updated_at, created_at, branches(name)",
    )
    .eq("company_id", access.companyId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (finalizedOnly) {
    query = query.eq("status", "paid");
  } else if (activeOnly) {
    query = query.in("status", DRAFT_AUTOSAVE_STATUSES);
  }

  query = applyBranchFilterToQuery(query, branchFilter) as typeof query;

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ runs: data ?? [] });
}

/** POST /api/payroll/runs — create a new draft pay run. */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await resolvePayrollAccess(user.id);
  if (!access || !canEditPayrollDraft(access.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const blocked = await assertNotDemoCompany(access.admin, access.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const periodLabel = String(body.periodLabel ?? "").trim();
  const payDate = String(body.payDate ?? "").trim();
  const runType = (String(body.runType ?? "monthly") as RunType) || "monthly";
  const exchangeRate = Number(body.exchangeRate ?? 185.44);

  if (!periodLabel || !payDate) {
    return NextResponse.json({ error: "periodLabel and payDate are required" }, { status: 400 });
  }

  const rawBranchId = body.branchId === null || body.branchId === "all" || body.branchId === ""
    ? null
    : String(body.branchId ?? "").trim() || null;

  const branchResolved = await resolveBranchForCompany(
    access.admin,
    access.companyId,
    rawBranchId,
  );
  if ("error" in branchResolved) {
    return NextResponse.json({ error: branchResolved.error }, { status: 400 });
  }

  const draftPayload = buildDraftPayload({
    periodLabel,
    payDate,
    runType,
    exchangeRate,
    status: "draft",
    runStarted: Boolean(body.runStarted),
    lines: Array.isArray(body.lines) ? body.lines : [],
  });

  const totals = computeDraftTotals(draftPayload.lines, exchangeRate);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (access.admin as any)
    .from("pay_runs")
    .insert({
      company_id: access.companyId,
      period_label: periodLabel,
      pay_period_start: payDate,
      pay_period_end: payDate,
      pay_date: payDate,
      exchange_rate: exchangeRate,
      status: "draft",
      run_type: runType,
      employee_count: totals.employeeCount,
      total_gross: totals.totalGross,
      total_net: totals.totalNet,
      total_income_tax: totals.totalIncomeTax,
      total_nasscorp: totals.totalNasscorp,
      draft_payload: draftPayload,
      branch_id: branchResolved.branchId,
    })
    .select("id, period_label, pay_date, status, run_type, exchange_rate, branch_id, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ run: data });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";
import {
  DRAFT_AUTOSAVE_STATUSES,
  FINALIZED_PAY_RUN_STATUSES,
  canEditPayrollDraft,
  canViewPayroll,
  resolvePayrollAccess,
  type PayRunStatus,
} from "@/lib/payroll/resolve-payroll-access";
import {
  buildDraftPayload,
  computeDraftTotals,
  parseDraftPayload,
  type RunType,
} from "@/lib/payroll/draft-persistence";
import {
  mapPayRunLineRowToFinalized,
  type EmployeePayExtras,
  type FinalizedPayrollLine,
  type PayRunLineRowInput,
} from "@/lib/compliance/statutory-exports";

type RouteCtx = { params: Promise<{ id: string }> };

async function loadRun(admin: unknown, companyId: string, id: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("pay_runs")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** GET /api/payroll/runs/[id] — load draft or finalized run header + payload. */
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await resolvePayrollAccess(user.id);
  if (!access || !canViewPayroll(access.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const run = await loadRun(access.admin, access.companyId, id);
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const draft = parseDraftPayload(run.draft_payload);

    let finalizedLines: FinalizedPayrollLine[] | null = null;
    if (FINALIZED_PAY_RUN_STATUSES.includes(run.status as PayRunStatus)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = access.admin as any;
      const { data: lineRows, error: lineErr } = await db
        .from("pay_run_lines")
        .select("*")
        .eq("pay_run_id", id)
        .order("full_name");
      if (lineErr) throw new Error(lineErr.message);

      const rows = (lineRows ?? []) as PayRunLineRowInput[];
      const empIds = rows.map((l) => l.employee_id).filter((id): id is string => Boolean(id));
      let empById = new Map<string, EmployeePayExtras>();
      if (empIds.length) {
        const { data: emps } = await db
          .from("employees")
          .select("id, payment_method, account_number, momo_number, branch, nasscorp_number")
          .in("id", empIds);
        empById = new Map(
          (emps ?? []).map((e: EmployeePayExtras & { id: string }) => [e.id, e]),
        );
      }

      finalizedLines = rows.map((l) => {
        const emp = l.employee_id ? empById.get(l.employee_id) : undefined;
        return mapPayRunLineRowToFinalized(l, emp);
      });
    }

    const branchJoin = run.branches as { name?: string } | { name?: string }[] | null;
    const branchNameFromJoin = Array.isArray(branchJoin)
      ? branchJoin[0]?.name ?? null
      : branchJoin?.name ?? null;

    return NextResponse.json({
      run: {
        id: run.id,
        periodLabel: run.period_label,
        payDate: run.pay_date,
        status: run.status,
        runType: run.run_type ?? "monthly",
        exchangeRate: run.exchange_rate,
        updatedAt: run.updated_at,
        branchId: run.branch_id ?? null,
        branchName: branchNameFromJoin,
        draft,
        finalizedLines,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load run" },
      { status: 400 },
    );
  }
}

/** PATCH /api/payroll/runs/[id] — debounced autosave or status advance (non-final). */
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
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

  try {
    const existing = await loadRun(access.admin, access.companyId, id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const currentStatus = existing.status as PayRunStatus;

    if (body.abandon === true) {
      if (FINALIZED_PAY_RUN_STATUSES.includes(currentStatus)) {
        return NextResponse.json(
          { error: "Finalized pay runs cannot be abandoned", code: "FINALIZED" },
          { status: 409 },
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: abandonErr } = await (access.admin as any)
        .from("pay_runs")
        .update({
          status: "archived",
          draft_payload: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("company_id", access.companyId);
      if (abandonErr) return NextResponse.json({ error: abandonErr.message }, { status: 400 });
      return NextResponse.json({ ok: true, abandoned: true });
    }

    if (FINALIZED_PAY_RUN_STATUSES.includes(currentStatus)) {
      return NextResponse.json(
        { error: "Finalized pay runs cannot be modified", code: "FINALIZED" },
        { status: 409 },
      );
    }

    const nextStatus = body.status
      ? (String(body.status) as PayRunStatus)
      : currentStatus;

    if (!DRAFT_AUTOSAVE_STATUSES.includes(nextStatus)) {
      return NextResponse.json({ error: "Invalid status transition for draft save" }, { status: 400 });
    }

    const periodLabel = String(body.periodLabel ?? existing.period_label);
    const payDate = String(body.payDate ?? existing.pay_date);
    const runType = (String(body.runType ?? existing.run_type ?? "monthly") as RunType) || "monthly";
    const exchangeRate = Number(body.exchangeRate ?? existing.exchange_rate ?? 185.44);
    const priorDraft = parseDraftPayload(existing.draft_payload);
    const lines = Array.isArray(body.lines) ? body.lines : (priorDraft?.lines ?? []);
    const runStarted =
      body.runStarted !== undefined ? Boolean(body.runStarted) : (priorDraft?.runStarted ?? false);

    const draftPayload = buildDraftPayload({
      periodLabel,
      payDate,
      runType,
      exchangeRate,
      status: nextStatus,
      runStarted,
      lines,
    });

    const totals = computeDraftTotals(lines, exchangeRate);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (access.admin as any)
      .from("pay_runs")
      .update({
        period_label: periodLabel,
        pay_period_start: payDate,
        pay_period_end: payDate,
        pay_date: payDate,
        exchange_rate: exchangeRate,
        status: nextStatus,
        run_type: runType,
        employee_count: totals.employeeCount,
        total_gross: totals.totalGross,
        total_net: totals.totalNet,
        total_income_tax: totals.totalIncomeTax,
        total_nasscorp: totals.totalNasscorp,
        draft_payload: draftPayload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", access.companyId)
      .select("id, period_label, pay_date, status, run_type, exchange_rate, updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ run: data, savedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save run" },
      { status: 400 },
    );
  }
}

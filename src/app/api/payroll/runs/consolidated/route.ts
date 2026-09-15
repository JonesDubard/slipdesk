import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  canViewPayroll,
  resolvePayrollAccess,
} from "@/lib/payroll/resolve-payroll-access";
import { mapPayRunLineRowToFinalized } from "@/lib/compliance/statutory-exports";

/**
 * GET /api/payroll/runs/consolidated?periodLabel=Sep%202026
 * Merges finalized pay_run_lines from all paid runs for the period (org-wide + per-branch).
 */
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

  const periodLabel = req.nextUrl.searchParams.get("periodLabel")?.trim();
  if (!periodLabel) {
    return NextResponse.json({ error: "periodLabel is required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = access.admin as any;

  const { data: runs, error: runsErr } = await db
    .from("pay_runs")
    .select("id, period_label, branch_id, pay_date, employee_count")
    .eq("company_id", access.companyId)
    .eq("status", "paid")
    .eq("period_label", periodLabel)
    .order("updated_at", { ascending: false });

  if (runsErr) return NextResponse.json({ error: runsErr.message }, { status: 400 });
  if (!runs?.length) {
    return NextResponse.json({ periodLabel, runs: [], finalizedLines: [], disbursementRows: [] });
  }

  const runIds = runs.map((r: { id: string }) => r.id);
  const { data: lineRows, error: lineErr } = await db
    .from("pay_run_lines")
    .select("*")
    .in("pay_run_id", runIds)
    .order("full_name");

  if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 400 });

  const empIds = (lineRows ?? [])
    .map((l: { employee_id?: string }) => l.employee_id)
    .filter(Boolean);
  let empById = new Map<string, Record<string, unknown>>();
  if (empIds.length) {
    const { data: emps } = await db
      .from("employees")
      .select("id, payment_method, account_number, momo_number, branch, nasscorp_number")
      .in("id", empIds);
    empById = new Map((emps ?? []).map((e: { id: string }) => [e.id, e]));
  }

  const seenEmployees = new Set<string>();
  const finalizedLines: Array<Record<string, unknown>> = [];

  for (const l of lineRows ?? []) {
    const empKey = (l.employee_id as string) || (l.employee_number as string);
    if (seenEmployees.has(empKey)) continue;
    seenEmployees.add(empKey);
    const emp = l.employee_id ? empById.get(l.employee_id as string) : undefined;
    finalizedLines.push(mapPayRunLineRowToFinalized(l, emp));
  }

  const { rowsFromFinalizedPayroll } = await import("@/lib/reports/disbursement");
  const disbursementRows = rowsFromFinalizedPayroll(
    finalizedLines as Parameters<typeof rowsFromFinalizedPayroll>[0],
  );

  return NextResponse.json({
    periodLabel,
    runs,
    finalizedLines,
    disbursementRows,
    employeeCount: finalizedLines.length,
  });
}

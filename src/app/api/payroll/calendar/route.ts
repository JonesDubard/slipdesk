import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { canUse, getEffectiveTier } from "@/lib/plan-features";
import { resolveAppCompanyAccess } from "@/lib/auth/resolve-app-company";
import { authorizeCompanyPermission } from "@/lib/auth/authorize-company-permission";
import { buildPayrollCalendarMonth } from "@/lib/payroll/periods";
import type { SubscriptionTier } from "@/context/AppContext";

/** GET /api/payroll/calendar?year=2026&month=7 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await resolveAppCompanyAccess(user.id, supabase);
  if (!access) return NextResponse.json({ error: "No company" }, { status: 403 });
  const gate = authorizeCompanyPermission(
    { companyId: access.companyId, role: access.role },
    "payroll:view",
  );
  if (!gate.proceed) return NextResponse.json({ error: gate.error }, { status: gate.status });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = access.admin as any;
  const { data: company } = await db
    .from("companies")
    .select("subscription_tier, billing_bypass")
    .eq("id", gate.companyId)
    .maybeSingle();

  const tier = getEffectiveTier(
    (company?.subscription_tier as SubscriptionTier) || "basic",
    Boolean(company?.billing_bypass),
  );
  if (!canUse("payrollCalendar", tier)) {
    return NextResponse.json({ error: "Upgrade required", code: "PLAN_GATE" }, { status: 403 });
  }

  const now = new Date();
  const year = Number(req.nextUrl.searchParams.get("year") ?? now.getFullYear());
  const month = Number(req.nextUrl.searchParams.get("month") ?? now.getMonth() + 1);
  if (!Number.isFinite(year) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid year/month" }, { status: 400 });
  }

  try {
    const { data: payRuns, error: runsErr } = await db
      .from("pay_runs")
      .select("id, status, pay_period_start, pay_period_end, pay_date, period_label, created_at")
      .eq("company_id", gate.companyId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (runsErr) {
      console.error("[payroll-calendar] pay_runs:", runsErr.message);
      return NextResponse.json({ error: "Could not load calendar", detail: runsErr.message }, { status: 500 });
    }

    const runs = (payRuns ?? []).map((r: {
      id: string; status?: string; pay_period_start?: string; pay_period_end?: string;
      pay_date?: string; period_label?: string;
    }) => ({
      id: r.id,
      status: r.status,
      periodStart: r.pay_period_start,
      periodEnd: r.pay_period_end,
      payDate: r.pay_date ?? r.pay_period_end,
      periodLabel: r.period_label,
    }));

    const calendar = buildPayrollCalendarMonth(year, month, runs);
    return NextResponse.json({ calendar, runs });
  } catch (err) {
    console.error("[payroll-calendar]", err);
    return NextResponse.json({
      error: "Could not load calendar",
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { canUse, getEffectiveTier } from "@/lib/plan-features";
import { resolveCompanyIdForUser } from "@/lib/payments/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPayrollCalendarMonth } from "@/lib/payroll/periods";
import type { SubscriptionTier } from "@/context/AppContext";

/** GET /api/payroll/calendar?year=2026&month=7 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyId = await resolveCompanyIdForUser(supabase, user.id);
  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (supabase as any)
    .from("companies")
    .select("subscription_tier, billing_bypass")
    .eq("id", companyId)
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
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: payRuns } = await (admin as any)
      .from("pay_runs")
      .select("id, status, period_start, period_end, pay_date, period_label, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(50);

    const runs = (payRuns ?? []).map((r: {
      id: string; status?: string; period_start?: string; period_end?: string;
      pay_date?: string; period_label?: string;
    }) => ({
      id: r.id,
      status: r.status,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      payDate: r.pay_date ?? r.period_end,
      periodLabel: r.period_label,
    }));

    const calendar = buildPayrollCalendarMonth(year, month, runs);
    return NextResponse.json({ calendar, runs });
  } catch (err) {
    console.error("[payroll-calendar]", err);
    return NextResponse.json({ error: "Could not load calendar" }, { status: 500 });
  }
}

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { resolveAppCompanyAccess } from "@/lib/auth/resolve-app-company";
import { authorizeExecutiveAnalytics } from "@/lib/analytics/authorize-executive";
import { aggregateExecutiveMetrics } from "@/lib/analytics/executive";
import type { SubscriptionTier } from "@/context/AppContext";

/**
 * GET /api/analytics/executive
 * Aggregates high-level payroll / headcount metrics for Enterprise executives.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await resolveAppCompanyAccess(user.id);
  if (!access) return NextResponse.json({ error: "Company not found" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = access.admin as any;
  const { data: company } = await db
    .from("companies")
    .select("id, name, subscription_tier, billing_bypass")
    .eq("id", access.companyId)
    .maybeSingle();

  if (!company || company.id !== access.companyId) {
    return NextResponse.json({ error: "Company not found" }, { status: 403 });
  }

  const gate = authorizeExecutiveAnalytics({
    decision: { companyId: access.companyId, role: access.role },
    subscriptionTier: (company.subscription_tier as SubscriptionTier) || "basic",
    billingBypass: Boolean(company.billing_bypass),
  });
  if (!gate.ok) {
    return NextResponse.json(
      gate.code ? { error: gate.error, code: gate.code } : { error: gate.error },
      { status: gate.status },
    );
  }

  try {
    const { data: employees } = await db
      .from("employees")
      .select("id, department, branch, county, is_active, is_archived, basic_salary, currency")
      .eq("company_id", gate.companyId);

    const { data: payRuns } = await db
      .from("pay_runs")
      .select("id, status, pay_period_start, pay_period_end, pay_date, created_at, total_gross, total_net")
      .eq("company_id", gate.companyId)
      .order("created_at", { ascending: false })
      .limit(12);

    const metrics = aggregateExecutiveMetrics({
      companyName: company.name,
      employees: employees ?? [],
      payRuns: (payRuns ?? []).map((r: {
        id: string;
        status?: string;
        pay_period_start?: string;
        pay_period_end?: string;
        created_at?: string;
        total_gross?: number;
        total_net?: number;
      }) => ({
        id: r.id,
        status: r.status,
        period_start: r.pay_period_start,
        period_end: r.pay_period_end,
        created_at: r.created_at,
        total_gross: r.total_gross,
        total_net: r.total_net,
      })),
    });

    return NextResponse.json(metrics);
  } catch (err) {
    console.error("[executive-analytics]", err);
    return NextResponse.json({ error: "Could not load executive analytics" }, { status: 500 });
  }
}

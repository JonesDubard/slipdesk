import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { canUse, getEffectiveTier } from "@/lib/plan-features";
import { can, normalizeRole } from "@/lib/rbac";
import type { SubscriptionTier } from "@/context/AppContext";
import { aggregateExecutiveMetrics } from "@/lib/analytics/executive";

/**
 * GET /api/analytics/executive
 * Aggregates high-level payroll / headcount metrics for Enterprise executives.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: owned } = await supabase
    .from("companies")
    .select("id, subscription_tier, billing_bypass, name")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let company = owned;
  if (!company) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.company_id) {
      const { data: byId } = await supabase
        .from("companies")
        .select("id, subscription_tier, billing_bypass, name")
        .eq("id", profile.company_id)
        .maybeSingle();
      company = byId;
    }
  }

  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 403 });

  const tier = getEffectiveTier(
    (company.subscription_tier as SubscriptionTier) || "basic",
    Boolean(company.billing_bypass),
  );

  if (!canUse("executiveAnalytics", tier)) {
    return NextResponse.json({ error: "Upgrade required", code: "PLAN_GATE" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: member } = await (supabase as any)
    .from("company_members")
    .select("role")
    .eq("company_id", company.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const role = member?.role ? normalizeRole(member.role) : "company_owner";
  if (!can(role, "analytics:executive") && role !== "company_owner" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;
    const { data: employees } = await db
      .from("employees")
      .select("id, department, branch, county, is_active, is_archived, basic_salary, currency")
      .eq("company_id", company.id);

    const { data: payRuns } = await db
      .from("pay_runs")
      .select("id, status, pay_period_start, pay_period_end, pay_date, created_at, total_gross, total_net")
      .eq("company_id", company.id)
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

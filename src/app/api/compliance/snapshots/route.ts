import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { canUse, getEffectiveTier } from "@/lib/plan-features";
import { resolveCompanyIdForUser } from "@/lib/payments/server";
import type { SubscriptionTier } from "@/context/AppContext";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

async function resolve() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const companyId = await resolveCompanyIdForUser(supabase, user.id);
  if (!companyId) return { error: NextResponse.json({ error: "No company" }, { status: 403 }) };

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
  return { companyId, tier };
}

/** GET /api/compliance/snapshots — Enterprise compliance history */
export async function GET() {
  const ctx = await resolve();
  if ("error" in ctx && ctx.error) return ctx.error;
  if (!canUse("complianceHistory", ctx.tier)) {
    return NextResponse.json({ error: "Upgrade required", code: "PLAN_GATE" }, { status: 403 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("compliance_snapshots")
    .select("*")
    .eq("company_id", ctx.companyId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ snapshots: data ?? [] });
}

/** POST /api/compliance/snapshots — save current scorecard */
export async function POST(req: NextRequest) {
  const ctx = await resolve();
  if ("error" in ctx && ctx.error) return ctx.error;
  if (!canUse("complianceHistory", ctx.tier)) {
    return NextResponse.json({ error: "Upgrade required", code: "PLAN_GATE" }, { status: 403 });
  }

  const supabase = await createClient();
  const blocked = await assertNotDemoCompany(supabase, ctx.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const periodLabel = String(body.periodLabel ?? new Date().toLocaleString("default", { month: "long", year: "numeric" }));
  const score = Number(body.score ?? 0);
  const criticalCount = Number(body.criticalCount ?? 0);
  const warningCount = Number(body.warningCount ?? 0);

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("compliance_snapshots")
    .insert({
      company_id: ctx.companyId,
      period_label: periodLabel,
      score,
      critical_count: criticalCount,
      warning_count: warningCount,
      payroll_ready: Boolean(body.payrollReady),
      lra_ready: Boolean(body.lraReady),
      nasscorp_ready: Boolean(body.nasscorpReady),
      details: body.details ?? null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ snapshot: data });
}

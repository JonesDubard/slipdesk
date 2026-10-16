import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { canUse, getEffectiveTier } from "@/lib/plan-features";
import { resolveAppCompanyAccess } from "@/lib/auth/resolve-app-company";
import { authorizeCompanyPermission } from "@/lib/auth/authorize-company-permission";
import type { SubscriptionTier } from "@/context/AppContext";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

async function resolve() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const access = await resolveAppCompanyAccess(user.id, supabase);
  if (!access) return { error: NextResponse.json({ error: "No company" }, { status: 403 }) };
  const gate = authorizeCompanyPermission(
    { companyId: access.companyId, role: access.role },
    "compliance:view",
  );
  if (!gate.proceed) {
    return { error: NextResponse.json({ error: gate.error }, { status: 403 }) };
  }

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
  return { companyId: gate.companyId, tier, db };
}

/** GET /api/compliance/snapshots — Enterprise compliance history */
export async function GET() {
  const ctx = await resolve();
  if ("error" in ctx && ctx.error) return ctx.error;
  if (!canUse("complianceHistory", ctx.tier)) {
    return NextResponse.json({ error: "Upgrade required", code: "PLAN_GATE" }, { status: 403 });
  }

  const { data, error } = await ctx.db
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

  const blocked = await assertNotDemoCompany(ctx.db, ctx.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const periodLabel = String(body.periodLabel ?? new Date().toLocaleString("default", { month: "long", year: "numeric" }));
  const score = Number(body.score ?? 0);
  const criticalCount = Number(body.criticalCount ?? 0);
  const warningCount = Number(body.warningCount ?? 0);

  const { data, error } = await ctx.db
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

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { canUse, getEffectiveTier } from "@/lib/plan-features";
import { resolveCompanyIdForUser } from "@/lib/payments/server";
import type { SubscriptionTier } from "@/context/AppContext";

/**
 * GET /api/org/branch-summary
 * Enterprise multi-branch headcount / salary mass by registered branch.
 */
export async function GET() {
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
  if (!canUse("multiBranch", tier)) {
    return NextResponse.json({ error: "Upgrade required", code: "PLAN_GATE" }, { status: 403 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;
  const { data: branches } = await db
    .from("branches")
    .select("id, name, code, is_hq, created_at")
    .eq("company_id", companyId)
    .order("name");

  const { data: employees } = await db
    .from("employees")
    .select("id, branch, department, is_active, is_archived, basic_salary, rate")
    .eq("company_id", companyId);

  const active = (employees ?? []).filter(
    (e: { is_active?: boolean; is_archived?: boolean }) => e.is_active !== false && !e.is_archived,
  );

  const summary = (branches ?? []).map((b: { id: string; name: string; code?: string; is_hq?: boolean }) => {
    const members = active.filter(
      (e: { branch?: string }) => (e.branch || "").trim().toLowerCase() === b.name.trim().toLowerCase(),
    );
    const salaryMass = members.reduce(
      (s: number, e: { basic_salary?: number; rate?: number }) => s + (Number(e.basic_salary) || Number(e.rate) || 0),
      0,
    );
    return {
      id: b.id,
      name: b.name,
      code: b.code ?? null,
      isHq: Boolean(b.is_hq),
      employees: members.length,
      salaryMass,
    };
  });

  const unassigned = active.filter((e: { branch?: string }) => {
    const name = (e.branch || "").trim().toLowerCase();
    if (!name) return true;
    return !(branches ?? []).some((b: { name: string }) => b.name.trim().toLowerCase() === name);
  }).length;

  return NextResponse.json({
    branches: summary,
    unassigned,
    totalActive: active.length,
  });
}

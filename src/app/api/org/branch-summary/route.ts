import { getAuthenticatedUser, applyAuthCookies } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { canUse, getEffectiveTier } from "@/lib/plan-features";
import { resolveCompanyIdForUser } from "@/lib/payments/server";
import type { SubscriptionTier } from "@/context/AppContext";
import { aggregateByBranchId } from "@/lib/org/employee-branch";
import { authorizeOrgUnitsAccess } from "@/lib/org/units-access";

/**
 * GET /api/org/branch-summary
 * Enterprise multi-branch headcount / salary mass by registered branch.
 */
export async function GET(request: NextRequest) {
  const { supabase, user, authCookies } = await getAuthenticatedUser(request);
  const withCookies = (res: NextResponse) => applyAuthCookies(res, authCookies);

  const authz = authorizeOrgUnitsAccess({
    userId: user?.id,
    companyId: user ? await resolveCompanyIdForUser(supabase, user.id) : null,
  });
  if (!authz.ok) {
    return withCookies(NextResponse.json({ error: authz.error }, { status: authz.status }));
  }
  const companyId = authz.companyId;

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
    return withCookies(NextResponse.json({ error: "Upgrade required", code: "PLAN_GATE" }, { status: 403 }));
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
    .select("id, branch_id, branch, department, is_active, is_archived, basic_salary, rate")
    .eq("company_id", companyId);

  const aggregated = aggregateByBranchId(
    (branches ?? []).map((b: { id: string; name: string; code?: string; is_hq?: boolean }) => ({
      id: b.id,
      name: b.name,
      code: b.code ?? null,
      isHq: Boolean(b.is_hq),
    })),
    (employees ?? []).map((e: {
      branch_id?: string | null;
      is_active?: boolean;
      is_archived?: boolean;
      basic_salary?: number;
      rate?: number;
    }) => ({
      branchId: e.branch_id ?? null,
      isActive: e.is_active,
      isArchived: e.is_archived,
      basicSalary: e.basic_salary,
      rate: e.rate,
    })),
  );

  return withCookies(NextResponse.json({
    branches: aggregated.branches,
    unassigned: aggregated.unassigned,
    unassignedSalaryMass: aggregated.unassignedSalaryMass,
    totalActive: aggregated.totalActive,
  }));
}

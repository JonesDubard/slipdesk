import { createClient, getAuthenticatedUser, applyAuthCookies } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { canUse, getEffectiveTier } from "@/lib/plan-features";
import type { SubscriptionTier } from "@/context/AppContext";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";
import { resolveCompanyIdForUser } from "@/lib/payments/server";
import { authorizeOrgUnitsAccess, orgBranchListScope } from "@/lib/org/units-access";

type Kind = "departments" | "branches";

async function resolveCompanyContext(request: NextRequest) {
  const { supabase, user, authCookies } = await getAuthenticatedUser(request);
  const withCookies = (res: NextResponse) => applyAuthCookies(res, authCookies);

  const authz = authorizeOrgUnitsAccess({
    userId: user?.id,
    companyId: user ? await resolveCompanyIdForUser(supabase, user.id) : null,
  });
  if (!authz.ok) {
    return { error: withCookies(NextResponse.json({ error: authz.error }, { status: authz.status })) };
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id, subscription_tier, billing_bypass")
    .eq("id", authz.companyId)
    .maybeSingle();

  if (!company) {
    return { error: withCookies(NextResponse.json({ error: "Company not found" }, { status: 403 })) };
  }

  const tier = getEffectiveTier(
    (company.subscription_tier as SubscriptionTier) || "basic",
    Boolean(company.billing_bypass),
  );
  return { supabase, company, tier, withCookies };
}

function featureFor(kind: Kind) {
  return kind === "departments" ? "departmentManagement" : "branchManagement";
}

export async function GET(req: NextRequest) {
  const kind = (req.nextUrl.searchParams.get("kind") === "branches" ? "branches" : "departments") as Kind;
  const ctx = await resolveCompanyContext(req);
  if ("error" in ctx && ctx.error) return ctx.error;
  const { supabase, company, tier, withCookies } = ctx as Awaited<ReturnType<typeof resolveCompanyContext>> & {
    supabase: Awaited<ReturnType<typeof createClient>>;
    company: { id: string };
    tier: SubscriptionTier;
    withCookies: (res: NextResponse) => NextResponse;
  };

  if (!canUse(featureFor(kind), tier)) {
    return withCookies(NextResponse.json({ error: "Upgrade required", items: [] }, { status: 403 }));
  }

  const scope = kind === "branches" ? orgBranchListScope(company.id) : { table: kind, companyId: company.id };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from(scope.table)
    .select("id, name, created_at")
    .eq("company_id", scope.companyId)
    .order("name");

  if (error) return withCookies(NextResponse.json({ error: error.message }, { status: 400 }));
  return withCookies(NextResponse.json({ items: data ?? [] }));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const kind = (body.kind === "branches" ? "branches" : "departments") as Kind;
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const ctx = await resolveCompanyContext(req);
  if ("error" in ctx && ctx.error) return ctx.error;
  const { supabase, company, tier, withCookies } = ctx as Awaited<ReturnType<typeof resolveCompanyContext>> & {
    supabase: Awaited<ReturnType<typeof createClient>>;
    company: { id: string };
    tier: SubscriptionTier;
    withCookies: (res: NextResponse) => NextResponse;
  };

  const blocked = await assertNotDemoCompany(supabase, company.id);
  if (blocked) return withCookies(blocked);

  if (!canUse(featureFor(kind), tier)) {
    return withCookies(NextResponse.json({ error: "Upgrade required" }, { status: 403 }));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from(kind)
    .insert({ company_id: company.id, name })
    .select("id, name, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return withCookies(NextResponse.json({ error: "That name already exists." }, { status: 409 }));
    }
    return withCookies(NextResponse.json({ error: error.message }, { status: 400 }));
  }
  return withCookies(NextResponse.json({ item: data }));
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const kind = (body.kind === "branches" ? "branches" : "departments") as Kind;
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ctx = await resolveCompanyContext(req);
  if ("error" in ctx && ctx.error) return ctx.error;
  const { supabase, company, tier, withCookies } = ctx as Awaited<ReturnType<typeof resolveCompanyContext>> & {
    supabase: Awaited<ReturnType<typeof createClient>>;
    company: { id: string };
    tier: SubscriptionTier;
    withCookies: (res: NextResponse) => NextResponse;
  };

  const blocked = await assertNotDemoCompany(supabase, company.id);
  if (blocked) return withCookies(blocked);

  if (!canUse(featureFor(kind), tier)) {
    return withCookies(NextResponse.json({ error: "Upgrade required" }, { status: 403 }));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from(kind)
    .delete()
    .eq("id", id)
    .eq("company_id", company.id);

  if (error) return withCookies(NextResponse.json({ error: error.message }, { status: 400 }));
  return withCookies(NextResponse.json({ success: true }));
}

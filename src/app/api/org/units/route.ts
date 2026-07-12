import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { canUse, getEffectiveTier } from "@/lib/plan-features";
import type { SubscriptionTier } from "@/context/AppContext";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

type Kind = "departments" | "branches";

async function resolveCompanyContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: owned } = await supabase
    .from("companies")
    .select("id, subscription_tier, billing_bypass")
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
        .select("id, subscription_tier, billing_bypass")
        .eq("id", profile.company_id)
        .maybeSingle();
      company = byId;
    }
  }

  if (!company) return { error: NextResponse.json({ error: "Company not found" }, { status: 403 }) };

  const tier = getEffectiveTier(
    (company.subscription_tier as SubscriptionTier) || "basic",
    Boolean(company.billing_bypass),
  );
  return { supabase, company, tier };
}

function featureFor(kind: Kind) {
  return kind === "departments" ? "departmentManagement" : "branchManagement";
}

export async function GET(req: NextRequest) {
  const kind = (req.nextUrl.searchParams.get("kind") === "branches" ? "branches" : "departments") as Kind;
  const ctx = await resolveCompanyContext();
  if ("error" in ctx && ctx.error) return ctx.error;
  const { supabase, company, tier } = ctx as Awaited<ReturnType<typeof resolveCompanyContext>> & {
    supabase: Awaited<ReturnType<typeof createClient>>;
    company: { id: string };
    tier: SubscriptionTier;
  };

  if (!canUse(featureFor(kind), tier)) {
    return NextResponse.json({ error: "Upgrade required", items: [] }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from(kind)
    .select("id, name, created_at")
    .eq("company_id", company.id)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const kind = (body.kind === "branches" ? "branches" : "departments") as Kind;
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const ctx = await resolveCompanyContext();
  if ("error" in ctx && ctx.error) return ctx.error;
  const { supabase, company, tier } = ctx as Awaited<ReturnType<typeof resolveCompanyContext>> & {
    supabase: Awaited<ReturnType<typeof createClient>>;
    company: { id: string };
    tier: SubscriptionTier;
  };

  const blocked = await assertNotDemoCompany(supabase, company.id);
  if (blocked) return blocked;

  if (!canUse(featureFor(kind), tier)) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from(kind)
    .insert({ company_id: company.id, name })
    .select("id, name, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "That name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const kind = (body.kind === "branches" ? "branches" : "departments") as Kind;
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ctx = await resolveCompanyContext();
  if ("error" in ctx && ctx.error) return ctx.error;
  const { supabase, company, tier } = ctx as Awaited<ReturnType<typeof resolveCompanyContext>> & {
    supabase: Awaited<ReturnType<typeof createClient>>;
    company: { id: string };
    tier: SubscriptionTier;
  };

  const blocked = await assertNotDemoCompany(supabase, company.id);
  if (blocked) return blocked;

  if (!canUse(featureFor(kind), tier)) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from(kind)
    .delete()
    .eq("id", id)
    .eq("company_id", company.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}

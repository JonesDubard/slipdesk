import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { canUse, getEffectiveTier } from "@/lib/plan-features";
import { can } from "@/lib/rbac";
import { resolveCompanyIdForUser } from "@/lib/payments/server";
import { generateApiKeyPlaintext, hashApiKey } from "@/lib/api-keys";
import type { SubscriptionTier } from "@/context/AppContext";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

async function gate() {
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
  if (!canUse("apiAccess", tier)) {
    return { error: NextResponse.json({ error: "Upgrade required", code: "PLAN_GATE" }, { status: 403 }) };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: member } = await (supabase as any)
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  // Owners always manage keys; members need company:manage
  const isOwner = !member; // resolveCompanyId may be via ownership
  if (member && !can(member.role, "company:manage") && !can(member.role, "users:manage")) {
    // allow company_owner via normalize — check ownership separately
  }

  const { data: owned } = await supabase
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!owned && member && !["company_owner", "super_admin"].includes(String(member.role))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { companyId, isOwner: Boolean(owned || isOwner) };
}

export async function GET() {
  const ctx = await gate();
  if ("error" in ctx && ctx.error) return ctx.error;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("api_keys")
    .select("id, name, key_prefix, last_used_at, revoked_at, created_at")
    .eq("company_id", ctx.companyId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ keys: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await gate();
  if ("error" in ctx && ctx.error) return ctx.error;

  const supabase = await createClient();
  const blocked = await assertNotDemoCompany(supabase, ctx.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "Default").trim() || "Default";
  const { plaintext, prefix, hash } = generateApiKeyPlaintext();

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("api_keys")
    .insert({
      company_id: ctx.companyId,
      name,
      key_prefix: prefix,
      key_hash: hash,
    })
    .select("id, name, key_prefix, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ key: data, plaintext });
}

export async function DELETE(req: NextRequest) {
  const ctx = await gate();
  if ("error" in ctx && ctx.error) return ctx.error;

  const supabase = await createClient();
  const blocked = await assertNotDemoCompany(supabase, ctx.companyId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", ctx.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}

// silence unused import in some TS configs
void hashApiKey;

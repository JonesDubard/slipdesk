import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { resolveAppCompanyAccess } from "@/lib/auth/resolve-app-company";
import { authorizeCompanyPermission } from "@/lib/auth/authorize-company-permission";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";

const TIER_LIMITS = {
  basic:    80,
  standard: 499,
  premium:  Infinity,
} as const;

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await resolveAppCompanyAccess(user.id, supabase);
  if (!access) return NextResponse.json({ error: "Company not found" }, { status: 403 });
  const gate = authorizeCompanyPermission(
    { companyId: access.companyId, role: access.role },
    "employee:create",
    "Company not found",
  );
  if (!gate.proceed) return NextResponse.json({ error: gate.error }, { status: 403 });

  const blocked = await assertNotDemoCompany(access.admin, gate.companyId);
  if (blocked) return blocked;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = access.admin as any;
  const { data: company } = await db
    .from("companies")
    .select("id, subscription_tier, billing_bypass, is_locked")
    .eq("id", gate.companyId)
    .maybeSingle();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 400 });
  }

  if (company.is_locked) {
    return NextResponse.json({
      error: "Your account is locked. Please contact support or renew your subscription.",
      code:  "ACCOUNT_LOCKED",
    }, { status: 403 });
  }

  if (!company.billing_bypass) {
    const tier  = (company.subscription_tier ?? "basic") as keyof typeof TIER_LIMITS;
    const limit = TIER_LIMITS[tier];

    const { count } = await db
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("company_id", gate.companyId)
      .eq("is_archived", false);

    const current = count ?? 0;

    if (current >= limit) {
      const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
      return NextResponse.json({
        error: `Your ${tierLabel} plan allows up to ${limit === Infinity ? "unlimited" : limit} active employees. You have ${current}. Upgrade your plan to add more.`,
        code:  "EMPLOYEE_LIMIT_REACHED",
        current,
        limit,
        tier,
      }, { status: 403 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const access = await resolveAppCompanyAccess(user.id, supabase);
    if (!access) return NextResponse.json({ error: "Company not found" }, { status: 403 });
    const gate = authorizeCompanyPermission(
      { companyId: access.companyId, role: access.role },
      "employee:view",
      "Company not found",
    );
    if (!gate.proceed) {
      return NextResponse.json({ error: gate.error }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (access.admin as any)
      .from("employees")
      .select(`
        id,
        employee_number,
        full_name,
        department,
        job_title,
        currency,
        rate,
        standard_hours
      `)
      .eq("company_id", gate.companyId);

    if (error) throw error;

    return NextResponse.json(data);
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { error: "Failed to fetch employees" },
      { status: 500 }
    );
  }
}

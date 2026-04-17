import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { canUse } from "@/lib/plan-features";

const TIER_LIMITS = {
  basic:    80,
  standard: 499,
  premium:  Infinity,
} as const;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get company with tier info
  const { data: company } = await supabase
    .from("companies")
    .select("id, subscription_tier, billing_bypass, is_locked")
    .eq("owner_id", user.id)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 400 });
  }

  // Locked accounts cannot add employees
  if (company.is_locked) {
    return NextResponse.json({
      error: "Your account is locked. Please contact support or renew your subscription.",
      code:  "ACCOUNT_LOCKED",
    }, { status: 403 });
  }

  // Check employee limit unless billing_bypass
  if (!company.billing_bypass) {
    const tier  = (company.subscription_tier ?? "basic") as keyof typeof TIER_LIMITS;
    const limit = TIER_LIMITS[tier];

    const { count } = await supabase
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("company_id", company.id)
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
}


export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
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
      `);

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
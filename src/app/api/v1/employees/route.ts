import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashApiKey } from "@/lib/api-keys";
import { canUse, getEffectiveTier } from "@/lib/plan-features";
import type { SubscriptionTier } from "@/context/AppContext";

async function authenticateBearer(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return { error: NextResponse.json({ error: "Missing Bearer token" }, { status: 401 }) };

  const plaintext = match[1].trim();
  const hash = hashApiKey(plaintext);
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: key } = await (admin as any)
    .from("api_keys")
    .select("id, company_id, revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();

  if (!key || key.revoked_at) {
    return { error: NextResponse.json({ error: "Invalid API key" }, { status: 401 }) };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company } = await (admin as any)
    .from("companies")
    .select("id, name, subscription_tier, billing_bypass")
    .eq("id", key.company_id)
    .maybeSingle();

  if (!company) return { error: NextResponse.json({ error: "Company not found" }, { status: 403 }) };

  const tier = getEffectiveTier(
    (company.subscription_tier as SubscriptionTier) || "basic",
    Boolean(company.billing_bypass),
  );
  if (!canUse("apiAccess", tier)) {
    return { error: NextResponse.json({ error: "API Access requires Enterprise", code: "PLAN_GATE" }, { status: 403 }) };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", key.id);

  return { companyId: company.id as string, companyName: company.name as string, admin };
}

/** Public Enterprise API — list employees for the authenticated company. */
export async function GET(req: NextRequest) {
  const auth = await authenticateBearer(req);
  if ("error" in auth && auth.error) return auth.error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (auth.admin as any)
    .from("employees")
    .select("id, employee_number, first_name, last_name, email, department, branch, job_title, is_active, currency, rate")
    .eq("company_id", auth.companyId)
    .order("last_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    company: auth.companyName,
    employees: (data ?? []).map((e: Record<string, unknown>) => ({
      id: e.id,
      employeeNumber: e.employee_number,
      firstName: e.first_name,
      lastName: e.last_name,
      email: e.email,
      department: e.department,
      branch: e.branch,
      jobTitle: e.job_title,
      isActive: e.is_active,
      currency: e.currency,
      rate: e.rate,
    })),
  });
}

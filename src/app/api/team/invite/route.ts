import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";
import { issueTeamInvite } from "@/lib/auth/issue-team-invite";
import { canInviteToCompany, planAllowsTeamInvites } from "@/lib/auth/team-invite-policy";
import type { SubscriptionTier } from "@/context/AppContext";

function appBaseUrl(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return req.nextUrl.origin || "https://slipdesk.com";
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { data: company, error: coErr } = await supabase
    .from("companies")
    .select("id, name, subscription_tier, billing_bypass")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (coErr || !company) {
    return NextResponse.json(
      { error: "You don't have permission to invite people to this organization.", code: "forbidden" },
      { status: 403 },
    );
  }

  const planOk = planAllowsTeamInvites(
    (company.subscription_tier ?? "basic") as SubscriptionTier,
    Boolean(company.billing_bypass),
  );
  if (!canInviteToCompany({ isCompanyOwner: true, isPlatformAdmin: false, planAllowsInvites: planOk })) {
    return NextResponse.json(
      { error: "Team invitations are available on the Enterprise plan.", code: "forbidden" },
      { status: 403 },
    );
  }

  const blocked = await assertNotDemoCompany(supabase, company.id);
  if (blocked) return blocked;

  await supabase.from("profiles").update({ company_id: company.id }).eq("id", user.id);

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server auth is not configured" }, { status: 503 });
  }

  const result = await issueTeamInvite(admin, {
    companyId: company.id,
    companyName: company.name,
    email: String(body.email ?? ""),
    fullName: String(body.fullName ?? body.name ?? ""),
    role: body.role,
    invitedBy: user.id,
    resend: Boolean(body.resend),
    appUrl: appBaseUrl(req),
  });

  return NextResponse.json(
    {
      success: result.ok,
      code: result.code,
      error: result.error,
      email: result.email,
      emailSent: result.emailSent,
      emailError: result.emailError,
      inviteUrl: result.inviteUrl,
      accountExists: result.accountExists,
      companyId: result.ok ? result.companyId : undefined,
    },
    { status: result.status },
  );
}

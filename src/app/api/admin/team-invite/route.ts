import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { isPlatformAdminRole } from "@/lib/auth/platform-admin";
import { assertNotDemoCompany } from "@/lib/demo/assert-not-demo";
import { issueTeamInvite } from "@/lib/auth/issue-team-invite";
import { canInviteToCompany } from "@/lib/auth/team-invite-policy";

function appBaseUrl(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return req.nextUrl.origin || "https://slipdesk.com";
}

/** Slipdesk platform admin starts the same invitation used by a company owner. */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isPlatformAdmin = isPlatformAdminRole(profile?.role);
  if (!canInviteToCompany({ isCompanyOwner: false, isPlatformAdmin, planAllowsInvites: false })) {
    return NextResponse.json(
      { error: "You don't have permission to invite people to this organization.", code: "forbidden" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const companyId = String(body.companyId ?? "").trim();
  const companyName = String(body.companyName ?? "").trim();
  if (!companyId && !companyName) {
    return NextResponse.json({ error: "Enter the company id or the exact company name.", code: "invalid" }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server auth is not configured" }, { status: 503 });
  }
  // Hand-written Database types reject some selects as `never`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  let company: { id: string; name: string } | null = null;
  if (companyId) {
    const { data } = await db
      .from("companies")
      .select("id, name")
      .eq("id", companyId)
      .maybeSingle();
    company = data ?? null;
  } else {
    const { data } = await db
      .from("companies")
      .select("id, name")
      .eq("name", companyName);
    const matches = (data ?? []) as { id: string; name: string }[];
    if (matches.length > 1) {
      return NextResponse.json(
        { error: "More than one company uses that name. Enter the company id instead.", code: "ambiguous" },
        { status: 409 },
      );
    }
    company = matches[0] ?? null;
  }

  if (!company) {
    return NextResponse.json({ error: "Company not found.", code: "not_found" }, { status: 404 });
  }

  const blocked = await assertNotDemoCompany(db, company.id);
  if (blocked) return blocked;

  const result = await issueTeamInvite(db, {
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
      companyId: result.ok ? company.id : undefined,
      companyName: result.ok ? company.name : undefined,
    },
    { status: result.status },
  );
}

import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { isInviteExpired } from "@/lib/auth/team-invite-policy";
import { hashInviteToken } from "@/lib/auth/invite-token";
import { ROLE_LABELS, type Role } from "@/lib/rbac";

/** Public preview of an invitation token. Does not accept the invite. */
export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get("token") ?? "").trim();
  if (!token || token.length < 20) {
    return NextResponse.json({
      valid: false,
      reason: "invalid",
      message: "This invitation link is invalid or has already been used.",
    });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server auth is not configured" }, { status: 503 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  const { data, error } = await db
    .from("company_members")
    .select("status, invited_email, invited_name, role, invite_expires_at, company_id")
    .eq("invite_token_hash", hashInviteToken(token))
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({
      valid: false,
      reason: "invalid",
      message: "This invitation link is invalid or has already been used.",
    });
  }

  if (data.status === "active") {
    return NextResponse.json({
      valid: false,
      reason: "used",
      message: "This invitation has already been accepted. Sign in with your password.",
    });
  }

  if (isInviteExpired(data.invite_expires_at, new Date())) {
    return NextResponse.json({
      valid: false,
      reason: "expired",
      message: "This invitation has expired. Ask your company owner to send a new one.",
    });
  }

  const { data: company } = await db
    .from("companies")
    .select("name")
    .eq("id", data.company_id)
    .maybeSingle();

  const role = (data.role ?? "payroll_officer") as Role;
  return NextResponse.json({
    valid: true,
    email: data.invited_email,
    fullName: data.invited_name,
    companyName: company?.name ?? "your organization",
    role,
    roleLabel: ROLE_LABELS[role] ?? role,
    expiresAt: data.invite_expires_at,
  });
}

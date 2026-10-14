import { findAuthUserByEmail } from "@/lib/employee-portal/find-auth-user";
import { buildInviteUrl, teamInviteEmailHtml } from "@/lib/auth/team-invite-email";
import { generateInviteToken, inviteExpiresAt } from "@/lib/auth/invite-token";
import {
  decideInvite,
  safeEmailError,
  type ExistingCompanyInvite,
} from "@/lib/auth/team-invite-policy";
import { resendFromAddress } from "@/lib/email/resend-from";
import type { Role } from "@/lib/rbac";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = any;

export interface IssueInviteInput {
  companyId: string;
  companyName: string;
  email: string;
  fullName: string;
  role: unknown;
  invitedBy: string;
  resend?: boolean;
  appUrl: string;
  now?: Date;
}

export interface IssueInviteResult {
  ok: boolean;
  status: number;
  code: string;
  error?: string;
  email?: string;
  emailSent?: boolean;
  emailError?: string;
  inviteUrl?: string;
  accountExists?: boolean;
  companyId?: string;
  role?: Role;
}

function missingColumn(error: { message?: string; code?: string } | null): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  return msg.includes("invite_token_hash") || msg.includes("invited_name") || msg.includes("schema cache");
}

async function sendInviteEmail(opts: {
  to: string;
  companyName: string;
  recipientName: string;
  role: Role;
  inviteUrl: string;
  token: string;
}): Promise<{ emailSent: boolean; emailError?: string }> {
  if (!process.env.RESEND_API_KEY) {
    return {
      emailSent: false,
      emailError: "Email is not configured. Set RESEND_API_KEY and try Resend.",
    };
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const sent = await resend.emails.send({
      from: resendFromAddress(),
      to: opts.to,
      subject: `You're invited to ${opts.companyName.replace(/[\r\n]/g, " ")} on Slipdesk`,
      html: teamInviteEmailHtml({
        companyName: opts.companyName,
        recipientName: opts.recipientName,
        role: opts.role,
        inviteUrl: opts.inviteUrl,
      }),
    });
    if (sent.error) {
      console.error("[team-invite] email delivery failed");
      return { emailSent: false, emailError: safeEmailError(sent.error.message ?? "", opts.token) };
    }
    return { emailSent: true };
  } catch {
    console.error("[team-invite] email delivery failed");
    return { emailSent: false, emailError: "Email could not be sent." };
  }
}

export async function issueTeamInvite(admin: AdminDb, input: IssueInviteInput): Promise<IssueInviteResult> {
  const now = input.now ?? new Date();
  const email = input.email.trim().toLowerCase();

  const { data: rows, error: listErr } = await admin
    .from("company_members")
    .select("id, company_id, user_id, role, invited_email, status, invite_expires_at, invite_token_hash")
    .eq("invited_email", email);

  if (listErr) {
    if (missingColumn(listErr)) {
      return {
        ok: false,
        status: 503,
        code: "migration_required",
        error: "Team invitations require migration 0020_team_invite_tokens.sql to be applied in Supabase.",
      };
    }
    const msg = listErr.message ?? "Could not check existing invitations.";
    if (msg.toLowerCase().includes("does not exist")) {
      return {
        ok: false,
        status: 503,
        code: "migration_required",
        error: "Team management requires the platform migrations to be applied in Supabase.",
      };
    }
    return { ok: false, status: 400, code: "lookup_failed", error: "Could not check existing invitations." };
  }

  const onCompany = (rows ?? []).find(
    (row: { company_id: string }) => row.company_id === input.companyId,
  ) as {
    id: string;
    status: "pending" | "active";
    invite_expires_at: string | null;
    user_id: string | null;
  } | undefined;

  let alreadyBelongs = onCompany?.status === "active";
  let otherActiveCompanyId: string | null = null;
  for (const row of rows ?? []) {
    if (row.company_id !== input.companyId && row.status === "active") {
      otherActiveCompanyId = row.company_id;
    }
  }

  let accountExists = false;
  const authUser = await findAuthUserByEmail(email);
  if (authUser?.id) {
    accountExists = true;
    const { data: owned } = await admin
      .from("companies")
      .select("id")
      .eq("owner_id", authUser.id)
      .limit(1);
    const ownedId = owned?.[0]?.id as string | undefined;
    if (ownedId === input.companyId) alreadyBelongs = true;
    else if (ownedId) otherActiveCompanyId = ownedId;

    const { data: memberships } = await admin
      .from("company_members")
      .select("company_id, status")
      .eq("user_id", authUser.id)
      .eq("status", "active");
    for (const member of memberships ?? []) {
      if (member.company_id === input.companyId) alreadyBelongs = true;
      else otherActiveCompanyId = member.company_id;
    }
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, company_id")
    .eq("email", email)
    .maybeSingle();
  if (profile?.id) accountExists = true;
  const profileCompany = profile?.company_id as string | null | undefined;
  if (profileCompany === input.companyId) alreadyBelongs = true;
  else if (profileCompany) otherActiveCompanyId = otherActiveCompanyId ?? profileCompany;

  const existing: ExistingCompanyInvite | null = onCompany
    ? {
        id: onCompany.id,
        status: onCompany.status,
        inviteExpiresAt: onCompany.invite_expires_at,
      }
    : null;

  const decision = decideInvite({
    email,
    nameRaw: input.fullName,
    roleRaw: input.role,
    resend: Boolean(input.resend),
    now,
    existingOnCompany: existing,
    alreadyBelongs,
    otherActiveCompanyId,
  });

  if (decision.action === "reject") {
    const status = decision.code === "invalid_email" || decision.code === "invalid_name" || decision.code === "invalid_role"
      ? 400
      : 409;
    return { ok: false, status, code: decision.code, error: decision.message, email: email };
  }

  const { token, tokenHash } = generateInviteToken();
  const expires = inviteExpiresAt(now);
  const payload = {
    invited_email: decision.email,
    invited_name: decision.name,
    role: decision.role,
    status: "pending" as const,
    user_id: null,
    invite_token_hash: tokenHash,
    invite_expires_at: expires,
    accepted_at: null,
    invited_by: input.invitedBy,
  };

  const write = decision.action === "create"
    ? await admin.from("company_members").insert({ company_id: input.companyId, ...payload }).select("id").maybeSingle()
    : await admin.from("company_members").update(payload).eq("id", decision.memberId).eq("status", "pending").select("id").maybeSingle();

  if (write.error || !write.data) {
    const msg = write.error?.message ?? "Could not save invite.";
    if (write.error?.code === "23505" || msg.toLowerCase().includes("duplicate")) {
      return {
        ok: false,
        status: 409,
        code: "pending",
        error: "An invitation for this email is already pending. Use Resend if they did not get the email.",
        email: decision.email,
      };
    }
    if (missingColumn(write.error)) {
      return {
        ok: false,
        status: 503,
        code: "migration_required",
        error: "Team invitations require migration 0020_team_invite_tokens.sql to be applied in Supabase.",
      };
    }
    console.error("[team-invite] save failed");
    return { ok: false, status: 400, code: "save_failed", error: "Could not save invite." };
  }

  const inviteUrl = buildInviteUrl(input.appUrl, token);
  const delivery = await sendInviteEmail({
    to: decision.email,
    companyName: input.companyName,
    recipientName: decision.name,
    role: decision.role,
    inviteUrl,
    token,
  });

  return {
    ok: true,
    status: 200,
    code: delivery.emailSent ? (decision.action === "refresh" ? "resent" : "created") : "email_failed",
    email: decision.email,
    emailSent: delivery.emailSent,
    emailError: delivery.emailError,
    inviteUrl: delivery.emailSent ? undefined : inviteUrl,
    accountExists,
    companyId: input.companyId,
    role: decision.role,
  };
}

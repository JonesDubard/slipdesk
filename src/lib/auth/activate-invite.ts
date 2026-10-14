import type { createAdminClient } from "@/lib/supabase/admin";
import {
  decideInviteAcceptance,
  legacyEmailInviteEligible,
  type AcceptInviteRow,
} from "@/lib/auth/team-invite-policy";
import { hashInviteToken } from "@/lib/auth/invite-token";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = any;

export interface ActivateInviteResult {
  activated: boolean;
  companyId?: string;
  reason?: string;
  message?: string;
}

type MemberInviteRow = {
  id: string;
  company_id: string;
  status: "pending" | "active";
  invited_email: string | null;
  invite_expires_at: string | null;
  user_id: string | null;
  invite_token_hash: string | null;
  invited_name: string | null;
};

function columnMissing(error: { message?: string } | null): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  return msg.includes("invite_token_hash") || msg.includes("schema cache") || msg.includes("invite_expires_at");
}

/**
 * Activates a pending team invite for the signed-in user (service role).
 * Tokenized invites require the raw token. Older rows with no token hash
 * still match by email so in-flight invitations keep working.
 * RBAC role stays on company_members. Only profile.company_id is updated.
 */
export async function activatePendingInviteForUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  email: string | undefined,
  opts?: { token?: string | null; userMetadata?: Record<string, unknown> | null },
): Promise<ActivateInviteResult> {
  const clean = email?.trim().toLowerCase() ?? "";
  const token = (opts?.token ?? "").trim()
    || String(opts?.userMetadata?.invite_token ?? "").trim();

  if (token) {
    return activateWithToken(admin as AdminDb, userId, clean, token, opts?.userMetadata ?? null);
  }
  if (!clean) return { activated: false };
  return activateLegacyByEmail(admin as AdminDb, userId, clean);
}

async function activateWithToken(
  admin: AdminDb,
  userId: string,
  email: string,
  token: string,
  userMetadata: Record<string, unknown> | null,
): Promise<ActivateInviteResult> {
  const tokenHash = hashInviteToken(token);
  const { data, error } = await admin
    .from("company_members")
    .select("id, company_id, status, invited_email, invite_expires_at, user_id, invite_token_hash, invited_name")
    .eq("invite_token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    if (columnMissing(error)) {
      return {
        activated: false,
        reason: "migration_required",
        message: "Invitation acceptance requires migration 0020_team_invite_tokens.sql.",
      };
    }
    console.error("[team-invite] lookup failed");
    return { activated: false, reason: "invalid", message: "This invitation link is invalid or has already been used." };
  }

  const row = data as MemberInviteRow | null;
  const otherCompanyId = row
    ? await activeCompanyElsewhere(admin, userId, row.company_id)
    : null;

  const decision = decideInviteAcceptance({
    invite: toAcceptRow(row),
    userEmail: email,
    userId,
    now: new Date(),
    activeOtherCompanyId: otherCompanyId,
  });

  if (!decision.ok) {
    return { activated: false, reason: decision.code, message: decision.message };
  }
  if (decision.alreadyActive) {
    await (admin as AdminDb)
      .from("company_members")
      .update({ invite_token_hash: null })
      .eq("id", decision.memberId);
    await linkProfile(admin, userId, decision.companyId);
    await clearInviteToken(admin, userId, userMetadata, row?.invited_name ?? null);
    return { activated: true, companyId: decision.companyId };
  }

  const { data: updated, error: memberErr } = await admin
    .from("company_members")
    .update({
      status: "active",
      user_id: userId,
      accepted_at: new Date().toISOString(),
      invite_token_hash: null,
    })
    .eq("id", decision.memberId)
    .eq("status", "pending")
    .select("id, company_id")
    .maybeSingle();

  if (memberErr || !updated) {
    console.error("[team-invite] activate member failed");
    return {
      activated: false,
      reason: "used",
      message: "This invitation has already been accepted.",
    };
  }

  await linkProfile(admin, userId, decision.companyId);
  await clearInviteToken(admin, userId, userMetadata, row?.invited_name ?? null);
  return { activated: true, companyId: decision.companyId };
}

async function activateLegacyByEmail(
  admin: AdminDb,
  userId: string,
  email: string,
): Promise<ActivateInviteResult> {
  const tokenized = await admin
    .from("company_members")
    .select("id, company_id, status, invited_email, invite_token_hash")
    .eq("invited_email", email)
    .eq("status", "pending")
    .is("invite_token_hash", null)
    .limit(1)
    .maybeSingle();

  if (tokenized.error && columnMissing(tokenized.error)) {
    const { data: invite } = await admin
      .from("company_members")
      .select("id, company_id")
      .eq("invited_email", email)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();
    if (!invite) return { activated: false };
    return markActive(admin, userId, invite.id, invite.company_id);
  }

  const invite = tokenized.data as {
    id: string;
    company_id: string;
    status: "pending" | "active";
    invite_token_hash: string | null;
  } | null;

  if (!invite || !legacyEmailInviteEligible({
    status: invite.status,
    inviteTokenHash: invite.invite_token_hash,
  })) {
    return { activated: false };
  }

  const elsewhere = await activeCompanyElsewhere(admin, userId, invite.company_id);
  if (elsewhere) {
    return {
      activated: false,
      reason: "other_org",
      message: "This account already belongs to another organization.",
    };
  }

  return markActive(admin, userId, invite.id, invite.company_id);
}

async function markActive(
  admin: AdminDb,
  userId: string,
  memberId: string,
  companyId: string,
): Promise<ActivateInviteResult> {
  const { error: memberErr } = await admin
    .from("company_members")
    .update({ status: "active", user_id: userId, accepted_at: new Date().toISOString() })
    .eq("id", memberId)
    .eq("status", "pending");

  if (memberErr) {
    const retry = await admin
      .from("company_members")
      .update({ status: "active", user_id: userId })
      .eq("id", memberId)
      .eq("status", "pending");
    if (retry.error) {
      console.error("[team-invite] activate member failed");
      return { activated: false };
    }
  }

  await linkProfile(admin, userId, companyId);
  return { activated: true, companyId };
}

async function activeCompanyElsewhere(
  admin: AdminDb,
  userId: string,
  inviteCompanyId: string,
): Promise<string | null> {
  const { data: owned } = await admin
    .from("companies")
    .select("id")
    .eq("owner_id", userId)
    .limit(1);
  const ownedId = owned?.[0]?.id as string | undefined;
  if (ownedId && ownedId !== inviteCompanyId) return ownedId;

  const { data: memberships } = await admin
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .eq("status", "active");
  for (const member of memberships ?? []) {
    if (member.company_id !== inviteCompanyId) return member.company_id as string;
  }
  return null;
}

function toAcceptRow(row: MemberInviteRow | null): AcceptInviteRow | null {
  if (!row?.invited_email) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    status: row.status,
    invitedEmail: row.invited_email,
    inviteExpiresAt: row.invite_expires_at,
    userId: row.user_id,
  };
}

async function linkProfile(admin: AdminDb, userId: string, companyId: string): Promise<void> {
  await admin.from("profiles").update({ company_id: companyId }).eq("id", userId);
}

async function clearInviteToken(
  admin: AdminDb,
  userId: string,
  userMetadata: Record<string, unknown> | null,
  invitedName: string | null,
): Promise<void> {
  if (!userMetadata || !("invite_token" in userMetadata)) {
    if (!invitedName) return;
  }
  const next: Record<string, unknown> = { ...(userMetadata ?? {}) };
  delete next.invite_token;
  if (invitedName) next.full_name = invitedName;
  try {
    await admin.auth.admin.updateUserById(userId, { user_metadata: next });
  } catch {
    // Membership is already active and the token hash is cleared.
  }
}

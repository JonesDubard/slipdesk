import type { createAdminClient } from "@/lib/supabase/admin";
import {
  decideConfirmedEmailFallback,
  decideInviteAcceptance,
  type AcceptInviteRow,
  type EmailFallbackInvite,
} from "@/lib/auth/team-invite-policy";
import { hashInviteToken } from "@/lib/auth/invite-token";
import { isBlankOwnedCompany } from "@/lib/auth/resolve-company";

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
 * The signup token (argument or user_metadata) is checked first by hash.
 * Email recovery is only for the lost-redirect case and stays unambiguous.
 * A confirmed email alone never accepts a hashed invitation.
 * RBAC role stays on company_members. Only profile.company_id is updated.
 */
export async function activatePendingInviteForUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  email: string | undefined,
  opts?: {
    token?: string | null;
    userMetadata?: Record<string, unknown> | null;
    emailConfirmed?: boolean;
  },
): Promise<ActivateInviteResult> {
  const clean = email?.trim().toLowerCase() ?? "";
  const token = (opts?.token ?? "").trim()
    || String(opts?.userMetadata?.invite_token ?? "").trim();

  if (token) {
    return activateWithToken(admin as AdminDb, userId, clean, token, opts?.userMetadata ?? null);
  }
  if (!clean) return { activated: false };
  return activateConfirmedEmailFallback(
    admin as AdminDb,
    userId,
    clean,
    Boolean(opts?.emailConfirmed),
    opts?.userMetadata ?? null,
  );
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

async function activateConfirmedEmailFallback(
  admin: AdminDb,
  userId: string,
  email: string,
  emailConfirmed: boolean,
  userMetadata: Record<string, unknown> | null,
): Promise<ActivateInviteResult> {
  const listed = await admin
    .from("company_members")
    .select("id, company_id, status, invited_email, invite_expires_at, user_id, invite_token_hash, invited_name")
    .eq("invited_email", email)
    .in("status", ["pending", "active"])
    .limit(20);

  if (listed.error) {
    if (columnMissing(listed.error)) {
      return {
        activated: false,
        reason: "migration_required",
        message: "Invitation acceptance requires migration 0020_team_invite_tokens.sql.",
      };
    }
    console.error("[team-invite] email fallback lookup failed");
    return { activated: false, reason: "invalid", message: "This invitation link is invalid or has already been used." };
  }

  const rows = (listed.data ?? []) as MemberInviteRow[];
  if (rows.length >= 20) {
    return {
      activated: false,
      reason: "ambiguous",
      message: "More than one invitation matches this email. Open the original invitation link.",
    };
  }
  const invites: EmailFallbackInvite[] = rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    status: row.status,
    invitedEmail: row.invited_email ?? "",
    inviteExpiresAt: row.invite_expires_at,
    userId: row.user_id,
    inviteTokenHash: row.invite_token_hash,
  }));

  const provisional = decideConfirmedEmailFallback({
    emailConfirmed,
    userEmail: email,
    userId,
    now: new Date(),
    invites,
    activeOtherCompanyId: null,
  });
  if (!provisional.ok) {
    if (provisional.code === "none") return { activated: false };
    return { activated: false, reason: provisional.code, message: provisional.message };
  }

  const elsewhere = await activeCompanyElsewhere(admin, userId, provisional.companyId);
  const decision = decideConfirmedEmailFallback({
    emailConfirmed,
    userEmail: email,
    userId,
    now: new Date(),
    invites,
    activeOtherCompanyId: elsewhere,
  });
  if (!decision.ok) {
    if (decision.code === "none") return { activated: false };
    return { activated: false, reason: decision.code, message: decision.message };
  }

  const row = rows.find((item) => item.id === decision.memberId) ?? null;
  if (decision.alreadyActive) {
    await linkProfile(admin, userId, decision.companyId);
    await clearInviteToken(admin, userId, userMetadata, row?.invited_name ?? null);
    return { activated: true, companyId: decision.companyId };
  }

  const marked = await markActive(admin, userId, decision.memberId, decision.companyId);
  if (marked.activated) {
    await clearInviteToken(admin, userId, userMetadata, row?.invited_name ?? null);
  }
  return marked;
}

function claimPendingMember(
  admin: AdminDb,
  userId: string,
  memberId: string,
  patch: Record<string, string>,
) {
  let update = admin
    .from("company_members")
    .update(patch)
    .eq("id", memberId)
    .eq("status", "pending");
  if (/^[0-9a-f-]{36}$/i.test(userId)) {
    update = update.or(`user_id.is.null,user_id.eq.${userId}`);
  }
  return update.select("id").maybeSingle();
}

async function markActive(
  admin: AdminDb,
  userId: string,
  memberId: string,
  companyId: string,
): Promise<ActivateInviteResult> {
  let result = await claimPendingMember(admin, userId, memberId, {
    status: "active",
    user_id: userId,
    accepted_at: new Date().toISOString(),
  });
  if (result.error) {
    result = await claimPendingMember(admin, userId, memberId, {
      status: "active",
      user_id: userId,
    });
  }
  if (result.error || !result.data) {
    console.error("[team-invite] activate member failed");
    return {
      activated: false,
      reason: "used",
      message: "This invitation has already been accepted.",
    };
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
    .select("id, name")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);
  for (const row of owned ?? []) {
    const ownedId = row.id as string;
    if (!ownedId || ownedId === inviteCompanyId) continue;
    if (isBlankOwnedCompany({ name: row.name as string | null })) continue;
    return ownedId;
  }

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

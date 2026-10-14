/**
 * Pure rules for team invitations.
 * Routes and activation call these so authorization, expiry, and reuse
 * stay consistent and testable without a database.
 */

import { canUse, getEffectiveTier } from "@/lib/plan-features";
import { ROLE_LABELS, type Role } from "@/lib/rbac";
import type { SubscriptionTier } from "@/context/AppContext";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Roles a company owner may assign. super_admin stays platform-only. */
export const ASSIGNABLE_INVITE_ROLES: Role[] = [
  "company_owner",
  "finance_manager",
  "hr_manager",
  "payroll_officer",
  "auditor",
  "executive",
  "employee",
];

export type InviteStatus = "pending" | "active";

export type InviteRejectCode =
  | "invalid_email"
  | "invalid_name"
  | "invalid_role"
  | "pending"
  | "active"
  | "other_org";

export type AcceptRejectCode = "invalid" | "expired" | "used" | "email_mismatch" | "other_org";

export interface ExistingCompanyInvite {
  id: string;
  status: InviteStatus;
  inviteExpiresAt: string | null;
}

export function planAllowsTeamInvites(
  tier: SubscriptionTier,
  billingBypass: boolean,
): boolean {
  return canUse("advancedRoles", getEffectiveTier(tier, billingBypass));
}

/**
 * Company owners on a plan that includes team management, or a Slipdesk
 * platform admin helping that customer. Membership in the company is not enough.
 */
export function canInviteToCompany(opts: {
  isCompanyOwner: boolean;
  isPlatformAdmin: boolean;
  planAllowsInvites: boolean;
}): boolean {
  if (opts.isPlatformAdmin) return true;
  return opts.isCompanyOwner && opts.planAllowsInvites;
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidInviteEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizePersonName(
  raw: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: "Enter their full name." };
  if (name.length > 120) return { ok: false, error: "Name is too long." };
  if (/[<>]/.test(name) || /[\u0000-\u001F]/.test(name)) {
    return { ok: false, error: "Name contains invalid characters." };
  }
  return { ok: true, name };
}

export function parseAssignableRole(raw: unknown): Role | null {
  if (typeof raw !== "string") return null;
  return ASSIGNABLE_INVITE_ROLES.includes(raw as Role) ? (raw as Role) : null;
}

export function isInviteExpired(expiresAt: string | null, now: Date): boolean {
  if (!expiresAt) return true;
  const at = new Date(expiresAt).getTime();
  if (Number.isNaN(at)) return true;
  return at <= now.getTime();
}

/** Email-only activation is limited to invites created before tokens existed. */
export function legacyEmailInviteEligible(invite: {
  status: InviteStatus;
  inviteTokenHash: string | null;
}): boolean {
  return invite.status === "pending" && !invite.inviteTokenHash;
}

export function decideInvite(opts: {
  email: string;
  nameRaw: string;
  roleRaw: unknown;
  resend: boolean;
  now: Date;
  existingOnCompany: ExistingCompanyInvite | null;
  alreadyBelongs: boolean;
  otherActiveCompanyId: string | null;
}):
  | { action: "create"; email: string; name: string; role: Role }
  | { action: "refresh"; memberId: string; email: string; name: string; role: Role }
  | { action: "reject"; code: InviteRejectCode; message: string } {
  const email = normalizeInviteEmail(opts.email);
  if (!isValidInviteEmail(email)) {
    return { action: "reject", code: "invalid_email", message: "Enter a valid email address." };
  }
  const nameResult = normalizePersonName(opts.nameRaw);
  if (!nameResult.ok) {
    return { action: "reject", code: "invalid_name", message: nameResult.error };
  }
  const role = parseAssignableRole(opts.roleRaw);
  if (!role) {
    return { action: "reject", code: "invalid_role", message: "Select a valid role." };
  }
  if (opts.otherActiveCompanyId) {
    return {
      action: "reject",
      code: "other_org",
      message: "That email already belongs to another organization. Use a different work email.",
    };
  }
  if (opts.alreadyBelongs) {
    return {
      action: "reject",
      code: "active",
      message: "This person already has an active account on your team.",
    };
  }
  const existing = opts.existingOnCompany;
  if (existing?.status === "active") {
    return {
      action: "reject",
      code: "active",
      message: "This person already has an active account on your team.",
    };
  }
  if (existing?.status === "pending") {
    const expired = isInviteExpired(existing.inviteExpiresAt, opts.now);
    if (!expired && !opts.resend) {
      return {
        action: "reject",
        code: "pending",
        message: "An invitation for this email is already pending. Use Resend if they did not get the email.",
      };
    }
    return { action: "refresh", memberId: existing.id, email, name: nameResult.name, role };
  }
  return { action: "create", email, name: nameResult.name, role };
}

export interface AcceptInviteRow {
  id: string;
  companyId: string;
  status: InviteStatus;
  invitedEmail: string;
  inviteExpiresAt: string | null;
  userId: string | null;
}

export function decideInviteAcceptance(opts: {
  invite: AcceptInviteRow | null;
  userEmail: string;
  userId: string;
  now: Date;
  activeOtherCompanyId: string | null;
}):
  | { ok: true; companyId: string; memberId: string; alreadyActive: boolean }
  | { ok: false; code: AcceptRejectCode; message: string } {
  const invite = opts.invite;
  if (!invite) {
    return {
      ok: false,
      code: "invalid",
      message: "This invitation link is invalid or has already been used.",
    };
  }
  const email = normalizeInviteEmail(opts.userEmail);
  if (!email || email !== normalizeInviteEmail(invite.invitedEmail)) {
    return {
      ok: false,
      code: "email_mismatch",
      message: "Sign in with the invited email address to accept this invitation.",
    };
  }
  if (invite.status === "active") {
    if (invite.userId === opts.userId) {
      return { ok: true, companyId: invite.companyId, memberId: invite.id, alreadyActive: true };
    }
    return {
      ok: false,
      code: "used",
      message: "This invitation has already been accepted.",
    };
  }
  if (isInviteExpired(invite.inviteExpiresAt, opts.now)) {
    return {
      ok: false,
      code: "expired",
      message: "This invitation has expired. Ask your company owner to send a new one.",
    };
  }
  if (opts.activeOtherCompanyId && opts.activeOtherCompanyId !== invite.companyId) {
    return {
      ok: false,
      code: "other_org",
      message: "This account already belongs to another organization.",
    };
  }
  return { ok: true, companyId: invite.companyId, memberId: invite.id, alreadyActive: false };
}

/** Acceptance never follows a caller-supplied company id. */
export function acceptedCompanyId(decision: { ok: true; companyId: string }): string {
  return decision.companyId;
}

export type EmailFallbackCode =
  | "unconfirmed"
  | "email_mismatch"
  | "ambiguous"
  | "expired"
  | "used"
  | "none"
  | "other_org"
  | "tokenized";

export interface EmailFallbackInvite extends AcceptInviteRow {
  inviteTokenHash: string | null;
}

/**
 * Lost-redirect recovery when the signup token is not available.
 * Hashed invites are not accepted by email alone. A confirmed email is
 * necessary and not sufficient: the match must be unique, pending, and unexpired.
 */
export function decideConfirmedEmailFallback(opts: {
  emailConfirmed: boolean;
  userEmail: string;
  userId: string;
  now: Date;
  invites: EmailFallbackInvite[];
  activeOtherCompanyId: string | null;
}):
  | { ok: true; companyId: string; memberId: string; alreadyActive: boolean }
  | { ok: false; code: EmailFallbackCode; message: string } {
  const email = normalizeInviteEmail(opts.userEmail);
  const matching = email
    ? opts.invites.filter((row) => normalizeInviteEmail(row.invitedEmail) === email)
    : [];

  if (!email || (opts.invites.length > 0 && matching.length === 0)) {
    return {
      ok: false,
      code: "email_mismatch",
      message: "Sign in with the invited email address to accept this invitation.",
    };
  }
  if (matching.length === 0) {
    return {
      ok: false,
      code: "none",
      message: "No pending invitation matches this email.",
    };
  }
  if (!opts.emailConfirmed) {
    return {
      ok: false,
      code: "unconfirmed",
      message: "Confirm your email before this invitation can be accepted.",
    };
  }

  const pending = matching.filter((row) => row.status === "pending");
  const active = matching.filter((row) => row.status === "active");

  if (pending.length > 1) {
    return {
      ok: false,
      code: "ambiguous",
      message: "More than one pending invitation matches this email. Open the invitation link for the organization you were invited to.",
    };
  }

  if (pending.length === 1) {
    const invite = pending[0];
    if (!legacyEmailInviteEligible({ status: invite.status, inviteTokenHash: invite.inviteTokenHash })) {
      return {
        ok: false,
        code: "tokenized",
        message: "This invitation must be opened from the original invitation link.",
      };
    }
    if (isInviteExpired(invite.inviteExpiresAt, opts.now)) {
      return {
        ok: false,
        code: "expired",
        message: "This invitation has expired. Ask your company owner to send a new one.",
      };
    }
    if (invite.userId && invite.userId !== opts.userId) {
      return {
        ok: false,
        code: "used",
        message: "This invitation has already been accepted.",
      };
    }
    if (opts.activeOtherCompanyId && opts.activeOtherCompanyId !== invite.companyId) {
      return {
        ok: false,
        code: "other_org",
        message: "This account already belongs to another organization.",
      };
    }
    return { ok: true, companyId: invite.companyId, memberId: invite.id, alreadyActive: false };
  }

  const mine = active.filter((row) => row.userId === opts.userId);
  const others = active.filter((row) => row.userId !== opts.userId);
  if (mine.length === 1 && others.length === 0) {
    return { ok: true, companyId: mine[0].companyId, memberId: mine[0].id, alreadyActive: true };
  }
  if (mine.length > 1 || (mine.length === 1 && others.length > 0)) {
    return {
      ok: false,
      code: "ambiguous",
      message: "More than one organization matches this email. Ask Slipdesk support to set the active company.",
    };
  }
  if (others.length > 0) {
    return {
      ok: false,
      code: "used",
      message: "This invitation has already been accepted.",
    };
  }
  return {
    ok: false,
    code: "none",
    message: "No pending invitation matches this email.",
  };
}

export function canAccessOrganization(actorCompanyId: string, resourceCompanyId: string): boolean {
  return actorCompanyId.length > 0 && actorCompanyId === resourceCompanyId;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeEmailError(message: string, token: string): string {
  const clean = message.trim();
  if (!clean || (token && clean.includes(token))) return "Email could not be sent.";
  return clean.slice(0, 200);
}

/** A failed send leaves the invite pending. It does not create a login. */
export function stateAfterEmailFailure(): { status: "pending"; userId: null; accepted: false } {
  return { status: "pending", userId: null, accepted: false };
}

export function inviteFeedback(result: {
  ok: boolean;
  code?: string;
  email?: string;
  emailSent?: boolean;
  emailError?: string;
  accountExists?: boolean;
  error?: string;
}): { ok: boolean; text: string } {
  if (!result.ok) {
    return { ok: false, text: result.error ?? "Could not send invite." };
  }
  const email = result.email ?? "that address";
  if (result.emailSent === false) {
    const why = result.emailError ? ` ${result.emailError}` : "";
    return {
      ok: false,
      text: `The invitation for ${email} was saved, but the email could not be sent.${why} Use Resend once delivery is working, or copy the invitation link.`,
    };
  }
  if (result.accountExists) {
    return {
      ok: true,
      text: `Invitation sent to ${email}. They already have a Slipdesk account and should sign in with that email to join your organization.`,
    };
  }
  return {
    ok: true,
    text: `Invitation sent to ${email}. They choose their own password from the email. No password is sent.`,
  };
}

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}

import { describe, expect, it } from "vitest";
import { can } from "@/lib/rbac";
import {
  acceptedCompanyId,
  canAccessOrganization,
  canInviteToCompany,
  decideInvite,
  decideInviteAcceptance,
  escapeHtml,
  inviteFeedback,
  isInviteExpired,
  legacyEmailInviteEligible,
  parseAssignableRole,
  planAllowsTeamInvites,
  safeEmailError,
  stateAfterEmailFailure,
} from "@/lib/auth/team-invite-policy";
import { buildInviteUrl, teamInviteEmailHtml } from "@/lib/auth/team-invite-email";
import {
  generateInviteToken,
  hashInviteToken,
  tokensMatch,
} from "@/lib/auth/invite-token";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const CHRES = "4f439685-00ea-4f87-8000-7209e9cfd734";
const OTHER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function future(): string {
  return new Date(NOW.getTime() + 60_000).toISOString();
}

function past(): string {
  return new Date(NOW.getTime() - 60_000).toISOString();
}

describe("CHRES team invite authorization", () => {
  it("lets the CHRES company owner invite when Enterprise roles are unlocked", () => {
    expect(planAllowsTeamInvites("basic", true)).toBe(true);
    expect(canInviteToCompany({
      isCompanyOwner: true,
      isPlatformAdmin: false,
      planAllowsInvites: planAllowsTeamInvites("basic", true),
    })).toBe(true);
  });

  it("blocks a user who does not own the organization", () => {
    expect(canInviteToCompany({
      isCompanyOwner: false,
      isPlatformAdmin: false,
      planAllowsInvites: true,
    })).toBe(false);
    expect(can("hr_manager", "users:manage")).toBe(false);
    expect(can("finance_manager", "users:manage")).toBe(false);
  });

  it("blocks an owner whose plan does not include team management", () => {
    expect(planAllowsTeamInvites("basic", false)).toBe(false);
    expect(canInviteToCompany({
      isCompanyOwner: true,
      isPlatformAdmin: false,
      planAllowsInvites: false,
    })).toBe(false);
  });

  it("lets a Slipdesk platform admin invite without being the company owner", () => {
    expect(canInviteToCompany({
      isCompanyOwner: false,
      isPlatformAdmin: true,
      planAllowsInvites: false,
    })).toBe(true);
  });
});

describe("invitation decisions", () => {
  it("creates an HR Manager invite for a new work email", () => {
    const decision = decideInvite({
      email: " HR.Manager@chres.lr ",
      nameRaw: "  Ama Kollie ",
      roleRaw: "hr_manager",
      resend: false,
      now: NOW,
      existingOnCompany: null,
      alreadyBelongs: false,
      otherActiveCompanyId: null,
    });
    expect(decision).toMatchObject({
      action: "create",
      email: "hr.manager@chres.lr",
      name: "Ama Kollie",
      role: "hr_manager",
    });
  });

  it("rejects an invalid email, a missing name, and a platform role", () => {
    expect(decideInvite({
      email: "not-an-email",
      nameRaw: "Ama Kollie",
      roleRaw: "hr_manager",
      resend: false,
      now: NOW,
      existingOnCompany: null,
      alreadyBelongs: false,
      otherActiveCompanyId: null,
    }).action).toBe("reject");
    expect(decideInvite({
      email: "ama@chres.lr",
      nameRaw: " ",
      roleRaw: "hr_manager",
      resend: false,
      now: NOW,
      existingOnCompany: null,
      alreadyBelongs: false,
      otherActiveCompanyId: null,
    })).toMatchObject({ code: "invalid_name" });
    expect(parseAssignableRole("super_admin")).toBeNull();
  });

  it("keeps a pending invitation from being duplicated unless it is resent", () => {
    const pending = { id: "m1", status: "pending" as const, inviteExpiresAt: future() };
    expect(decideInvite({
      email: "ama@chres.lr",
      nameRaw: "Ama Kollie",
      roleRaw: "hr_manager",
      resend: false,
      now: NOW,
      existingOnCompany: pending,
      alreadyBelongs: false,
      otherActiveCompanyId: null,
    })).toMatchObject({ code: "pending" });
    expect(decideInvite({
      email: "ama@chres.lr",
      nameRaw: "Ama Kollie",
      roleRaw: "hr_manager",
      resend: true,
      now: NOW,
      existingOnCompany: pending,
      alreadyBelongs: false,
      otherActiveCompanyId: null,
    })).toMatchObject({ action: "refresh", memberId: "m1" });
  });

  it("refreshes an expired invitation instead of opening a second one", () => {
    const decision = decideInvite({
      email: "ama@chres.lr",
      nameRaw: "Ama Kollie",
      roleRaw: "hr_manager",
      resend: false,
      now: NOW,
      existingOnCompany: { id: "m1", status: "pending", inviteExpiresAt: past() },
      alreadyBelongs: false,
      otherActiveCompanyId: null,
    });
    expect(decision).toMatchObject({ action: "refresh", memberId: "m1" });
  });

  it("refuses an email that already belongs to CHRES or to another organization", () => {
    expect(decideInvite({
      email: "ama@chres.lr",
      nameRaw: "Ama Kollie",
      roleRaw: "hr_manager",
      resend: false,
      now: NOW,
      existingOnCompany: { id: "m1", status: "active", inviteExpiresAt: null },
      alreadyBelongs: false,
      otherActiveCompanyId: null,
    })).toMatchObject({ code: "active" });
    expect(decideInvite({
      email: "ama@other.lr",
      nameRaw: "Ama Kollie",
      roleRaw: "hr_manager",
      resend: false,
      now: NOW,
      existingOnCompany: null,
      alreadyBelongs: false,
      otherActiveCompanyId: OTHER,
    })).toMatchObject({ code: "other_org" });
  });
});

describe("invitation acceptance", () => {
  const invite = {
    id: "m1",
    companyId: CHRES,
    status: "pending" as const,
    invitedEmail: "ama@chres.lr",
    inviteExpiresAt: future(),
    userId: null,
  };

  it("links the new user to CHRES and not to another company", () => {
    const decision = decideInviteAcceptance({
      invite,
      userEmail: "Ama@CHRES.lr",
      userId: "user-hr",
      now: NOW,
      activeOtherCompanyId: null,
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(acceptedCompanyId(decision)).toBe(CHRES);
    expect(canAccessOrganization(decision.companyId, CHRES)).toBe(true);
    expect(canAccessOrganization(decision.companyId, OTHER)).toBe(false);
  });

  it("rejects an expired, reused, mismatched, or cross-organization acceptance", () => {
    expect(decideInviteAcceptance({
      invite: null,
      userEmail: "ama@chres.lr",
      userId: "user-hr",
      now: NOW,
      activeOtherCompanyId: null,
    })).toMatchObject({ code: "invalid" });
    expect(decideInviteAcceptance({
      invite: { ...invite, inviteExpiresAt: past() },
      userEmail: "ama@chres.lr",
      userId: "user-hr",
      now: NOW,
      activeOtherCompanyId: null,
    })).toMatchObject({ code: "expired" });
    expect(decideInviteAcceptance({
      invite: { ...invite, status: "active", userId: "someone-else" },
      userEmail: "ama@chres.lr",
      userId: "user-hr",
      now: NOW,
      activeOtherCompanyId: null,
    })).toMatchObject({ code: "used" });
    expect(decideInviteAcceptance({
      invite,
      userEmail: "other@chres.lr",
      userId: "user-hr",
      now: NOW,
      activeOtherCompanyId: null,
    })).toMatchObject({ code: "email_mismatch" });
    expect(decideInviteAcceptance({
      invite,
      userEmail: "ama@chres.lr",
      userId: "user-hr",
      now: NOW,
      activeOtherCompanyId: OTHER,
    })).toMatchObject({ code: "other_org" });
  });

  it("does not activate a tokenized invite through the old email-only path", () => {
    expect(legacyEmailInviteEligible({ status: "pending", inviteTokenHash: "abc" })).toBe(false);
    expect(legacyEmailInviteEligible({ status: "pending", inviteTokenHash: null })).toBe(true);
    expect(legacyEmailInviteEligible({ status: "active", inviteTokenHash: null })).toBe(false);
  });

  it("treats a missing expiry as expired", () => {
    expect(isInviteExpired(null, NOW)).toBe(true);
  });
});

describe("invitation tokens and email", () => {
  it("stores a hash that is not the raw token and matches only that token", () => {
    const first = generateInviteToken();
    const second = generateInviteToken();
    expect(first.token).not.toBe(first.tokenHash);
    expect(first.tokenHash).toBe(hashInviteToken(first.token));
    expect(tokensMatch(first.tokenHash, hashInviteToken(first.token))).toBe(true);
    expect(tokensMatch(first.tokenHash, second.tokenHash)).toBe(false);
    expect(first.token.length).toBeGreaterThan(40);
  });

  it("puts the token only in the signup link and escapes the company name", () => {
    const { token } = generateInviteToken();
    const url = buildInviteUrl("https://slipdesk.com/", token);
    expect(url).toBe(`https://slipdesk.com/signup?token=${encodeURIComponent(token)}`);
    const html = teamInviteEmailHtml({
      companyName: "CHRES <script>",
      recipientName: "Ama Kollie",
      role: "hr_manager",
      inviteUrl: url,
    });
    expect(html).toContain("CHRES &lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("HR Manager");
    expect(html).toContain(escapeHtml(url));
    expect(html.toLowerCase()).not.toContain("temporary password");
  });

  it("leaves the invite pending when email delivery fails and hides the token from the error", () => {
    expect(stateAfterEmailFailure()).toEqual({ status: "pending", userId: null, accepted: false });
    const token = "secret-token-value";
    expect(safeEmailError(`delivery failed for ${token}`, token)).toBe("Email could not be sent.");
    const feedback = inviteFeedback({
      ok: true,
      email: "ama@chres.lr",
      emailSent: false,
      emailError: "Email is not configured.",
    });
    expect(feedback.ok).toBe(false);
    expect(feedback.text).toContain("could not be sent");
    expect(feedback.text).not.toContain(token);
  });

  it("describes an existing account without calling the invite a failure", () => {
    const feedback = inviteFeedback({
      ok: true,
      email: "ama@chres.lr",
      emailSent: true,
      accountExists: true,
    });
    expect(feedback.ok).toBe(true);
    expect(feedback.text).toContain("already have a Slipdesk account");
  });
});

describe("HR Manager permissions stay inside the existing role", () => {
  it("can manage employees and review payroll, and cannot administer users or billing", () => {
    expect(can("hr_manager", "employee:view")).toBe(true);
    expect(can("hr_manager", "employee:edit")).toBe(true);
    expect(can("hr_manager", "payroll:view")).toBe(true);
    expect(can("hr_manager", "payroll:approve")).toBe(true);
    expect(can("hr_manager", "users:manage")).toBe(false);
    expect(can("hr_manager", "billing:manage")).toBe(false);
    expect(can("hr_manager", "company:manage")).toBe(false);
    expect(can("hr_manager", "payroll:create")).toBe(false);
  });
});

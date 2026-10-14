import { describe, expect, it } from "vitest";
import { can } from "@/lib/rbac";
import {
  acceptedCompanyId,
  canAccessOrganization,
  canInviteToCompany,
  decideConfirmedEmailFallback,
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
  type EmailFallbackInvite,
} from "@/lib/auth/team-invite-policy";
import {
  authCallbackRedirectUrl,
  loginErrorMessage,
  passwordResetRedirectUrl,
  passwordSignInErrorMessage,
  safeInternalNextPath,
} from "@/lib/auth/canonical-redirect";
import {
  AUTH_FRAGMENT_FINISH_PATH,
  AUTH_FRAGMENT_STORAGE_KEY,
  authCallbackFragmentHtml,
  cookiesFromHeader,
  hasPkceCodeVerifier,
  parseAuthFragmentPayload,
  planAuthCallback,
} from "@/lib/auth/callback-plan";
import {
  chooseCompanyForUser,
  companyDisplayName,
  isBlankOwnedCompany,
  ownedCompanyCreationDecision,
} from "@/lib/auth/resolve-company";
import { confirmedPlanTier } from "@/lib/plan-features";
import { buildInviteUrl, teamInviteEmailHtml } from "@/lib/auth/team-invite-email";
import {
  generateInviteToken,
  hashInviteToken,
  tokensMatch,
} from "@/lib/auth/invite-token";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const ORG = "11111111-2222-4333-8444-555555555555";
const OTHER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function future(): string {
  return new Date(NOW.getTime() + 60_000).toISOString();
}

function past(): string {
  return new Date(NOW.getTime() - 60_000).toISOString();
}

describe("team invite authorization", () => {
  it("lets a company owner invite when Enterprise roles are unlocked", () => {
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

  it("refuses an email that already belongs to this organization or to another organization", () => {
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
    companyId: ORG,
    status: "pending" as const,
    invitedEmail: "ama@chres.lr",
    inviteExpiresAt: future(),
    userId: null,
  };

  it("links the new user to the inviting organization and not to another company", () => {
    const decision = decideInviteAcceptance({
      invite,
      userEmail: "Ama@CHRES.lr",
      userId: "user-hr",
      now: NOW,
      activeOtherCompanyId: null,
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(acceptedCompanyId(decision)).toBe(ORG);
    expect(canAccessOrganization(decision.companyId, ORG)).toBe(true);
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
      companyName: "Example Org <script>",
      recipientName: "Ama Kollie",
      role: "hr_manager",
      inviteUrl: url,
    });
    expect(html).toContain("Example Org &lt;script&gt;");
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

  it("does not treat an HR manager as allowed to create a company", () => {
    const decision = ownedCompanyCreationDecision({
      hasPendingOrActiveMembership: true,
      canManageCompany: can("hr_manager", "company:manage"),
    });
    expect(decision.allow).toBe(false);
    expect(decision.message).toContain("already belongs");
  });
});

describe("canonical auth redirects", () => {
  it("keeps localhost on the local origin and uses the canonical production origin otherwise", () => {
    expect(authCallbackRedirectUrl({
      origin: "http://localhost:3000",
      configuredAppUrl: "https://slipdesk.com",
    })).toBe("http://localhost:3000/auth/callback");
    expect(authCallbackRedirectUrl({
      origin: "http://127.0.0.1:3000/",
      configuredAppUrl: "https://slipdesk.com",
    })).toBe("http://127.0.0.1:3000/auth/callback");
    expect(passwordResetRedirectUrl({
      origin: "http://localhost:3000",
      configuredAppUrl: "https://slipdesk.com",
    })).toBe("http://localhost:3000/reset-password");

    expect(authCallbackRedirectUrl({
      origin: "https://www.slipdesk.com",
      configuredAppUrl: "https://slipdesk.com/",
    })).toBe("https://slipdesk.com/auth/callback");
    expect(authCallbackRedirectUrl({
      origin: "https://www.slipdesk.com",
      configuredAppUrl: "",
    })).toBe("https://slipdesk.com/auth/callback");
    expect(passwordResetRedirectUrl({
      origin: "https://slipdesk.com",
    })).toBe("https://slipdesk.com/reset-password");

    const callback = authCallbackRedirectUrl({ origin: "https://www.slipdesk.com" });
    expect(callback).not.toContain("?");
    expect(callback).not.toContain("next=");
    expect(callback).not.toContain("token");
  });

  it("ignores token-like login error query values", () => {
    expect(loginErrorMessage("invite_setup")).toContain("inviting organization");
    const callbackMessage = loginErrorMessage("auth_callback");
    expect(callbackMessage).toContain("expired or invalid");
    expect(callbackMessage).toContain("different device");
    expect(callbackMessage).not.toContain("Invalid email or password");
    expect(loginErrorMessage("raw-invite-token")).toBeNull();
    expect(safeInternalNextPath("/dashboard")).toBe("/dashboard");
    expect(safeInternalNextPath("//evil.example/phish")).toBe("/dashboard");
    expect(safeInternalNextPath("/login?token=secret")).toBe("/dashboard");
  });

  it("keeps an unconfirmed email distinct from a bad password", () => {
    const invalid = passwordSignInErrorMessage({ message: "Invalid login credentials", code: "invalid_credentials" });
    expect(invalid.emailUnconfirmed).toBe(false);
    expect(invalid.message).toContain("Invalid email or password");
    expect(invalid.message).toContain("/signup");

    const unconfirmedMessage = passwordSignInErrorMessage({ message: "Email not confirmed" });
    expect(unconfirmedMessage.emailUnconfirmed).toBe(true);
    expect(unconfirmedMessage.message).not.toContain("Invalid email or password");
    expect(unconfirmedMessage.message.toLowerCase()).toContain("another device");

    const unconfirmedCode = passwordSignInErrorMessage({
      message: "Invalid login credentials",
      code: "email_not_confirmed",
    });
    expect(unconfirmedCode.emailUnconfirmed).toBe(true);
    expect(unconfirmedCode.message).not.toContain("Invalid email or password");
    expect(loginErrorMessage("auth_callback")).not.toBe(invalid.message);
  });
});

describe("auth callback query handling", () => {
  const verifier = [{ name: "sb-project-auth-token-code-verifier", value: "verifier-value" }];

  it("prefers token_hash over a PKCE code", () => {
    expect(planAuthCallback({
      code: "pkce-code",
      tokenHash: "hash-value",
      type: "signup",
      hasCodeVerifier: true,
    })).toEqual({ action: "verify_otp", tokenHash: "hash-value", type: "signup" });
    expect(planAuthCallback({
      tokenHash: "hash-value",
      type: "email",
      hasCodeVerifier: false,
    })).toEqual({ action: "verify_otp", tokenHash: "hash-value", type: "email" });
    expect(planAuthCallback({
      tokenHash: "hash-value",
      type: " Signup ",
      hasCodeVerifier: false,
    })).toEqual({ action: "verify_otp", tokenHash: "hash-value", type: "signup" });
  });

  it("exchanges a code only when the verifier cookie exists", () => {
    expect(planAuthCallback({
      code: "pkce-code",
      hasCodeVerifier: true,
    })).toEqual({ action: "exchange_code", code: "pkce-code" });
    expect(planAuthCallback({
      code: "pkce-code",
      hasCodeVerifier: false,
    })).toEqual({ action: "fail" });
    expect(hasPkceCodeVerifier(verifier)).toBe(true);
    expect(hasPkceCodeVerifier([{ name: "sb-project-auth-token-code-verifier.0", value: "chunk" }])).toBe(true);
    expect(hasPkceCodeVerifier([{ name: "sb-project-auth-token-code-verifier", value: "  " }])).toBe(false);
    expect(hasPkceCodeVerifier(cookiesFromHeader(
      "sb-project-auth-token=session; sb-project-auth-token-code-verifier=verifier-value",
    ))).toBe(true);
    expect(hasPkceCodeVerifier(cookiesFromHeader("sb-project-auth-token=session"))).toBe(false);
  });

  it("rejects token_hash types other than signup or email", () => {
    expect(planAuthCallback({
      tokenHash: "hash-value",
      type: "recovery",
      hasCodeVerifier: false,
    })).toEqual({ action: "fail" });
    expect(planAuthCallback({
      tokenHash: "hash-value",
      type: "",
      hasCodeVerifier: true,
      code: "pkce-code",
    })).toEqual({ action: "exchange_code", code: "pkce-code" });
    expect(planAuthCallback({ hasCodeVerifier: false })).toEqual({ action: "client_fragment" });
  });

  it("reads only signup or email hash sessions and does not embed a token", () => {
    const html = authCallbackFragmentHtml();
    expect(html).toContain(AUTH_FRAGMENT_STORAGE_KEY);
    expect(html).toContain(AUTH_FRAGMENT_FINISH_PATH);
    expect(html).toContain("access_token");
    expect(html).toContain('type !== "signup"');
    expect(html).not.toContain("token_hash=");
    expect(html).not.toContain("pkce-code");

    expect(parseAuthFragmentPayload(JSON.stringify({
      access_token: "access-token",
      refresh_token: "refresh-token",
      type: "signup",
    }))).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      type: "signup",
    });
    expect(parseAuthFragmentPayload(JSON.stringify({
      access_token: "access-token",
      refresh_token: "refresh-token",
      type: "recovery",
    }))).toBeNull();
    expect(parseAuthFragmentPayload("not-json")).toBeNull();
    expect(parseAuthFragmentPayload(null)).toBeNull();
  });
});

describe("confirmed-email invitation fallback", () => {
  const pending = (overrides: Partial<EmailFallbackInvite> = {}): EmailFallbackInvite => ({
    id: "m1",
    companyId: ORG,
    status: "pending",
    invitedEmail: "ama@example.test",
    inviteExpiresAt: future(),
    userId: null,
    inviteTokenHash: null,
    ...overrides,
  });

  function decide(overrides: Partial<Parameters<typeof decideConfirmedEmailFallback>[0]> = {}) {
    return decideConfirmedEmailFallback({
      emailConfirmed: true,
      userEmail: "ama@example.test",
      userId: "user-hr",
      now: NOW,
      invites: [pending()],
      activeOtherCompanyId: null,
      ...overrides,
    });
  }

  it("accepts exactly one unhashed pending invite for a confirmed matching email", () => {
    const decision = decide();
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.companyId).toBe(ORG);
    expect(decision.alreadyActive).toBe(false);
  });

  it("rejects an unconfirmed email, a mismatch, an expiry, and a hashed invite", () => {
    expect(decide({ emailConfirmed: false })).toMatchObject({ code: "unconfirmed" });
    expect(decide({ userEmail: "other@example.test" })).toMatchObject({ code: "email_mismatch" });
    expect(decide({ invites: [pending({ inviteExpiresAt: past() })] })).toMatchObject({ code: "expired" });
    expect(decide({ invites: [pending({ inviteTokenHash: "abc" })] })).toMatchObject({ code: "tokenized" });
  });

  it("does not guess when more than one pending invite matches the email", () => {
    const decision = decide({
      invites: [
        pending(),
        pending({ id: "m2", companyId: OTHER, inviteTokenHash: "hashed" }),
      ],
    });
    expect(decision).toMatchObject({ ok: false, code: "ambiguous" });
  });

  it("is idempotent for the same user and refuses a different user", () => {
    const again = decide({
      invites: [pending({ status: "active", userId: "user-hr", inviteTokenHash: null })],
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.alreadyActive).toBe(true);
    expect(again.companyId).toBe(ORG);

    expect(decide({
      invites: [pending({ userId: "someone-else" })],
    })).toMatchObject({ code: "used" });
    expect(decide({
      invites: [pending({ status: "active", userId: "someone-else" })],
    })).toMatchObject({ code: "used" });
  });

  it("denies acceptance when the account already belongs to another organization", () => {
    expect(decide({ activeOtherCompanyId: OTHER })).toMatchObject({ code: "other_org" });
    expect(decideInviteAcceptance({
      invite: {
        id: "m1",
        companyId: ORG,
        status: "pending",
        invitedEmail: "ama@example.test",
        inviteExpiresAt: future(),
        userId: null,
      },
      userEmail: "ama@example.test",
      userId: "user-hr",
      now: NOW,
      activeOtherCompanyId: OTHER,
    })).toMatchObject({ code: "other_org" });
  });
});

describe("company resolution and creation", () => {
  it("keeps a nameless owned company when the user is not a member elsewhere", () => {
    const choice = chooseCompanyForUser({
      owned: { id: ORG, name: "" },
      profileCompanyId: ORG,
      memberships: [],
    });
    expect(choice).toMatchObject({ ok: true, companyId: ORG, source: "owned" });
  });

  it("keeps a real owned company for an owner who is not a member elsewhere", () => {
    expect(isBlankOwnedCompany({ name: "  " })).toBe(true);
    expect(isBlankOwnedCompany({ name: "Northwind Payroll" })).toBe(false);
    const choice = chooseCompanyForUser({
      owned: { id: ORG, name: "Northwind Payroll" },
      profileCompanyId: null,
      memberships: [],
    });
    expect(choice).toMatchObject({ ok: true, companyId: ORG, source: "owned" });
  });

  it("does not prefer a named or newer company when several owned companies exist", () => {
    const ambiguous = chooseCompanyForUser({
      owned: [
        { id: "blank-new", name: "" },
        { id: ORG, name: "Northwind Payroll" },
      ],
      profileCompanyId: null,
      memberships: [],
    });
    expect(ambiguous.ok).toBe(false);
    if (ambiguous.ok) return;
    expect(ambiguous.code).toBe("ambiguous");

    expect(chooseCompanyForUser({
      owned: [
        { id: "blank-new", name: "" },
        { id: ORG, name: "Northwind Payroll" },
      ],
      profileCompanyId: "blank-new",
      memberships: [],
    })).toMatchObject({ ok: true, companyId: "blank-new", source: "owned" });
  });

  it("does not guess between two named companies", () => {
    const ambiguous = chooseCompanyForUser({
      owned: [
        { id: ORG, name: "Northwind Payroll" },
        { id: OTHER, name: "Other Payroll" },
      ],
      profileCompanyId: null,
      memberships: [],
    });
    expect(ambiguous.ok).toBe(false);
    if (ambiguous.ok) return;
    expect(ambiguous.code).toBe("ambiguous");

    expect(chooseCompanyForUser({
      owned: [
        { id: ORG, name: "Northwind Payroll" },
        { id: OTHER, name: "Other Payroll" },
      ],
      profileCompanyId: ORG,
      memberships: [],
    })).toMatchObject({ ok: true, companyId: ORG, source: "owned" });

    expect(chooseCompanyForUser({
      owned: [{ id: ORG, name: "Northwind Payroll" }, { id: OTHER, name: "" }],
      profileCompanyId: null,
      memberships: [],
      ownershipIncomplete: true,
    }).ok).toBe(false);
  });

  it("ignores a pending membership and keeps the sole owned company", () => {
    expect(chooseCompanyForUser({
      owned: { id: ORG, name: "" },
      profileCompanyId: null,
      memberships: [{ companyId: OTHER, role: "hr_manager", status: "pending" }],
    })).toMatchObject({ ok: true, companyId: ORG, source: "owned", memberRole: null });
  });

  it("keeps the owner role when the user owns the membership company", () => {
    expect(chooseCompanyForUser({
      owned: { id: ORG, name: "Northwind Payroll" },
      profileCompanyId: ORG,
      memberships: [{ companyId: ORG, role: "hr_manager", status: "active" }],
    })).toMatchObject({ ok: true, companyId: ORG, source: "owned", memberRole: null });
  });

  it("does not label a blank company as a new starter company or invent a plan", () => {
    expect(companyDisplayName("", true)).toBe("Unnamed organization");
    expect(companyDisplayName("Northwind Payroll", true)).toBe("Northwind Payroll");
    expect(companyDisplayName("", false)).toBe("No organization");
    expect(confirmedPlanTier("", "basic", false)).toBeNull();
    expect(confirmedPlanTier(ORG, null, false)).toBeNull();
    expect(confirmedPlanTier(ORG, "basic", true)).toBe("premium");
    expect(confirmedPlanTier(ORG, "premium", false)).toBe("premium");
    expect(can("hr_manager", "billing:manage")).toBe(false);
    expect(can("company_owner", "billing:manage")).toBe(true);
  });

  it("uses the profile when the user owns one company and belongs to another", () => {
    expect(chooseCompanyForUser({
      owned: { id: "owned-co", name: "Owned Co" },
      profileCompanyId: ORG,
      memberships: [{ companyId: ORG, role: "hr_manager", status: "active" }],
    })).toMatchObject({
      ok: true,
      companyId: ORG,
      source: "profile",
      memberRole: "hr_manager",
    });

    expect(chooseCompanyForUser({
      owned: { id: "owned-co", name: "Owned Co" },
      profileCompanyId: "owned-co",
      memberships: [{ companyId: ORG, role: "hr_manager", status: "active" }],
    })).toMatchObject({
      ok: true,
      companyId: "owned-co",
      source: "owned",
      memberRole: null,
    });

    const ambiguous = chooseCompanyForUser({
      owned: { id: "owned-co", name: "Owned Co" },
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "hr_manager", status: "active" }],
    });
    expect(ambiguous).toMatchObject({ ok: false, code: "ambiguous" });

    const foreign = chooseCompanyForUser({
      owned: { id: "owned-co", name: "Owned Co" },
      profileCompanyId: "other-tenant",
      memberships: [{ companyId: ORG, role: "hr_manager", status: "active" }],
    });
    expect(foreign.ok).toBe(false);
    if (foreign.ok) return;
    expect(foreign.code).toBe("ambiguous");
  });

  it("returns no company when several memberships do not match the profile", () => {
    const choice = chooseCompanyForUser({
      owned: [],
      profileCompanyId: "owned-co",
      memberships: [
        { companyId: ORG, role: "hr_manager", status: "active" },
        { companyId: OTHER, role: "auditor", status: "active" },
      ],
    });
    expect(choice).toMatchObject({ ok: false, code: "ambiguous" });
  });

  it("does not let a blank owned company or a membership win without an explicit selection", () => {
    expect(chooseCompanyForUser({
      owned: { id: "blank-owned", name: "" },
      profileCompanyId: null,
      memberships: [{ companyId: ORG, role: "hr_manager", status: "active" }],
    })).toMatchObject({ ok: false, code: "ambiguous" });

    expect(chooseCompanyForUser({
      owned: { id: "blank-owned", name: "" },
      profileCompanyId: ORG,
      memberships: [{ companyId: ORG, role: "hr_manager", status: "active" }],
    })).toMatchObject({
      ok: true,
      companyId: ORG,
      source: "profile",
      memberRole: "hr_manager",
    });
  });

  it("keeps profile.company_id when it matches one active membership and fails when it does not", () => {
    expect(chooseCompanyForUser({
      owned: null,
      profileCompanyId: ORG,
      memberships: [
        { companyId: ORG, role: "hr_manager", status: "active" },
        { companyId: OTHER, role: "auditor", status: "active" },
      ],
    })).toMatchObject({ ok: true, companyId: ORG, source: "profile" });

    expect(chooseCompanyForUser({
      owned: { id: "owned-real", name: "Owned Co" },
      profileCompanyId: "owned-real",
      memberships: [
        { companyId: ORG, role: "hr_manager", status: "active" },
        { companyId: OTHER, role: "auditor", status: "active" },
      ],
    })).toMatchObject({ ok: true, companyId: "owned-real", source: "owned", memberRole: null });

    expect(chooseCompanyForUser({
      owned: { id: "owned-real", name: "Owned Co" },
      profileCompanyId: "other-tenant",
      memberships: [
        { companyId: ORG, role: "hr_manager", status: "active" },
        { companyId: OTHER, role: "auditor", status: "active" },
      ],
    })).toMatchObject({ ok: false, code: "ambiguous" });
  });

  it("does not create a company for a non-invited signup", () => {
    expect(ownedCompanyCreationDecision({
      hasPendingOrActiveMembership: false,
      canManageCompany: true,
    })).toMatchObject({ allow: false });
    expect(ownedCompanyCreationDecision({
      hasPendingOrActiveMembership: false,
      canManageCompany: false,
    }).allow).toBe(false);
    expect(ownedCompanyCreationDecision({
      hasPendingOrActiveMembership: false,
      canManageCompany: can("company_owner", "company:manage"),
    }).message).toContain("invite-only");
  });
});

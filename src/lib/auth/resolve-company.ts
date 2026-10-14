/**
 * Which company a signed-in user should see.
 * A blank owned row must not hide an active membership in the inviting org.
 * Multiple active memberships are never guessed.
 * Self-serve company creation stays retired.
 */

export interface OwnedCompanyRef {
  id: string;
  name?: string | null;
}

export interface MembershipRef {
  companyId: string;
  role: string | null;
  status: "pending" | "active";
}

export type CompanyResolution =
  | {
      ok: true;
      companyId: string;
      source: "owned" | "membership" | "profile";
      memberRole: string | null;
    }
  | { ok: false; code: "ambiguous" | "none"; message?: string };

const AMBIGUOUS_MESSAGE =
  "This account belongs to more than one organization. Ask Slipdesk support to set the active company before continuing.";

/** An accidental companies insert from the empty dashboard has no name. */
export function isBlankOwnedCompany(company: { name?: string | null } | null | undefined): boolean {
  if (!company) return false;
  return !(company.name ?? "").trim();
}

export function chooseCompanyForUser(opts: {
  owned: OwnedCompanyRef | null;
  profileCompanyId: string | null;
  memberships: MembershipRef[];
}): CompanyResolution {
  const active = opts.memberships.filter((row) => row.status === "active" && row.companyId);
  const membershipIds = [...new Set(active.map((row) => row.companyId))];
  const owned = opts.owned;
  const ownedIsReal = Boolean(owned && !isBlankOwnedCompany(owned));
  const profileId = opts.profileCompanyId || null;

  const roleFor = (companyId: string): string | null =>
    active.find((row) => row.companyId === companyId)?.role ?? null;

  if (membershipIds.length > 1) {
    if (profileId && membershipIds.includes(profileId)) {
      return {
        ok: true,
        companyId: profileId,
        source: "profile",
        memberRole: roleFor(profileId),
      };
    }
    return { ok: false, code: "ambiguous", message: AMBIGUOUS_MESSAGE };
  }

  if (membershipIds.length === 1) {
    const memberCompanyId = membershipIds[0];
    const memberRole = roleFor(memberCompanyId);

    if (ownedIsReal && owned && owned.id !== memberCompanyId) {
      if (profileId === owned.id) {
        return { ok: true, companyId: owned.id, source: "owned", memberRole: null };
      }
      if (profileId === memberCompanyId) {
        return { ok: true, companyId: memberCompanyId, source: "membership", memberRole };
      }
      return { ok: false, code: "ambiguous", message: AMBIGUOUS_MESSAGE };
    }

    if (ownedIsReal && owned && owned.id === memberCompanyId) {
      return { ok: true, companyId: owned.id, source: "owned", memberRole: null };
    }

    return { ok: true, companyId: memberCompanyId, source: "membership", memberRole };
  }

  // No membership: the owned company stays, even before a name is saved.
  // A blank name loses only when an active membership in another organization exists.
  if (owned) {
    return { ok: true, companyId: owned.id, source: "owned", memberRole: null };
  }

  if (profileId) {
    return { ok: true, companyId: profileId, source: "profile", memberRole: null };
  }

  return { ok: false, code: "none" };
}

/**
 * New companies are provisioned by Slipdesk ops. The dashboard must not
 * insert a companies row for an invitee, an HR manager, or a non-invited signup.
 */
export function ownedCompanyCreationDecision(opts: {
  hasPendingOrActiveMembership: boolean;
  canManageCompany: boolean;
}): { allow: false; message: string } {
  if (opts.hasPendingOrActiveMembership) {
    return {
      allow: false,
      message: "This account already belongs to an organization. Company creation is not available.",
    };
  }
  if (!opts.canManageCompany) {
    return {
      allow: false,
      message: "You do not have permission to create a company.",
    };
  }
  return {
    allow: false,
    message: "Company creation is invite-only. Sign in with an invited account, or ask Slipdesk to provision the organization.",
  };
}

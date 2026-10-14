/**
 * Which company a signed-in user should see.
 *
 * Allowed organizations are the companies the user owns plus active memberships.
 * 1. One allowed organization is used, whether the user owns it or was invited.
 * 2. Several allowed organizations use profiles.company_id only when it is one
 *    of them. That is the explicit selection. Otherwise the result is ambiguous.
 * 3. A profile id outside the allowed set never grants access. It is used only
 *    when the user owns nothing and has no active membership.
 *
 * A company name, a blank name, and created_at are never used to break a tie.
 * Pending memberships are ignored. If more than one organization remains,
 * the result is ambiguous.
 * Owning the selected company clears the membership role so the app treats
 * the user as that company's owner.
 *
 * public.my_company_id() in migration 0021 must return the same company id,
 * or null when this result is not ok. Do not change 0002 in place.
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

export const OWNED_COMPANY_FETCH_LIMIT = 10;

export function ownershipListIncomplete(rowCount: number): boolean {
  return rowCount >= OWNED_COMPANY_FETCH_LIMIT;
}

function ownedList(owned: OwnedCompanyRef | readonly OwnedCompanyRef[] | null | undefined): OwnedCompanyRef[] {
  if (!owned) return [];
  const list = Array.isArray(owned) ? owned : [owned];
  return list.filter((row) => row?.id);
}

/** Sidebar label. A blank name is not a new company called "Your Company". */
export function companyDisplayName(name: string | null | undefined, hasCompany: boolean): string {
  const trimmed = (name ?? "").trim();
  if (trimmed) return trimmed;
  return hasCompany ? "Unnamed organization" : "No organization";
}

export function chooseCompanyForUser(opts: {
  owned: OwnedCompanyRef | readonly OwnedCompanyRef[] | null;
  profileCompanyId: string | null;
  memberships: MembershipRef[];
  /** True when the owned-company query hit its limit and more rows may exist. */
  ownershipIncomplete?: boolean;
}): CompanyResolution {
  const ownedIds = [...new Set(ownedList(opts.owned).map((row) => row.id))];
  const active = opts.memberships.filter((row) => row.status === "active" && row.companyId);
  const membershipIds = [...new Set(active.map((row) => row.companyId))];
  const profileId = opts.profileCompanyId || null;

  const roleFor = (companyId: string): string | null =>
    active.find((row) => row.companyId === companyId)?.role ?? null;

  const selected = (companyId: string, source: "owned" | "membership" | "profile"): CompanyResolution => {
    if (ownedIds.includes(companyId)) {
      return { ok: true, companyId, source: "owned", memberRole: null };
    }
    return {
      ok: true,
      companyId,
      source,
      memberRole: roleFor(companyId),
    };
  };

  if (opts.ownershipIncomplete && ownedIds.length > 0) {
    return { ok: false, code: "ambiguous", message: AMBIGUOUS_MESSAGE };
  }

  const allowedIds = [...new Set([...ownedIds, ...membershipIds])];

  if (allowedIds.length === 1) {
    return selected(allowedIds[0], membershipIds.includes(allowedIds[0]) ? "membership" : "owned");
  }

  if (allowedIds.length > 1) {
    if (profileId && allowedIds.includes(profileId)) {
      return selected(profileId, "profile");
    }
    return { ok: false, code: "ambiguous", message: AMBIGUOUS_MESSAGE };
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

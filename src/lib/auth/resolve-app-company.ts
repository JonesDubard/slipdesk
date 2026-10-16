import { createAdminClient } from "@/lib/supabase/admin";
import {
  chooseCompanyForUser,
  OWNED_COMPANY_FETCH_LIMIT,
  ownershipListIncomplete,
  type CompanyResolution,
  type MembershipRef,
  type OwnedCompanyRef,
} from "@/lib/auth/resolve-company";
import { normalizeRole, type Role } from "@/lib/rbac";

export type AppCompanyAccess = {
  companyId: string;
  role: Role;
  admin: unknown;
  companyEmail: string | null;
  companyName: string;
};

/**
 * Role for a company chooseCompanyForUser already selected.
 * Owning that company is company_owner. An invited membership keeps its role.
 * A blank company the user owns does not count as owning the invited company.
 * No role means no access.
 */
export function roleForCompanyChoice(choice: CompanyResolution): Role | null {
  if (!choice.ok) return null;
  if (choice.source === "owned") return "company_owner";
  if (choice.memberRole) return normalizeRole(choice.memberRole);
  return null;
}

/** Fail closed. Ambiguous context and a profile with no membership do not grant a company. */
export function accessDecisionFromRecords(opts: {
  owned: OwnedCompanyRef | readonly OwnedCompanyRef[] | null;
  profileCompanyId: string | null;
  memberships: MembershipRef[];
  ownershipIncomplete?: boolean;
}): { companyId: string; role: Role } | null {
  const choice = chooseCompanyForUser(opts);
  const role = roleForCompanyChoice(choice);
  if (!choice.ok || !role) return null;
  return { companyId: choice.companyId, role };
}

type CompanyRow = { id: string; name?: string | null; email?: string | null };
type MembershipRow = { company_id: string; role: string | null; status: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = any;

/**
 * Company and role for payroll and HR routes. Uses chooseCompanyForUser.
 * Service role is required so a membership is still visible when RLS cannot
 * see it. Returns null when the account has no single authorized company.
 */
export async function resolveAppCompanyAccess(
  userId: string,
  fallbackClient?: unknown,
): Promise<AppCompanyAccess | null> {
  let admin: unknown;
  try {
    admin = createAdminClient();
  } catch {
    if (!fallbackClient) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    admin = fallbackClient;
  }
  const db = admin as AdminDb;

  const [{ data: ownedRows }, { data: profile }, { data: memberships }] = await Promise.all([
    db
      .from("companies")
      .select("id, name, email")
      .eq("owner_id", userId)
      .limit(OWNED_COMPANY_FETCH_LIMIT),
    db.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
    db
      .from("company_members")
      .select("company_id, role, status")
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);

  const owned = (ownedRows ?? []) as CompanyRow[];
  const decision = accessDecisionFromRecords({
    owned: owned.map((row) => ({ id: row.id, name: row.name ?? "" })),
    profileCompanyId: (profile?.company_id as string | null) ?? null,
    ownershipIncomplete: ownershipListIncomplete(owned.length),
    memberships: ((memberships ?? []) as MembershipRow[]).map((row) => ({
      companyId: row.company_id,
      role: row.role,
      status: "active",
    })),
  });
  if (!decision) return null;

  const ownedMatch = owned.find((row) => row.id === decision.companyId);
  let companyEmail = ownedMatch?.email ?? null;
  let companyName = (ownedMatch?.name ?? "").trim();
  if (!ownedMatch) {
    const { data: company } = await db
      .from("companies")
      .select("name, email")
      .eq("id", decision.companyId)
      .maybeSingle();
    companyEmail = (company?.email as string | null) ?? null;
    companyName = ((company?.name as string | null) ?? "").trim();
  }

  return {
    companyId: decision.companyId,
    role: decision.role,
    admin,
    companyEmail,
    companyName: companyName || "your company",
  };
}

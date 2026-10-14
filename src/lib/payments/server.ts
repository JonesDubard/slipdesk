import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { chooseCompanyForUser, OWNED_COMPANY_FETCH_LIMIT, ownershipListIncomplete } from "@/lib/auth/resolve-company";

/** Resolve company id for the authenticated user (owner, profile, or team member). */
export async function resolveCompanyIdForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const [{ data: ownedRows }, { data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(OWNED_COMPANY_FETCH_LIMIT),
    supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("company_members")
      .select("company_id, role, status")
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);

  const ownedList = (ownedRows ?? []) as { id: string; name?: string | null }[];
  const choice = chooseCompanyForUser({
    owned: ownedList.map((row) => ({ id: row.id, name: row.name ?? "" })),
    profileCompanyId: (profile?.company_id as string | null) ?? null,
    ownershipIncomplete: ownershipListIncomplete(ownedList.length),
    memberships: (memberships ?? []).map((row) => ({
      companyId: row.company_id as string,
      role: (row.role as string | null) ?? null,
      status: "active" as const,
    })),
  });

  return choice.ok ? choice.companyId : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function paymentsDb(): any {
  return createAdminClient();
}

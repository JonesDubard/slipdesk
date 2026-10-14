import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { chooseCompanyForUser } from "@/lib/auth/resolve-company";

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
      .limit(1),
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

  const owned = ownedRows?.[0] as { id: string; name?: string | null } | undefined;
  const choice = chooseCompanyForUser({
    owned: owned ? { id: owned.id, name: owned.name ?? "" } : null,
    profileCompanyId: (profile?.company_id as string | null) ?? null,
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

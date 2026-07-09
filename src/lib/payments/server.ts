import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/** Resolve company id for the authenticated user (owner, profile, or team member). */
export async function resolveCompanyIdForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: owned } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (owned?.[0]?.id) return owned[0].id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.company_id) return profile.company_id;

  const { data: member } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (member?.company_id) return member.company_id;

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function paymentsDb(): any {
  return createAdminClient();
}

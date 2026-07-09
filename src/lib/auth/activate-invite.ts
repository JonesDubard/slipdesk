import type { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = any;

/**
 * Activates a pending team invite for the signed-in user (service role).
 * Only updates profile.company_id — RBAC role lives on company_members.
 */
export async function activatePendingInviteForUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  email: string | undefined,
): Promise<{ activated: boolean; companyId?: string }> {
  if (!email?.trim()) return { activated: false };

  const clean = email.trim().toLowerCase();
  const { data: invite } = await (admin as AdminDb)
    .from("company_members")
    .select("id, company_id")
    .eq("invited_email", clean)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();

  if (!invite) return { activated: false };

  const { error: memberErr } = await (admin as AdminDb)
    .from("company_members")
    .update({ status: "active", user_id: userId })
    .eq("id", invite.id);

  if (memberErr) {
    console.error("[team-invite] activate member:", memberErr);
    return { activated: false };
  }

  await (admin as AdminDb)
    .from("profiles")
    .update({ company_id: invite.company_id })
    .eq("id", userId);

  return { activated: true, companyId: invite.company_id };
}

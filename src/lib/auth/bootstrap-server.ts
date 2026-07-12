import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdminRole, isDesignatedPlatformAdmin } from "@/lib/auth/platform-admin";
import { activatePendingInviteForUser } from "@/lib/auth/activate-invite";

export type BootstrapResult =
  | { ok: true; isPlatformAdmin?: boolean; isTeamMember?: boolean; companyId?: string; created?: boolean }
  | { ok: false; error: string };

// profiles is not in generated Database types yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(admin: ReturnType<typeof createAdminClient>): any {
  return admin;
}

export async function bootstrapUserAccount(
  user: User,
  opts?: { companyName?: string; lraTin?: string },
): Promise<BootstrapResult> {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "Server auth is not configured" };
  }

  const companyName = (opts?.companyName ?? "").trim();
  const lraTin = (opts?.lraTin ?? "").trim();

  const { data: profile } = await db(admin)
    .from("profiles")
    .select("id, role, company_id, email")
    .eq("id", user.id)
    .maybeSingle();

  const designatedAdmin = isDesignatedPlatformAdmin(user.email);

  if (!profile) {
    const defaultCompanyName =
      companyName ||
      String(user.user_metadata?.company_name ?? "") ||
      user.email?.split("@")[0] ||
      "My Company";

    const { error: profileErr } = await db(admin).from("profiles").insert({
      id:           user.id,
      email:        user.email ?? "",
      role:         designatedAdmin ? "admin" : "member",
      company_name: defaultCompanyName,
    });
    if (profileErr) {
      console.error("[bootstrap] profile insert:", profileErr);
      return { ok: false, error: "Could not create user profile" };
    }
  } else if (designatedAdmin && !isPlatformAdminRole(profile.role)) {
    await db(admin).from("profiles").update({ role: "admin" }).eq("id", user.id);
  }

  const role = designatedAdmin ? "admin" : (profile?.role ?? "member");
  if (isPlatformAdminRole(role)) {
    return { ok: true, isPlatformAdmin: true };
  }

  // Pending team invite — join the inviter's company (never create a new one).
  const invite = await activatePendingInviteForUser(admin, user.id, user.email);
  if (invite.activated) {
    return { ok: true, companyId: invite.companyId, isTeamMember: true };
  }

  const { data: owned } = await db(admin)
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (owned?.[0]) {
    await db(admin).from("profiles").update({ company_id: owned[0].id }).eq("id", user.id);
    return { ok: true, companyId: owned[0].id };
  }

  const { data: memberOf } = await db(admin)
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1);

  if (memberOf?.[0]?.company_id) {
    await db(admin).from("profiles").update({ company_id: memberOf[0].company_id }).eq("id", user.id);
    return { ok: true, companyId: memberOf[0].company_id, isTeamMember: true };
  }

  // Self-serve company / free-trial creation is retired.
  // New companies are provisioned by Slipdesk ops or via a paid onboarding path.
  return {
    ok: false,
    error:
      "Access is invite-only. If you are a customer, please sign in. For demos, explore our interactive demo.",
  };
}

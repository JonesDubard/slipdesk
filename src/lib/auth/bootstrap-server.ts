import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdminRole, isDesignatedPlatformAdmin } from "@/lib/auth/platform-admin";
import { activatePendingInviteForUser } from "@/lib/auth/activate-invite";
import { chooseCompanyForUser, OWNED_COMPANY_FETCH_LIMIT, ownershipListIncomplete } from "@/lib/auth/resolve-company";

export type BootstrapResult =
  | { ok: true; isPlatformAdmin?: boolean; isTeamMember?: boolean; companyId?: string; created?: boolean }
  | { ok: false; error: string; status?: number };

// profiles is not in generated Database types yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(admin: ReturnType<typeof createAdminClient>): any {
  return admin;
}

export async function bootstrapUserAccount(
  user: User,
  opts?: { companyName?: string; lraTin?: string; inviteToken?: string; emailConfirmed?: boolean },
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
  const inviteToken = (opts?.inviteToken ?? "").trim()
    || String(user.user_metadata?.invite_token ?? "").trim();
  const emailConfirmed = opts?.emailConfirmed ?? Boolean(user.email_confirmed_at);
  const invite = await activatePendingInviteForUser(admin, user.id, user.email, {
    token: inviteToken,
    userMetadata: (user.user_metadata ?? null) as Record<string, unknown> | null,
    emailConfirmed,
  });
  if (invite.activated) {
    return { ok: true, companyId: invite.companyId, isTeamMember: true };
  }

  const [{ data: ownedRows }, { data: membershipRows }] = await Promise.all([
    db(admin)
      .from("companies")
      .select("id, name")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(OWNED_COMPANY_FETCH_LIMIT),
    db(admin)
      .from("company_members")
      .select("company_id, role")
      .eq("user_id", user.id)
      .eq("status", "active"),
  ]);

  const ownedList = (ownedRows ?? []) as { id: string; name?: string | null }[];
  const choice = chooseCompanyForUser({
    owned: ownedList.map((row) => ({ id: row.id, name: row.name ?? "" })),
    profileCompanyId: (profile?.company_id as string | null) ?? null,
    ownershipIncomplete: ownershipListIncomplete(ownedList.length),
    memberships: (membershipRows ?? []).map((row: { company_id: string; role?: string | null }) => ({
      companyId: row.company_id,
      role: row.role ?? null,
      status: "active" as const,
    })),
  });

  if (choice.ok) {
    await db(admin).from("profiles").update({ company_id: choice.companyId }).eq("id", user.id);
    return {
      ok: true,
      companyId: choice.companyId,
      isTeamMember: choice.source !== "owned",
    };
  }
  if (choice.code === "ambiguous" && choice.message) {
    return { ok: false, error: choice.message, status: 400 };
  }

  // Self-serve company / free-trial creation is retired.
  // New companies are provisioned by Slipdesk ops or via a paid onboarding path.
  if (invite.message && invite.reason && invite.reason !== "none") {
    return { ok: false, error: invite.message, status: 400 };
  }
  return {
    ok: false,
    error:
      "Access is invite-only. If you are a customer, please sign in. For demos, explore our interactive demo.",
  };
}

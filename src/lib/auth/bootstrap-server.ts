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

  const trialExpires = new Date();
  trialExpires.setDate(trialExpires.getDate() + 14);

  const { data: company, error: companyErr } = await db(admin)
    .from("companies")
    .insert({
      owner_id:            user.id,
      name:                companyName || String(user.user_metadata?.company_name ?? "") || "My Company",
      tin:                 lraTin || String(user.user_metadata?.lra_tin ?? ""),
      nasscorp_reg_no:     "",
      address:             "",
      phone:               "",
      email:               user.email ?? "",
      logo_url:            null,
      billing_bypass:      false,
      subscription_tier:   "basic",
      subscription_status: "trial",
      subscription_expires_at: null,
      trial_expires_at:    trialExpires.toISOString(),
      is_locked:           false,
      locked_reason:       null,
      mtn_momo_phone:      null,
      admin_email:         user.email ?? null,
      pricing_model:       "tiered",
    })
    .select("id")
    .single();

  if (companyErr || !company) {
    console.error("[bootstrap] company insert:", companyErr);
    return { ok: false, error: "Could not create company" };
  }

  await db(admin).from("profiles").update({
    company_id:   company.id,
    role:         "owner",
    company_name: companyName || String(user.user_metadata?.company_name ?? "") || "My Company",
    tin:          lraTin || null,
  }).eq("id", user.id);

  return { ok: true, companyId: company.id, created: true };
}

/**
 * Removes companies created by the team-invite bootstrap bug:
 * owner was invited to another team but got a solo company instead.
 *
 * Usage: node scripts/cleanup-orphan-companies.mjs [--dry-run]
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  try {
    const raw = readFileSync(".env.local", "utf8").replace(/^\uFEFF/, "");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch (err) {
    console.error("Could not read .env.local:", err.message);
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");
const idsArg = process.argv.find((a) => a.startsWith("--ids="));
const explicitIds = idsArg ? idsArg.slice(6).split(",").map((s) => s.trim()).filter(Boolean) : [];

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, key);

async function main() {
  const { data: companies, error: coErr } = await admin
    .from("companies")
    .select("id,name,owner_id,created_at,email")
    .order("created_at");
  if (coErr) throw coErr;

  const { data: profiles } = await admin.from("profiles").select("id,email,company_id,role");
  const { data: members } = await admin
    .from("company_members")
    .select("id,company_id,user_id,invited_email,status,role");

  const profileById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
  const orphans = [];

  for (const c of companies ?? []) {
    const owner = profileById[c.owner_id];
    const ownerEmail = (owner?.email || c.email || "").toLowerCase();
    const activeElsewhere = (members ?? []).filter(
      (m) => m.user_id === c.owner_id && m.status === "active" && m.company_id !== c.id,
    );
    const pendingInviteElsewhere = (members ?? []).filter(
      (m) =>
        m.status === "pending" &&
        (m.invited_email ?? "").toLowerCase() === ownerEmail &&
        m.company_id !== c.id,
    );
    if (!activeElsewhere.length && !pendingInviteElsewhere.length) continue;

    const target = activeElsewhere[0] ?? pendingInviteElsewhere[0];
    orphans.push({
      companyId: c.id,
      name: c.name,
      ownerEmail,
      reason: activeElsewhere.length ? "active_member_elsewhere" : "pending_invite_elsewhere",
      joinCompanyId: target.company_id,
      ownerId: c.owner_id,
    });
  }

  console.log(`Found ${orphans.length} orphan company/companies (dry-run=${dryRun}):`);
  for (const o of orphans) console.log(JSON.stringify(o));

  const toDelete = explicitIds.length
    ? explicitIds.map((id) => ({ companyId: id, reason: "explicit" }))
    : orphans;

  if (!toDelete.length) {
    console.log("Nothing to delete.");
    return;
  }

  for (const o of toDelete) {
    if (dryRun) {
      console.log(`Would delete ${o.companyId}`);
      continue;
    }

    const companyId = o.companyId;

    if (o.joinCompanyId && o.ownerId) {
      await admin
        .from("profiles")
        .update({ company_id: o.joinCompanyId, role: "member" })
        .eq("id", o.ownerId);
    } else {
      await admin.from("profiles").update({ company_id: null }).eq("company_id", companyId);
    }

    await admin.from("company_members").delete().eq("company_id", companyId);
    await admin.from("payments").delete().eq("company_id", companyId);
    await admin.from("employees").delete().eq("company_id", companyId);
    await admin.from("pay_runs").delete().eq("company_id", companyId);

    const { error: delErr } = await admin.from("companies").delete().eq("id", companyId);
    if (delErr) {
      console.error(`Failed to delete ${companyId}:`, delErr.message);
    } else {
      console.log(`Deleted company ${companyId}`);
    }
  }

  console.log(dryRun ? "Dry run complete — re-run without --dry-run to delete." : "Cleanup complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

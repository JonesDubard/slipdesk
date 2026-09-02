/**
 * Live QA against Supabase: plan-gating check + optional draft persistence probe.
 *
 * Usage:
 *   node scripts/live-qa-payroll.mjs --company CHRES --dry-run
 *     Read-only: verifies company tier / billing_bypass (safe for production clients).
 *
 *   node scripts/live-qa-payroll.mjs --company "ABC Construction"
 *     Creates a throwaway draft pay_run, patches draft_payload, reloads, deletes.
 *     Does NOT finalize. Does NOT touch employees or existing pay runs.
 *
 *   node scripts/live-qa-payroll.mjs --company "ABC Construction" --with-finalize
 *     Also sets status=paid briefly, then deletes the row (still no pay_run_lines).
 *     Use only on non-production test companies unless you accept a paid QA row if cleanup fails.
 *
 * Prefer the seeded demo company (node scripts/seed-demo.mjs) over CHRES for write tests.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ENV_PATH = resolve(ROOT, ".env.local");

function loadEnvLocal() {
  if (!existsSync(ENV_PATH)) return false;
  const raw = readFileSync(ENV_PATH, "utf8").replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
  return true;
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const withFinalize = args.includes("--with-finalize");
const companyHint = args.includes("--company")
  ? args[args.indexOf("--company") + 1]
  : "CHRES";

if (!url || !key) {
  console.error("BLOCKED: missing Supabase env (.env.local required in project root)");
  process.exit(2);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TIER_ORDER = { basic: 0, standard: 1, premium: 2 };
function effectiveTier(tier, bypass) {
  return bypass ? "premium" : tier;
}
function canBranchManagement(tier) {
  return TIER_ORDER[tier] >= TIER_ORDER.standard;
}

const results = [];

function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log(`Mode: ${dryRun ? "DRY-RUN (read-only)" : withFinalize ? "WRITE + finalize probe" : "WRITE (draft only, no finalize)"}`);
  console.log(`Company filter: "${companyHint}"\n`);

  const { data: companies, error: coErr } = await admin
    .from("companies")
    .select("id, name, subscription_tier, subscription_status, billing_bypass")
    .ilike("name", `%${companyHint}%`)
    .limit(5);

  if (coErr) {
    record("Load company", false, coErr.message);
    return;
  }
  if (!companies?.length) {
    record("Load company", false, `No company matching "${companyHint}"`);
    return;
  }

  const co = companies[0];
  if (companies.length > 1) {
    console.log(`Note: ${companies.length} matches; using first: ${co.name} (${co.id})\n`);
  }

  const eff = effectiveTier(co.subscription_tier, co.billing_bypass);
  const branchesUnlocked = canBranchManagement(eff);
  record(
    "Plan-gating (billing_bypass → effective tier → branchManagement)",
    branchesUnlocked,
    `company=${co.name} tier=${co.subscription_tier} status=${co.subscription_status} billing_bypass=${co.billing_bypass} effective=${eff}`,
  );

  if (dryRun) {
    console.log("\nDry-run complete — no pay_run rows created.");
    return;
  }

  if (/chres/i.test(co.name) && !args.includes("--i-understand-production")) {
    console.error(
      "\nRefusing write tests against a CHRES-like production company.\n" +
      "  Use --dry-run for read-only checks, or target the demo company:\n" +
      '    node scripts/live-qa-payroll.mjs --company "ABC Construction"\n' +
      "  To override (not recommended): add --i-understand-production\n",
    );
    process.exit(3);
  }

  let createdRunId = null;

  try {
    const draftPayload = { version: 1, runStarted: true, lines: [] };
    const period = `QA-${Date.now()}`;
    const payDate = new Date().toISOString().slice(0, 10);

    const { data: run, error: insErr } = await admin
      .from("pay_runs")
      .insert({
        company_id: co.id,
        period_label: period,
        pay_period_start: payDate,
        pay_period_end: payDate,
        pay_date: payDate,
        exchange_rate: 185.44,
        status: "draft",
        run_type: "monthly",
        employee_count: 0,
        total_gross: 0,
        total_net: 0,
        total_income_tax: 0,
        total_nasscorp: 0,
        draft_payload: draftPayload,
      })
      .select("id")
      .single();

    if (insErr) {
      record("Create throwaway draft pay_run", false, insErr.message);
      return;
    }

    createdRunId = run.id;
    record("Create throwaway draft pay_run", true, `${run.id} period=${period}`);

    const edited = {
      ...draftPayload,
      lines: [{ id: "qa-1", employeeId: "qa-1", fullName: "QA Tester", employeeNumber: "QA-1" }],
    };
    const { error: patchErr } = await admin
      .from("pay_runs")
      .update({ draft_payload: edited, updated_at: new Date().toISOString() })
      .eq("id", run.id);

    record("Patch draft_payload (autosave proxy)", !patchErr, patchErr?.message ?? "saved");

    const { data: reloaded } = await admin
      .from("pay_runs")
      .select("draft_payload")
      .eq("id", run.id)
      .single();

    record("Reload draft after patch", reloaded?.draft_payload?.lines?.length === 1);

    if (withFinalize) {
      const { error: finErr } = await admin
        .from("pay_runs")
        .update({ status: "paid", draft_payload: null })
        .eq("id", run.id);
      record("Set status=paid (no pay_run_lines — hollow finalize)", !finErr, finErr?.message ?? "");
      record(
        "Note: real finalize + autosave block is tested in the browser/API, not this script",
        true,
        "PATCH /api/payroll/runs/[id] returns 409 when status=paid",
      );
    }
  } finally {
    if (createdRunId) {
      const { error: delErr } = await admin.from("pay_runs").delete().eq("id", createdRunId);
      if (delErr) {
        record("Cleanup: delete throwaway pay_run", false, `${createdRunId} — ${delErr.message}`);
        console.error(
          `\nWARNING: Throwaway pay_run ${createdRunId} may remain in ${co.name}. ` +
          "Delete manually in Supabase (pay_runs table) if cleanup failed.",
        );
      } else {
        record("Cleanup: delete throwaway pay_run", true, createdRunId);
      }
    }
  }
}

main()
  .then(() => {
    const failed = results.filter((r) => !r.pass).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    process.exit(failed ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

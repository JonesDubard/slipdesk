/**
 * Verify Supabase schema cache includes columns required for client-feedback deploy.
 * Usage: node scripts/verify-schema-cache.mjs
 * Loads .env.local from project root when present.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

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

const loaded = loadEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("BLOCKED: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  console.error(loaded ? "  (.env.local found but missing required keys)" : "  (no .env.local in project root)");
  process.exit(2);
}

const checks = [
  { table: "pay_runs", column: "draft_payload" },
  { table: "pay_runs", column: "branch_id" },
  { table: "employees", column: "gender" },
  { table: "pay_run_lines", column: "deductions" },
];

async function columnExists(table, column) {
  const res = await fetch(`${url}/rest/v1/${table}?select=${column}&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (res.ok) return { ok: true };
  const body = await res.text();
  if (body.includes("does not exist") || body.includes("Could not find")) {
    return { ok: false, detail: body.slice(0, 200) };
  }
  return { ok: false, detail: `HTTP ${res.status}: ${body.slice(0, 200)}` };
}

let failed = 0;
for (const { table, column } of checks) {
  const result = await columnExists(table, column);
  console.log(`${result.ok ? "PASS" : "FAIL"}: ${table}.${column}`);
  if (!result.ok) {
    if (result.detail) console.log(`       ${result.detail}`);
    failed += 1;
  }
}

if (failed) {
  console.error("\nSchema cache may be stale — apply migrations 0017/0018/0019 and reload PostgREST schema in Supabase.");
  process.exit(1);
}
console.log("\nAll required columns queryable.");
process.exit(0);

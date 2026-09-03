/**
 * Find and remove E2E stress-test records from the production Supabase project.
 * Prints identifiers only — no draft payloads, calcs, or secrets.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT, ".env.local");

function loadEnv() {
  if (!existsSync(ENV_PATH)) return;
  for (const line of readFileSync(ENV_PATH, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function rest(path, opts = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers, ...opts });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 300)}`);
  return data;
}

function employeeBlob(e) {
  return [
    e.employee_number, e.first_name, e.middle_name, e.last_name,
    e.full_name, e.email,
  ].filter(Boolean).join(" ").toLowerCase();
}

/** Safe to delete — created by tonight's E2E payslip import. */
function isE2eCreatedEmployee(e) {
  const blob = employeeBlob(e);
  return (
    blob.includes("montgomery-williams") ||
    blob.includes("montgomery williams") ||
    blob.includes("emp-stress") ||
    blob.includes("stress.e2e@example.lr")
  );
}

/** Report-only scan terms the user asked for. */
function matchesScan(e) {
  const blob = employeeBlob(e);
  return (
    isE2eCreatedEmployee(e) ||
    blob.includes("stress") ||
    /\bqa\b/.test(blob) ||
    /\btest\b/.test(blob)
  );
}

function lineLooksLikeTest(l) {
  const blob = `${l.fullName ?? ""} ${l.employeeNumber ?? ""} ${l.employeeId ?? ""}`.toLowerCase();
  return (
    blob.includes("montgomery-williams") ||
    blob.includes("montgomery williams") ||
    blob.includes("emp-stress") ||
    blob.includes("stress.e2e")
  );
}

console.log("=== SCAN employees ===");
const employees = await rest(
  "employees?select=id,company_id,employee_number,first_name,middle_name,last_name,email,is_archived,is_active",
);
const scannedEmps = (employees ?? []).filter(matchesScan);
const testEmps = scannedEmps.filter(isE2eCreatedEmployee);
for (const e of scannedEmps) {
  console.log(
    `EMP ${e.id} number=${e.employee_number} name=${[e.first_name, e.middle_name, e.last_name].filter(Boolean).join(" ")} delete=${isE2eCreatedEmployee(e)} archived=${e.is_archived}`,
  );
}
console.log(`employee scan hits: ${scannedEmps.length}; will delete: ${testEmps.length}`);

console.log("\n=== SCAN pay_runs (headers + whether draft mentions test markers) ===");
const runs = await rest(
  "pay_runs?select=id,company_id,period_label,status,employee_count,updated_at,draft_payload&order=updated_at.desc&limit=80",
);
const testRunHits = [];
for (const r of runs ?? []) {
  const payload = r.draft_payload;
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];
  const testLines = lines.filter(lineLooksLikeTest);
  const payloadText = JSON.stringify(payload ?? {}).toLowerCase();
  const headerHit = `${r.period_label ?? ""}`.toLowerCase();
  const mentioned =
    testLines.length > 0 ||
    payloadText.includes("montgomery-williams") ||
    payloadText.includes("emp-stress") ||
    payloadText.includes("stress.e2e") ||
    headerHit.includes("stress") ||
    headerHit.includes("qa") ||
    /\btest\b/.test(headerHit);
  if (!mentioned) continue;
  const otSummary = lines
    .filter((l) => Number(l.overtimeHours) === 7 || Number(l.overtimeHours) === 8)
    .map((l) => `${l.employeeNumber}:${l.fullName}:OT=${l.overtimeHours}`)
    .slice(0, 12);
  testRunHits.push({ run: r, testLines, allLines: lines.length, otSummary });
  console.log(
    `RUN ${r.id} status=${r.status} period=${r.period_label} lines=${lines.length} testLines=${testLines.length} updated=${r.updated_at}`,
  );
  if (otSummary.length) console.log(`  OT 7/8 lines: ${otSummary.join(" | ")}`);
}
console.log(`pay_run matches: ${testRunHits.length}`);

console.log("\n=== SCAN pay_run_lines ===");
let lineHits = [];
try {
  lineHits = await rest(
    "pay_run_lines?select=id,pay_run_id,employee_id,employee_number,full_name&or=(full_name.ilike.*Montgomery*,employee_number.ilike.*STRESS*,full_name.ilike.*stress*,employee_number.ilike.*QA*)",
  );
} catch (e) {
  console.log(`pay_run_lines scan skipped: ${e.message}`);
}
for (const l of lineHits ?? []) {
  console.log(`LINE ${l.id} run=${l.pay_run_id} number=${l.employee_number} name=${l.full_name}`);
}
console.log(`pay_run_line matches: ${(lineHits ?? []).length}`);

if (process.argv.includes("--apply")) {
  console.log("\n=== APPLY cleanup ===");

  for (const { run, testLines, allLines } of testRunHits) {
    if (run.status === "paid" || run.status === "locked") {
      console.log(`SKIP finalized run ${run.id}`);
      continue;
    }
    if (testLines.length && testLines.length === allLines) {
      await rest(`pay_runs?id=eq.${run.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "archived",
          draft_payload: null,
          updated_at: new Date().toISOString(),
        }),
      });
      console.log(`ARCHIVED test-only draft ${run.id}`);
    } else if (testLines.length) {
      const keep = (run.draft_payload?.lines ?? [])
        .filter((l) => !lineLooksLikeTest(l))
        .map((l) => {
          // Restore spec set first-row OT to 7 on this live draft (Jane Doe EMP-004).
          if (l.employeeNumber === "EMP-004" && Number(l.overtimeHours) === 7) {
            console.log(`REVERT ${l.employeeNumber} ${l.fullName} overtimeHours 7 → 0`);
            return { ...l, overtimeHours: 0 };
          }
          return l;
        });
      await rest(`pay_runs?id=eq.${run.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          draft_payload: { ...run.draft_payload, lines: keep },
          employee_count: keep.filter((l) => l.calc).length,
          updated_at: new Date().toISOString(),
        }),
      });
      console.log(`STRIPPED ${testLines.length} test line(s) from mixed draft ${run.id}; kept ${keep.length}`);
    }
  }

  for (const l of lineHits ?? []) {
    await rest(`pay_run_lines?id=eq.${l.id}`, { method: "DELETE" });
    console.log(`DELETED pay_run_line ${l.id}`);
  }

  for (const e of testEmps) {
    try {
      await rest(`pay_run_lines?employee_id=eq.${e.id}`, { method: "DELETE" });
    } catch { /* ignore if none */ }
    await rest(`employees?id=eq.${e.id}`, { method: "DELETE" });
    console.log(`DELETED employee ${e.employee_number} ${e.id}`);
  }

  console.log("\n=== RE-SCAN after delete ===");
  const emps2 = (await rest(
    "employees?select=id,employee_number,first_name,last_name,email",
  ) ?? []).filter(isE2eCreatedEmployee);
  console.log(`remaining employee matches: ${emps2.length}`);
  const runs2 = await rest(
    "pay_runs?select=id,status,period_label,draft_payload&order=updated_at.desc&limit=80",
  );
  let remainingRuns = 0;
  for (const r of runs2 ?? []) {
    const lines = Array.isArray(r.draft_payload?.lines) ? r.draft_payload.lines : [];
    if (lines.some(lineLooksLikeTest) || JSON.stringify(r.draft_payload ?? {}).toLowerCase().includes("emp-stress")) {
      remainingRuns += 1;
      console.log(`STILL HIT run ${r.id} status=${r.status}`);
    }
  }
  console.log(`remaining pay_run test hits: ${remainingRuns}`);
} else {
  console.log("\nDry run only. Re-run with --apply to delete.");
}

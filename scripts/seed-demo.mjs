/**
 * Seed the shared Interactive Demo company: ABC Construction Ltd.
 *
 * Usage:
 *   node scripts/seed-demo.mjs
 *   node scripts/seed-demo.mjs --reset
 *
 * Requires .env.local with Supabase URL + service role key.
 * Writes DEMO_COMPANY_ID / DEMO_USER_EMAIL / DEMO_USER_PASSWORD into .env.local
 * if they are missing (password only generated once).
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ENV_PATH = resolve(ROOT, ".env.local");

function loadEnvLocal() {
  if (!existsSync(ENV_PATH)) return;
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
}

function upsertEnv(updates) {
  let content = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(content)) {
      content = content.replace(re, `${key}=${value}`);
    } else {
      content = content.trimEnd() + `\n${key}=${value}\n`;
    }
    process.env[key] = value;
  }
  writeFileSync(ENV_PATH, content, "utf8");
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const reset = process.argv.includes("--reset");

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_NAME = "ABC Construction Ltd.";
const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || "demo@slipdesk.internal";
const FIXED_COMPANY_ID = process.env.DEMO_COMPANY_ID || "a0000000-0000-4000-8000-0000000000d1";

const DEPARTMENTS = ["Operations", "Finance", "HR"];
const BRANCHES = ["Monrovia HQ", "Ganta Site"];

const EMPLOYEES = [
  { number: "EMP-001", first: "Mary", last: "Johnson", title: "Site Supervisor", dept: "Operations", branch: "Monrovia HQ", currency: "USD", rate: 8.5, allowances: 120, payment: "bank_transfer", bank: "Ecobank Liberia", account: "0012345678", county: "Montserrado" },
  { number: "EMP-002", first: "James", last: "Kollie", title: "Heavy Equipment Operator", dept: "Operations", branch: "Ganta Site", currency: "USD", rate: 7.25, allowances: 80, payment: "mtn_momo", momo: "0886123456", county: "Nimba" },
  { number: "EMP-003", first: "Fatu", last: "Kamara", title: "Payroll Officer", dept: "Finance", branch: "Monrovia HQ", currency: "USD", rate: 9.0, allowances: 150, payment: "bank_transfer", bank: "LBDI", account: "0098765432", county: "Montserrado" },
  { number: "EMP-004", first: "Joseph", last: "Harris", title: "Quantity Surveyor", dept: "Operations", branch: "Monrovia HQ", currency: "USD", rate: 11.0, allowances: 200, payment: "bank_transfer", bank: "GT Bank", account: "1122334455", county: "Montserrado" },
  { number: "EMP-005", first: "Edith", last: "Blamo", title: "HR Manager", dept: "HR", branch: "Monrovia HQ", currency: "USD", rate: 10.5, allowances: 175, payment: "bank_transfer", bank: "Ecobank Liberia", account: "5566778899", county: "Montserrado" },
  { number: "EMP-006", first: "Samuel", last: "Doe", title: "Mason", dept: "Operations", branch: "Ganta Site", currency: "LRD", rate: 650, allowances: 25000, payment: "orange_money", momo: "0776987654", county: "Nimba" },
  { number: "EMP-007", first: "Grace", last: "Wleh", title: "Accounts Assistant", dept: "Finance", branch: "Monrovia HQ", currency: "USD", rate: 6.5, allowances: 75, payment: "mtn_momo", momo: "0886234567", county: "Montserrado" },
  { number: "EMP-008", first: "Peter", last: "Tarpeh", title: "Safety Officer", dept: "Operations", branch: "Ganta Site", currency: "USD", rate: 7.75, allowances: 90, payment: "bank_transfer", bank: "Afriland", account: "9988776655", county: "Nimba" },
  { number: "EMP-009", first: "Comfort", last: "Sackie", title: "Recruitment Officer", dept: "HR", branch: "Monrovia HQ", currency: "USD", rate: 7.0, allowances: 85, payment: "bank_transfer", bank: "UBA Liberia", account: "4433221100", county: "Montserrado" },
  { number: "EMP-010", first: "Marcus", last: "Toe", title: "Electrician", dept: "Operations", branch: "Monrovia HQ", currency: "LRD", rate: 720, allowances: 30000, payment: "cash", county: "Montserrado" },
  { number: "EMP-011", first: "Hawa", last: "Kromah", title: "Office Administrator", dept: "HR", branch: "Monrovia HQ", currency: "USD", rate: 5.75, allowances: 50, payment: "mtn_momo", momo: "0886345678", county: "Montserrado" },
  { number: "EMP-012", first: "Daniel", last: "Flomo", title: "Foreman", dept: "Operations", branch: "Ganta Site", currency: "USD", rate: 9.25, allowances: 140, payment: "bank_transfer", bank: "Ecobank Liberia", account: "3344556677", county: "Nimba" },
  { number: "EMP-013", first: "Ruth", last: "Koffa", title: "Finance Manager", dept: "Finance", branch: "Monrovia HQ", currency: "USD", rate: 12.5, allowances: 250, payment: "bank_transfer", bank: "LBDI", account: "7788990011", county: "Montserrado" },
];

const PERIODS = [
  { label: "April 2026", start: "2026-04-01", end: "2026-04-30", status: "paid" },
  { label: "May 2026", start: "2026-05-01", end: "2026-05-31", status: "paid" },
  { label: "June 2026", start: "2026-06-01", end: "2026-06-30", status: "approved" },
];

function calcPays(emp) {
  const hours = 173.33;
  const base = emp.rate * hours;
  const gross = base + emp.allowances;
  const nasscorpEE = base * 0.04;
  const nasscorpER = base * 0.06;
  const tax = gross * 0.08;
  const net = gross - nasscorpEE - tax;
  return { hours, base, gross, nasscorpEE, nasscorpER, tax, net };
}

async function ensureDemoUser(password) {
  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = listed?.users?.find((u) => u.email?.toLowerCase() === DEMO_EMAIL.toLowerCase());
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password,
    email_confirm: true,
    user_metadata: { company_name: DEMO_NAME, is_demo: true },
  });
  if (error) throw error;
  return data.user.id;
}

async function wipeDemo(companyId) {
  console.log("Resetting demo company data…");
  const { data: runs } = await admin.from("pay_runs").select("id").eq("company_id", companyId);
  if (runs?.length) {
    await admin.from("pay_run_lines").delete().in("pay_run_id", runs.map((r) => r.id));
  }
  await admin.from("pay_run_lines").delete().eq("company_id", companyId);
  await admin.from("pay_runs").delete().eq("company_id", companyId);
  await admin.from("employee_salary_history").delete().eq("company_id", companyId);
  await admin.from("employees").delete().eq("company_id", companyId);
  await admin.from("departments").delete().eq("company_id", companyId);
  await admin.from("branches").delete().eq("company_id", companyId);
  await admin.from("compliance_snapshots").delete().eq("company_id", companyId);
  await admin.from("api_keys").delete().eq("company_id", companyId);
  await admin.from("notifications").delete().eq("company_id", companyId);
  await admin.from("audit_log").delete().eq("company_id", companyId);
}

async function main() {
  const password =
    process.env.DEMO_USER_PASSWORD ||
    `Demo-${randomBytes(9).toString("base64url")}!`;

  console.log("Ensuring demo auth user…");
  const ownerId = await ensureDemoUser(password);

  // Profile
  await admin.from("profiles").upsert({
    id: ownerId,
    email: DEMO_EMAIL,
    role: "owner",
    company_name: DEMO_NAME,
    company_id: FIXED_COMPANY_ID,
  });

  // Company
  const companyPayload = {
    id: FIXED_COMPANY_ID,
    owner_id: ownerId,
    name: DEMO_NAME,
    tin: "LR-DEMO-2026",
    nasscorp_reg_no: "NSS-DEMO-88421",
    address: "12 Broad Street, Monrovia, Montserrado",
    phone: "+231-77-000-DEMO",
    email: "hr@abcconstruction.lr",
    logo_url: null,
    billing_bypass: true,
    subscription_tier: "premium",
    subscription_status: "active",
    subscription_expires_at: null,
    trial_expires_at: null,
    is_locked: false,
    locked_reason: null,
    mtn_momo_phone: null,
    admin_email: DEMO_EMAIL,
    pricing_model: "tiered",
    brand_primary_color: "#002147",
    brand_secondary_color: "#50C878",
    email_footer: "ABC Construction Ltd. · Demo workspace",
    payslip_footer: "This is a Slipdesk interactive demo payslip.",
    is_demo: true,
  };

  const { id: companyId, ...companyFields } = companyPayload;
  const { data: existingCo, error: findErr } = await admin
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .maybeSingle();
  if (findErr) console.warn("companies lookup:", findErr.message);

  if (existingCo) {
    const { error } = await admin.from("companies").update(companyFields).eq("id", companyId);
    if (error) {
      if (String(error.message).includes("is_demo")) {
        console.error("\nApply migration 0009_demo_company_flag.sql in Supabase first.\n");
      }
      throw error;
    }
  } else {
    const { error } = await admin.from("companies").insert(companyPayload);
    if (error) {
      if (error.code === "23505") {
        const { error: upErr } = await admin.from("companies").update(companyFields).eq("id", companyId);
        if (upErr) throw upErr;
      } else {
        if (String(error.message).includes("is_demo")) {
          console.error("\nApply migration 0009_demo_company_flag.sql in Supabase first.\n");
        }
        throw error;
      }
    }
  }

  await admin.from("profiles").update({ company_id: FIXED_COMPANY_ID, role: "owner" }).eq("id", ownerId);

  // Membership
  await admin.from("company_members").upsert(
    {
      company_id: FIXED_COMPANY_ID,
      user_id: ownerId,
      role: "company_owner",
      invited_email: DEMO_EMAIL,
      status: "active",
    },
    { onConflict: "company_id,user_id" },
  );

  if (reset || existingCo) {
    await wipeDemo(FIXED_COMPANY_ID);
  }

  // Org units
  for (const name of DEPARTMENTS) {
    const { error } = await admin.from("departments").insert({ company_id: FIXED_COMPANY_ID, name });
    if (error && error.code !== "23505") throw error;
  }
  for (const name of BRANCHES) {
    const { error } = await admin.from("branches").insert({ company_id: FIXED_COMPANY_ID, name });
    if (error && error.code !== "23505") throw error;
  }

  // Employees
  console.log(`Seeding ${EMPLOYEES.length} employees…`);
  const empIds = [];
  for (const e of EMPLOYEES) {
    const row = {
      company_id: FIXED_COMPANY_ID,
      employee_number: e.number,
      first_name: e.first,
      last_name: e.last,
      job_title: e.title,
      department: e.dept,
      branch: e.branch,
      position: e.title,
      email: `${e.first.toLowerCase()}.${e.last.toLowerCase()}@abcconstruction.lr`,
      phone: e.momo || "0886000000",
      county: e.county,
      start_date: "2024-01-15",
      employment_type: "full_time",
      currency: e.currency,
      rate: e.rate,
      standard_hours: 173.33,
      allowances: e.allowances,
      nasscorp_number: `NSS-${e.number.replace("EMP-", "")}`,
      tax_id: `TIN-${e.number.replace("EMP-", "")}`,
      payment_method: e.payment,
      bank_name: e.bank || "",
      account_number: e.account || "",
      momo_number: e.momo || "",
      is_active: true,
      is_archived: false,
      employment_status: "active",
    };
    const { data, error } = await admin.from("employees").insert(row).select("id, employee_number, currency, rate, allowances").single();
    if (error) throw error;
    empIds.push({ ...data, meta: e });
  }

  // Pay runs
  console.log("Seeding 3 months of payroll…");
  for (const period of PERIODS) {
    let totals = { gross: 0, net: 0, tax: 0, nass: 0 };
    for (const emp of empIds) {
      const c = calcPays(emp.meta);
      const factor = emp.meta.currency === "LRD" ? 1 / 185.44 : 1;
      totals.gross += c.gross * factor;
      totals.net += c.net * factor;
      totals.tax += c.tax * factor;
      totals.nass += c.nasscorpEE * factor;
    }

    const baseRun = {
      company_id: FIXED_COMPANY_ID,
      period_label: period.label,
      pay_period_start: period.start,
      pay_period_end: period.end,
      pay_date: period.end,
      exchange_rate: 185.44,
      status: period.status,
      employee_count: empIds.length,
      total_gross: Math.round(totals.gross * 100) / 100,
      total_net: Math.round(totals.net * 100) / 100,
      total_income_tax: Math.round(totals.tax * 100) / 100,
      total_nasscorp: Math.round(totals.nass * 100) / 100,
    };

    let runRes = await admin
      .from("pay_runs")
      .insert({
        ...baseRun,
        run_type: "monthly",
        workflow_stage: period.status === "paid" ? "released" : "approved",
      })
      .select("id")
      .single();
    if (runRes.error) {
      runRes = await admin.from("pay_runs").insert(baseRun).select("id").single();
    }
    if (runRes.error) throw runRes.error;
    await insertLines(runRes.data.id, empIds);
  }

  // Compliance snapshot (optional — table may not exist yet)
  {
    const { error: snapErr } = await admin.from("compliance_snapshots").insert({
      company_id: FIXED_COMPANY_ID,
      period_label: "June 2026",
      score: 92,
      critical_count: 0,
      warning_count: 1,
      payroll_ready: true,
      lra_ready: true,
      nasscorp_ready: true,
      details: { note: "Demo snapshot" },
    });
    if (snapErr) console.warn("compliance_snapshots skipped:", snapErr.message);
  }

  upsertEnv({
    NEXT_PUBLIC_ENABLE_DEMO_MODE: "true",
    DEMO_COMPANY_ID: FIXED_COMPANY_ID,
    DEMO_USER_EMAIL: DEMO_EMAIL,
    DEMO_USER_PASSWORD: password,
    NEXT_PUBLIC_BOOK_DEMO_URL: process.env.NEXT_PUBLIC_BOOK_DEMO_URL || "#contact",
  });

  console.log("\nDemo seed complete.");
  console.log(`  Company: ${DEMO_NAME} (${FIXED_COMPANY_ID})`);
  console.log(`  User:    ${DEMO_EMAIL}`);
  console.log(`  Enter:   /demo/enter`);
  console.log("  Env vars written to .env.local\n");
}

async function insertLines(payRunId, empIds) {
  const rows = empIds.map((emp) => {
    const e = emp.meta;
    const c = calcPays(e);
    return {
      pay_run_id: payRunId,
      company_id: FIXED_COMPANY_ID,
      employee_id: emp.id,
      employee_number: e.number,
      full_name: `${e.first} ${e.last}`,
      job_title: e.title,
      department: e.dept,
      currency: e.currency,
      rate: e.rate,
      regular_hours: c.hours,
      overtime_hours: 0,
      holiday_hours: 0,
      additional_earnings: e.allowances,
      deductions: 0,
      exchange_rate: 185.44,
      gross_pay: Math.round(c.gross * 100) / 100,
      income_tax: Math.round(c.tax * 100) / 100,
      nasscorp_ee: Math.round(c.nasscorpEE * 100) / 100,
      nasscorp_er: Math.round(c.nasscorpER * 100) / 100,
      net_pay: Math.round(c.net * 100) / 100,
    };
  });
  const { error } = await admin.from("pay_run_lines").insert(rows);
  if (error) throw error;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

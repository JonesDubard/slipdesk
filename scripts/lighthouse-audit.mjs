/**
 * Lighthouse audit across marketing + authenticated (demo) app routes.
 * Usage: node scripts/lighthouse-audit.mjs [baseUrl]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const chromeLauncher = require("chrome-launcher");
const lighthouseMod = require("lighthouse");
const lighthouse = typeof lighthouseMod === "function" ? lighthouseMod : lighthouseMod.default;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || "http://localhost:3000";
const OUT_DIR = path.join(__dirname, "..", ".lighthouse");

const PUBLIC_PAGES = [
  { id: "home", url: `${BASE}/` },
  { id: "login", url: `${BASE}/login` },
  { id: "signup", url: `${BASE}/signup` },
];

const AUTH_PAGES = [
  { id: "dashboard", url: `${BASE}/dashboard?demo=1` },
  { id: "employees", url: `${BASE}/employees` },
  { id: "payroll", url: `${BASE}/payroll` },
  { id: "reports", url: `${BASE}/reports` },
  { id: "billing", url: `${BASE}/billing` },
  { id: "settings", url: `${BASE}/settings` },
];

function score(cat) {
  if (!cat || cat.score == null) return null;
  return Math.round(cat.score * 100);
}

function metric(audits, id) {
  const a = audits[id];
  if (!a) return null;
  return {
    display: a.displayValue ?? null,
    numeric: a.numericValue ?? null,
  };
}

async function runLh(url, chrome, cookieHeader) {
  const opts = {
    port: chrome.port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    formFactor: "desktop",
    screenEmulation: { disabled: true },
    throttlingMethod: "provided",
    disableStorageReset: true,
  };
  if (cookieHeader) {
    opts.extraHeaders = { Cookie: cookieHeader };
  }
  const result = await lighthouse(url, opts);
  const lhr = result.lhr;
  return {
    url,
    scores: {
      performance: score(lhr.categories.performance),
      accessibility: score(lhr.categories.accessibility),
      bestPractices: score(lhr.categories["best-practices"]),
      seo: score(lhr.categories.seo),
    },
    metrics: {
      fcp: metric(lhr.audits, "first-contentful-paint"),
      lcp: metric(lhr.audits, "largest-contentful-paint"),
      tbt: metric(lhr.audits, "total-blocking-time"),
      cls: metric(lhr.audits, "cumulative-layout-shift"),
      si: metric(lhr.audits, "speed-index"),
    },
    opportunities: Object.values(lhr.audits)
      .filter((a) => a.details?.type === "opportunity" && (a.numericValue ?? 0) > 50)
      .sort((a, b) => (b.numericValue ?? 0) - (a.numericValue ?? 0))
      .slice(0, 5)
      .map((a) => ({ id: a.id, title: a.title, display: a.displayValue })),
    a11yFailures: Object.values(lhr.audits)
      .filter((a) => a.score !== null && a.score < 1 && lhr.categories.accessibility.auditRefs.some((r) => r.id === a.id))
      .slice(0, 8)
      .map((a) => ({ id: a.id, title: a.title })),
  };
}

async function fetchCookieHeader() {
  // Follow demo enter redirects and capture Set-Cookie
  const res = await fetch(`${BASE}/api/demo/enter`, { redirect: "manual" });
  const raw = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [];
  const location = res.headers.get("location");
  const cookies = [];
  for (const c of raw) {
    cookies.push(c.split(";")[0]);
  }
  // If Node didn't expose getSetCookie, fall through without cookies
  if (cookies.length === 0) {
    // Retry with undici raw - parse from headers (may merge)
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      for (const part of setCookie.split(/,(?=\s*[^;]+=)/)) {
        cookies.push(part.split(";")[0].trim());
      }
    }
  }
  return { cookieHeader: cookies.join("; "), location, status: res.status };
}

async function measureDemoFlow(cookieHeader) {
  const t0 = Date.now();
  const enter = await fetch(`${BASE}/api/demo/enter`, { redirect: "manual" });
  const enterMs = Date.now() - t0;
  const loc = enter.headers.get("location") || `${BASE}/dashboard?demo=1`;

  const t1 = Date.now();
  const dash = await fetch(loc, {
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
    redirect: "follow",
  });
  const dashHtmlMs = Date.now() - t1;
  return {
    demoEnterStatus: enter.status,
    demoEnterMs: enterMs,
    dashboardStatus: dash.status,
    dashboardHtmlMs: dashHtmlMs,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("Acquiring demo session cookies…");
  const { cookieHeader, location, status } = await fetchCookieHeader();
  console.log(`demo enter → ${status} ${location || ""} cookies=${cookieHeader ? "yes" : "NO"}`);

  const CHROME_PATH =
  process.env.CHROME_PATH ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

  fs.mkdirSync(path.join(OUT_DIR, "chrome-profile"), { recursive: true });
  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
    chromePath: CHROME_PATH,
    userDataDir: path.join(OUT_DIR, "chrome-profile"),
  });

  const pages = [];
  try {
    for (const p of PUBLIC_PAGES) {
      console.log(`Lighthouse ${p.id}…`);
      const r = await runLh(p.url, chrome, null);
      pages.push({ ...p, ...r });
      console.log(`  perf=${r.scores.performance} a11y=${r.scores.accessibility} bp=${r.scores.bestPractices} seo=${r.scores.seo}`);
    }

    if (cookieHeader) {
      for (const p of AUTH_PAGES) {
        console.log(`Lighthouse ${p.id}…`);
        const r = await runLh(p.url, chrome, cookieHeader);
        pages.push({ ...p, ...r });
        console.log(`  perf=${r.scores.performance} a11y=${r.scores.accessibility} bp=${r.scores.bestPractices} seo=${r.scores.seo}`);
      }
    } else {
      console.warn("Skipping auth pages — no demo cookies captured.");
    }

    const flow = await measureDemoFlow(cookieHeader);
    const summary = {
      auditedAt: new Date().toISOString(),
      base: BASE,
      formFactor: "desktop",
      note: "Desktop, provided throttling (local). Dev server scores are directional, not production CI.",
      demoFlow: flow,
      pages,
    };

    const outPath = path.join(OUT_DIR, "audit-after.json");
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
    console.log(`Wrote ${outPath}`);
  } finally {
    try {
      await chrome.kill();
    } catch {
      // Windows/Edge often EPERM on temp-profile cleanup; results already captured.
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

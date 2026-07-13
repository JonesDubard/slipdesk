/**
 * Measure Interactive Demo load using Edge via CDP page target.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const chromeLauncher = require("chrome-launcher");
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME_PATH =
  process.env.CHROME_PATH ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function connect(wsUrl) {
  const WebSocket = (await import("ws")).default;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.on("open", () => {
      const send = (method, params = {}) =>
        new Promise((res, rej) => {
          const mid = ++id;
          pending.set(mid, { res, rej });
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      resolve({ send, close: () => ws.close() });
    });
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      }
    });
    ws.on("error", reject);
  });
}

async function waitFor(send, expression, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { result } = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    if (result?.value) return result.value;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

async function main() {
  const profile = path.join(__dirname, "..", ".lighthouse", "chrome-profile-measure");
  fs.mkdirSync(profile, { recursive: true });
  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-allow-origins=*"],
    chromePath: CHROME_PATH,
    userDataDir: profile,
  });

  try {
    // Prefer a page target (not browser root) — Edge browser WS doesn't expose Page.*
    let pageWs = null;
    for (let i = 0; i < 40 && !pageWs; i++) {
      const targets = await fetch(`http://127.0.0.1:${chrome.port}/json/list`).then((r) => r.json());
      const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) pageWs = page.webSocketDebuggerUrl;
      else await new Promise((r) => setTimeout(r, 200));
    }
    if (!pageWs) throw new Error("No page CDP target found");

    const { send, close } = await connect(pageWs);
    await send("Page.enable");
    await send("Runtime.enable");

    const t0 = Date.now();
    await send("Page.navigate", { url: `${BASE}/` });
    await waitFor(send, `!!document.querySelector('a[href="/api/demo/enter"]')`, 60_000);
    const tHomeReady = Date.now();

    const tClick = Date.now();
    await send("Runtime.evaluate", {
      expression: `document.querySelector('a[href="/api/demo/enter"]').click()`,
    });

    const urlOk = await waitFor(
      send,
      `location.href.includes("/dashboard")`,
      60_000,
    );
    const urlMs = urlOk ? Date.now() - tClick : null;

    const content = await waitFor(
      send,
      `(() => {
        const text = document.body?.innerText || "";
        const pulses = document.querySelectorAll(".animate-pulse").length;
        const hasContent = /ABC Construction|active employee/i.test(text);
        const spinner = /Starting interactive demo/i.test(text);
        return hasContent && !spinner && pulses < 3;
      })()`,
      90_000,
    );
    const contentMs = content ? Date.now() - tClick : null;

    const href = await send("Runtime.evaluate", {
      expression: `location.href`,
      returnByValue: true,
    });

    const out = {
      homeReadyMs: tHomeReady - t0,
      clickToDashboardUrlMs: urlMs,
      clickToContentMs: contentMs,
      finalUrl: href.result?.value,
    };
    console.log(JSON.stringify(out, null, 2));
    fs.mkdirSync(path.join(__dirname, "..", ".lighthouse"), { recursive: true });
    fs.writeFileSync(
      path.join(__dirname, "..", ".lighthouse", "demo-timing-after.json"),
      JSON.stringify(out, null, 2),
    );
    close();
  } finally {
    try {
      await chrome.kill();
    } catch {
      /* ignore */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

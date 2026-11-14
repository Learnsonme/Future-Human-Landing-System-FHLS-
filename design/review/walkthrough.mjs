// Headless Chrome walkthrough of the deployed FHLS site via the DevTools protocol.
// node design/review/walkthrough.mjs <outdir> [url]   (needs Google Chrome; screenshots each screen, desktop + phone)
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = process.argv[2];
const URL = process.argv[3] || "https://futurehumanlandingsystem.netlify.app/web/";
const PORT = 9333;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "fhls-"))}`,
  "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--window-size=1440,900", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, id = 0;
const pending = new Map();
const logs = [];
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = tabs.find((t) => t.type === "page");
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      ws.onmessage = (m) => {
        const d = JSON.parse(m.data);
        if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
        if (d.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(d.params.type))
          logs.push(`${d.params.type}: ${d.params.args.map((a) => a.value ?? a.description).join(" ")}`);
        if (d.method === "Runtime.exceptionThrown") logs.push("exception: " + d.params.exceptionDetails.exception?.description);
      };
      return;
    } catch { await sleep(200); }
  }
  throw new Error("no chrome");
}
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, name + ".png"), Buffer.from(r.result.data, "base64"));
  console.log("shot", name);
};
const click = (sel) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return "missing"; e.click(); return "ok"})()`);

async function viewport(w, h, mobile = false) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
}

async function run(label, w, h, mobile, reduced) {
  await viewport(w, h, mobile);
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
  await evaluate("try{localStorage.clear()}catch(e){}");
  await send("Page.navigate", { url: URL });
  await sleep(7000);
  await shot(`${label}-1-landing`);
  console.log(label, "start:", await click("#start"));
  await sleep(150); await shot(`${label}-2a-transition-150`);
  await sleep(230); await shot(`${label}-2b-transition-380`);
  await sleep(220); await shot(`${label}-2c-transition-600`);
  await sleep(1300); await shot(`${label}-3-modes`);
  console.log(label, "beginner:", await click('.mode[data-mode="beginner"]'));
  await sleep(4000); await shot(`${label}-4-app-beginner`);
  const sites = await evaluate(`[...document.querySelectorAll("#site-list button")].map(b=>b.textContent.trim()).slice(0,20)`);
  console.log(label, "sites:", JSON.stringify(sites));
  await evaluate(`(()=>{const b=[...document.querySelectorAll("#site-list button")].find(b=>/Connecting Ridge/.test(b.textContent)); (b||document.querySelector("#site-list button")).click()})()`);
  await sleep(6000); await shot(`${label}-5-site-beginner`);
  if (!mobile) {
    await click("#change-mode"); await sleep(1800);
    await click('.mode[data-mode="intermediate"]'); await sleep(4000); await shot(`${label}-6-site-intermediate`);
    await click("#change-mode"); await sleep(1800);
    await click('.mode[data-mode="advanced"]'); await sleep(4000); await shot(`${label}-7-site-advanced`);
    const full = await evaluate("document.documentElement.scrollHeight");
    await viewport(w, Math.min(full, 4000)); await sleep(1500); await shot(`${label}-8-advanced-full`); await viewport(w, h);
  }
}

await connect();
await send("Page.enable"); await send("Runtime.enable");
try {
  await run("desk", 1440, 900, false, false);
  await run("phone", 390, 844, true, false);
} finally {
  console.log("console errors/warnings:", logs.length ? "\n  " + [...new Set(logs)].join("\n  ") : "none");
  chrome.kill();
}

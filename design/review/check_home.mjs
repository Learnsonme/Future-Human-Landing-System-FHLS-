// H3 · automated checks for design/acceptance_home.md (needs Google Chrome).
// node design/review/check_home.mjs [url]     default: http://127.0.0.1:8765/web/
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL = process.argv[2] || "http://127.0.0.1:8765/web/";
const PORT = 9334;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "fhls-h3-"))}`,
  "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--window-size=1440,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const errors = [];
for (let i = 0; i < 50 && !ws; i++) {
  try {
    const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page");
    ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  } catch { ws = null; await sleep(200); }
}
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description?.split("\n")[0]);
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value ?? a.description).join(" "));
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => (await send("Runtime.evaluate", { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
const results = [];
const check = (row, ok, note = "") => { results.push({ row, ok, note }); console.log(`${ok ? "PASS" : "FAIL"}  ${row}  ${note}`); };

const visible = (sel) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; const r=e.getBoundingClientRect(), s=getComputedStyle(e); return r.width>0&&r.height>0&&s.visibility!=="hidden"&&s.display!=="none"&&!e.closest("[hidden]")})()`;
const screenOn = (name) => `return ${visible("#screen-" + name)} && document.querySelector("#screen-${name}").classList.contains("is-active") || ${visible("#screen-" + name)}`;
const click = (sel) => js(`document.querySelector(${JSON.stringify(sel)}).click(); return true`);
const canvases = () => js(`return document.querySelectorAll("canvas").length`);

async function open(reduced = false, w = 1440, h = 900, mobile = false) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
  await send("Page.navigate", { url: URL }); await sleep(6000);
}
async function toApp(mode) {
  await click("#start"); await sleep(1600);
  await click(`.mode[data-mode="${mode}"]`); await sleep(2500);
}
const pickSite = (name) => js(`const b=[...document.querySelectorAll("#site-list button")].find(b=>b.textContent.includes(${JSON.stringify(name)})); b.click(); return !!b`);

await send("Page.enable"); await send("Runtime.enable");
try {
  // ---------- A: placement and wording, every mode, before/after a site ----------
  await open();
  check("A2 HOME on mode picker", await (async () => { await click("#start"); await sleep(1600); return js(`return ${visible("#home-from-modes")}`); })());
  for (const mode of ["beginner", "intermediate", "advanced"]) {
    await click(`.mode[data-mode="${mode}"]`); await sleep(2500);
    const before = await js(`const bar=document.querySelector(".appbar"); const f=[...bar.querySelectorAll("button,a,input,select,[tabindex]")].filter(e=>e.offsetParent)[0]; return f && f.id`);
    await pickSite("Connecting Ridge"); await sleep(3000);
    const after = await js(`return ${visible("#home-from-app")}`);
    check(`A1 HOME first in app bar (${mode})`, before === "home-from-app" && after, `first focusable: ${before}`);
    await click("#change-mode"); await sleep(1600);
  }
  check("A4 accessible name", await js(`return document.querySelector("#home-from-app").getAttribute("aria-label")`) === "Home: back to the start screen");

  // ---------- B: round trips keep state ----------
  await click('.mode[data-mode="intermediate"]'); await sleep(2500);
  await pickSite("Connecting Ridge"); await sleep(3000);
  await js(`const d=document.querySelector("#date"); d.value="2027-06-01"; d.dispatchEvent(new Event("input",{bubbles:true})); d.dispatchEvent(new Event("change",{bubbles:true})); return true`); await sleep(800);
  const stateBefore = await js(`return {site: document.querySelector(".panel h2, .panel h3, #panel h2")?.textContent?.trim(), date: document.querySelector("#date").value}`);
  await click("#home-from-app"); await sleep(1600);
  check("B1 HOME shows landing", await js(screenOn("landing")));
  // WebGL canvases read back blank without preserveDrawingBuffer, so compare real screenshots instead
  const clip = await js(`const c=[...document.querySelectorAll("#screen-landing canvas")].sort((a,b)=>b.width-a.width)[0]; if(!c) return null; const r=c.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,scale:0.5}`);
  const snap = async () => (await send("Page.captureScreenshot", { format: "png", clip })).result.data;
  const rot = !clip ? "no landing canvas" : await (async () => { const a = await snap(); await sleep(2500); return (await snap()) !== a ? "changes" : "static"; })();
  check("B1 landing Moon renders and rotates", rot === "changes", `canvas: ${rot}`);
  await click("#start"); await sleep(1600); await click('.mode[data-mode="intermediate"]'); await sleep(3000);
  const stateAfter = await js(`return {site: document.querySelector(".panel h2, .panel h3, #panel h2")?.textContent?.trim(), date: document.querySelector("#date").value}`);
  check("B2 site and date kept after round trip", JSON.stringify(stateBefore) === JSON.stringify(stateAfter), `${JSON.stringify(stateBefore)} → ${JSON.stringify(stateAfter)}`);

  // B5: Home during a fly-to
  await pickSite("Mons Mouton"); await sleep(300);
  await click("#home-from-app"); await sleep(2500);
  check("B5 HOME during fly-to lands on landing", await js(screenOn("landing")));
  await click("#start"); await sleep(1600); await click('.mode[data-mode="beginner"]'); await sleep(2500);
  await pickSite("Nobile Rim 2"); await sleep(3500);
  check("B5 next fly-to still works", await js(`return document.body.textContent.includes("Nobile Rim 2")`));

  // B6: five round trips, no extra canvases
  const c0 = await canvases();
  for (let i = 0; i < 5; i++) {
    await click("#home-from-app"); await sleep(1500);
    await click("#start"); await sleep(1500); await click('.mode[data-mode="beginner"]'); await sleep(2000);
  }
  const c1 = await canvases();
  check("B6 five round trips: canvas count stable", c0 === c1, `${c0} → ${c1}`);

  // ---------- C: focus ----------
  await click("#home-from-app"); await sleep(1600);
  const focus = await js(`const a=document.activeElement; return a ? (a.tagName + (a.id?"#"+a.id:"") + " " + (a.textContent||"").trim().slice(0,40)) : "none"`);
  check("C2 focus moves to the new screen's heading", /^H[12]/.test(focus), focus);

  // ---------- D: reduced motion ----------
  await open(true);
  await click("#start"); const t0 = Date.now(); let swapped = false;
  for (let i = 0; i < 20 && !swapped; i++) { swapped = await js(screenOn("modes")); if (!swapped) await sleep(25); }
  check("D1 reduced motion: instant swap", swapped && Date.now() - t0 < 400, `${Date.now() - t0} ms`);

  // ---------- E: phone ----------
  await open(false, 390, 844, true); await toApp("beginner");
  const box = await js(`const r=document.querySelector("#home-from-app").getBoundingClientRect(); const bar=document.querySelector(".appbar").getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top-bar.top)}`);
  check("A3/E2 phone: HOME in first row, ≥44×44 target", box && box.w >= 44 && box.h >= 44 && box.top < 20, JSON.stringify(box));
} finally {
  check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
  chrome.kill(); process.exit(0);
}

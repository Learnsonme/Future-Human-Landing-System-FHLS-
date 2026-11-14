// V8 / M1 browser check with plain Chrome DevTools (no Playwright needed).
// Serve the repo root first (python3 -m http.server 8765 --bind 127.0.0.1), then:
//   node viewer/tests/v8-browser.mjs [outdir]
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = process.argv[2] || join(tmpdir(), "fhls-v8"); mkdirSync(OUT, { recursive: true });
const BASE = process.env.FHLS_TEST_URL || "http://127.0.0.1:8765";
const PORT = 9336;
const chrome = spawn(process.env.FHLS_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "fhls-v8-"))}`,
  "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--window-size=900,700", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const errors = [];
for (let i = 0; i < 50 && !ws; i++) {
  try { const p = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page");
    ws = new WebSocket(p.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); } catch { ws = null; await sleep(200); }
}
ws.onmessage = (m) => { const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description?.split("\n")[0]);
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value ?? a.description).join(" ")); };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (e) => (await send("Runtime.evaluate", { expression: `(async()=>{${e}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (name) => writeFileSync(join(OUT, name + ".png"), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));

const PLACES = [
  ["artemis-connecting-ridge", -89.53432, -150.05233, "LOLA-40m"],
  ["south-cap", -87, 45, "LOLA-120m"],
  ["north-pole-peary", 88.6, 25, "LOLA-120m"],
  ["tycho", -43.3, -11.2, "LOLA-474m"],
  ["copernicus", 9.6, -20.1, "LOLA-474m"],
  ["date-line", 4, 179.9, "LOLA-474m"],
];
let pass = 0, fail = 0;
const check = (name, ok, note = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${note}`); };
try {
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: `${BASE}/viewer/tests/embed.html` }); await sleep(1000);
  const t0 = Date.now();
  await js(`await window.embeddedViewer.ready; return true`);
  check("viewer ready", true, `${Date.now() - t0} ms`);
  for (const [name, lat, lon, expect] of PLACES) {
    const started = Date.now();
    await js(`window.__fly = window.embeddedViewer.flyTo(${lat}, ${lon}); return true`);
    // the flight must start at once (M1), then terrain loads during it
    let flying = false; for (let i = 0; i < 200 && !flying; i++) { flying = await js(`return window.embeddedViewer.getDiagnostics().flying`); if (!flying) await sleep(10); }
    const startMs = Date.now() - started;
    await sleep(900); await shot(`${name}-1-midflight`);
    const res = await js(`return await window.__fly`);
    let ready = false; for (let i = 0; i < 100 && !ready; i++) { ready = await js(`return window.embeddedViewer.getStatus().phase === 'ready'`); if (!ready) await sleep(50); }
    const loadMs = Date.now() - started;
    await sleep(1200); await shot(`${name}-2-arrived`);
    const st = await js(`const s=window.embeddedViewer.getStatus(), d=window.embeddedViewer.getDiagnostics(); return {terrain:s.terrain, message:s.message, meshes:d.terrainMeshes, shadows:d.shadows.enabled, frames:d.renderFrames, tris:d.memory}`);
    const f0 = st.frames; await sleep(1000); const f1 = await js(`return window.embeddedViewer.getDiagnostics().renderFrames`);
    check(`${name}: terrain ${expect}`, st.terrain === expect && !res.cancelled,
      `got ${st.terrain} · ${st.meshes} meshes · shadows ${st.shadows} · flight started after ${startMs} ms · terrain in ${loadMs} ms · ~${f1 - f0} fps (software GL)`);
    if (startMs > 300) check(`${name}: flight starts at once`, false, `${startMs} ms`);
  }
  // reduced motion: instant, no fade left behind
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const r = await js(`const t=performance.now(); const res=await window.embeddedViewer.flyTo(-20, 60); return {ms: performance.now()-t, flying: window.embeddedViewer.getDiagnostics().flying, res}`);
  check("reduced motion: fly-to cuts instantly", !r.flying && !r.res.cancelled, `${Math.round(r.ms)} ms incl. tile load`);
  await send("Emulation.setEmulatedMedia", { features: [] });
  // cancelling mid-fade must not leave transparent terrain
  await js(`window.embeddedViewer.flyTo(30, -60); return true`); await sleep(500);
  await js(`window.__f2 = window.embeddedViewer.flyTo(-60, 100); return true`);
  const r2 = await js(`const r = await window.__f2; for (let i = 0; i < 100 && window.embeddedViewer.getStatus().phase !== 'ready'; i++) await new Promise(r => setTimeout(r, 50)); await new Promise(r => setTimeout(r, 1500)); return {r, flying: window.embeddedViewer.getDiagnostics().flying, terrain: window.embeddedViewer.getStatus().terrain}`);
  check("superseded flight ends cleanly", !r2.r.cancelled && !r2.flying && r2.terrain === "LOLA-474m", JSON.stringify(r2));
} finally {
  check("no console errors", errors.length === 0, [...new Set(errors)].slice(0, 3).join(" | "));
  console.log(`\n${pass}/${pass + fail} passed · screenshots in ${OUT}`);
  chrome.kill(); process.exit(fail ? 1 : 0);
}

// M3 · renders the landing Moon's first frame to viewer/assets/moon-poster.webp (transparent).
// Serve the repo root (python3 -m http.server 8765 --bind 127.0.0.1), then: node viewer/tools/make-poster.mjs
// Re-run whenever the landing time, camera or globe imagery changes, so the poster matches.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const BASE = process.env.FHLS_TEST_URL || "http://127.0.0.1:8765", PORT = 9337;
const chrome = spawn(process.env.FHLS_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "fhls-poster-"))}`, "--enable-unsafe-swiftshader",
  "--use-angle=swiftshader", "--window-size=700,700", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms)); let ws, id = 0; const pend = new Map();
for (let i = 0; i < 50 && !ws; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === "page");
  ws = new WebSocket(p.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); } catch { ws = null; await sleep(200); } }
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async e => (await send("Runtime.evaluate", { expression: `(async()=>{${e}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Page.enable");
await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
// reduced motion keeps the camera exactly at the starting pose (no rotation) for the capture
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await send("Page.navigate", { url: `${BASE}/viewer/tools/poster.html` });
for (let i = 0; i < 200 && !(await js("return !!window.posterReady && document.querySelector('.fhls-viewer').classList.contains('is-live')")); i++) await sleep(100);
await sleep(1500);
const png = Buffer.from((await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 640, height: 640, scale: 1 } })).result.data, "base64");
const tmp = join(tmpdir(), "fhls-poster.png"); writeFileSync(tmp, png);
execFileSync("python3", ["-c", `from PIL import Image
im=Image.open(${JSON.stringify(tmp)}).convert('RGBA'); im.save('viewer/assets/moon-poster.webp','WEBP',quality=80,method=6)
print('poster', im.size, 'alpha range', im.getchannel('A').getextrema())`], { stdio: "inherit" });
chrome.kill(); process.exit(0);

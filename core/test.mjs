// Smoke test for fhls-core.js against the data/ folder.  Run:  node core/test.mjs
import { readFile } from "node:fs/promises";
import { createCore, sunVisibleFraction, latLonToPolar, polarToLatLon } from "./fhls-core.js";

const data = new URL("../data/", import.meta.url);
const buf = async (p) => { const b = await readFile(new URL(p, data)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const json = async (p) => JSON.parse(await readFile(new URL(p, data), "utf8"));

const core = createCore({
  ephemerisMeta: await json("ephemeris.json"),
  ephemerisBin: await buf("ephemeris.bin"),
  horizonIndex: await json("horizon/index.json").catch(() => ({ grids: [] })),
  loadBinary: (p) => buf("horizon/" + p),
});

let fail = 0;
const check = (name, ok, info) => { console.log(`${ok ? "ok  " : "FAIL"} ${name}`, info ?? ""); if (!ok) fail++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// 1. Same numbers as engine/test_spice.py (Shackleton connecting ridge, 2027-01-15 12:00 UTC)
const a = core.at(-89.45, -137.3, "2027-01-15T12:00:00Z");
check("sun az/el vs SPICE", near(a.sun.az, 223.8, 0.05) && near(a.sun.el, 0.34, 0.005), a.sun);
check("earth az/el vs SPICE", near(a.earth.az, 129.6, 0.05) && near(a.earth.el, 5.24, 0.005), a.earth);

// 2. Projection round trip
const p = latLonToPolar(-88.1, 44.9), q = polarToLatLon(p.x, p.y);
check("polar round trip", near(q.lat, -88.1, 1e-9) && near(q.lon, 44.9, 1e-9), q);

// 3. Disc fraction
check("disc fraction", sunVisibleFraction(1, 1) === 0.5 && sunVisibleFraction(2, 1) === 1 && sunVisibleFraction(0, 1) === 0);

// 4. Time indexing
check("index of last hour", core.indexOf("2028-12-31T23:00:00Z") === 17543 && core.count === 17544);

// 5. Full analysis
for (const [name, lat, lon] of [["connecting ridge", -89.45, -137.3], ["Shackleton floor", -89.67, 129.8], ["equator (global grid)", 0, 0]]) {
  const t = performance.now();
  const r = await core.analyze(lat, lon);
  console.log(`     ${name}: ${(performance.now() - t).toFixed(0)} ms, precision ${r.precision}, grid ${r.horizon.grid_id},`, r.summary);
}
const floor = await core.analyze(-89.67, 129.8);
check("Shackleton floor never sunlit", floor.summary.pct_sunlit === 0);
const eq = await core.analyze(0, 0);
check("equator sunlit ~50% and low precision", near(eq.summary.pct_sunlit, 50, 1) && eq.precision === "low", eq.summary.pct_sunlit);

process.exit(fail ? 1 : 0);

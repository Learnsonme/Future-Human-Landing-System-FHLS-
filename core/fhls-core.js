/**
 * fhls-core.js · FHLS browser maths (T3). Pure functions + a small data loader. No UI.
 * Formats: DATA_CONTRACT.md. Angles in degrees. Azimuth 0 = north, clockwise.
 * Elevation is above the FLAT local horizon (sphere normal). Time steps are hourly from
 * ephemeris.start_utc (index 0 = 2027-01-01T00:00Z).
 *
 * Quick start (browser, ES module):
 *   import { loadCore } from "../core/fhls-core.js";
 *   const core = await loadCore("../data");                 // base URL of data/
 *   const r = await core.analyze(-89.45, -137.3);           // whole 2027–2028
 *   r.summary   // { pct_sunlit, pct_earth, pct_both, longest_dark_hours, longest_no_comms_hours }
 *   core.at(-89.45, -137.3, "2027-01-15T12:00Z")             // { sun:{az,el}, earth:{az,el}, ... }
 *
 * Reminder for UI text: visibility ≠ guaranteed power or a guaranteed radio link.
 */

export const R_KM = 1737.4;
export const SUN_RADIUS_DEG = 0.265;
export const HOUR_MS = 3600_000;
const DEG = Math.PI / 180;

// ───────────────────────── projections ─────────────────────────

/**
 * lat/lon (deg) → polar stereographic x, y (km). pole "south" (default, lat < 0):
 * x = rho·sin(lon), y = rho·cos(lon). pole "north" (lat > 0): x = rho·sin(lon), y = −rho·cos(lon).
 * Same projections as the data/terrain and data/horizon files.
 */
export function latLonToPolar(lat, lon, pole = "south") {
  if (pole === "north") {
    const rho = 2 * R_KM * Math.tan(((90 - lat) / 2) * DEG);
    return { x: rho * Math.sin(lon * DEG), y: -rho * Math.cos(lon * DEG) };
  }
  const rho = 2 * R_KM * Math.tan(((90 + lat) / 2) * DEG);
  return { x: rho * Math.sin(lon * DEG), y: rho * Math.cos(lon * DEG) };
}

/** Polar stereographic x, y (km) → { lat, lon } (deg, lon in −180…180). */
export function polarToLatLon(x, y, pole = "south") {
  const colat = (2 * Math.atan(Math.hypot(x, y) / (2 * R_KM))) / DEG;
  if (pole === "north") return { lat: 90 - colat, lon: Math.atan2(x, -y) / DEG };
  return { lat: colat - 90, lon: Math.atan2(x, y) / DEG };
}

const POLAR_PROJECTION = { south: "polar_stereographic_south", north: "polar_stereographic_north" };
const poleOfGrid = (g) => (g.projection === POLAR_PROJECTION.north ? "north" : "south");

// ───────────────────────── vectors & local frame ─────────────────────────

/** Site position from the Moon's centre, MOON_ME, km. */
export function siteVector(lat, lon, height_m = 0) {
  const r = R_KM + height_m / 1000;
  const cl = Math.cos(lat * DEG);
  return [r * cl * Math.cos(lon * DEG), r * cl * Math.sin(lon * DEG), r * Math.sin(lat * DEG)];
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const n = Math.hypot(a[0], a[1], a[2]); return [a[0] / n, a[1] / n, a[2] / n]; };

/** Local east/north/up unit vectors in MOON_ME. At the exact poles, north = toward lon 0. */
export function enuAxes(lat, lon) {
  const up = norm(siteVector(lat, lon));
  let east = cross([0, 0, 1], up);
  if (Math.hypot(...east) < 1e-9) east = [0, 1, 0];   // pole (matches engine/horizon.py)
  east = norm(east);
  return { east, north: cross(up, east), up };
}

/** Azimuth/elevation of a body at vector `target` (MOON_ME km, from Moon centre). */
export function azEl(target, site, axes) {
  const l = norm([target[0] - site[0], target[1] - site[1], target[2] - site[2]]);
  const el = Math.asin(Math.max(-1, Math.min(1, dot(l, axes.up)))) / DEG;
  const az = ((Math.atan2(dot(l, axes.east), dot(l, axes.north)) / DEG) + 360) % 360;
  return { az, el };
}

// ───────────────────────── horizon & visibility ─────────────────────────

/** Horizon elevation (deg) at azimuth `az` from an array of n bins starting at 0°, linear interp. */
export function horizonAt(values, az) {
  const n = values.length, step = 360 / n;
  const f = (((az % 360) + 360) % 360) / step;
  const i = Math.floor(f) % n, t = f - Math.floor(f);
  return values[i] * (1 - t) + values[(i + 1) % n] * t;
}

/** Fraction (0–1) of the solar disc above a horizon line, exact circular-segment area. */
export function sunVisibleFraction(sunEl, horizonEl) {
  const d = Math.max(-1, Math.min(1, (sunEl - horizonEl) / SUN_RADIUS_DEG));
  return 1 - (Math.acos(d) - d * Math.sqrt(1 - d * d)) / Math.PI;
}

/** Runs of `true` in a boolean-ish array → [{ start, end, hours }] (end exclusive, indices). */
export function windows(flags) {
  const out = [];
  let s = -1;
  for (let i = 0; i <= flags.length; i++) {
    const on = i < flags.length && flags[i];
    if (on && s < 0) s = i;
    if (!on && s >= 0) { out.push({ start: s, end: i, hours: i - s }); s = -1; }
  }
  return out;
}

function longestRun(flags, value) {
  let best = 0, cur = 0;
  for (let i = 0; i < flags.length; i++) {
    cur = (!!flags[i] === value) ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return best;
}

// ───────────────────────── data-backed core ─────────────────────────

/**
 * Build a core from already-loaded data.
 * @param {object} o
 * @param {object} o.ephemerisMeta   parsed data/ephemeris.json
 * @param {ArrayBuffer} o.ephemerisBin data/ephemeris.bin
 * @param {object} [o.horizonIndex]  parsed data/horizon/index.json (optional)
 * @param {(path:string)=>Promise<ArrayBuffer>} [o.loadBinary] loads a path relative to data/horizon/
 */
export function createCore({ ephemerisMeta, ephemerisBin, horizonIndex = { grids: [] }, loadBinary }) {
  const eph = new Float32Array(ephemerisBin);
  const count = ephemerisMeta.count;
  const t0 = Date.parse(ephemerisMeta.start_utc);
  const tileCache = new Map();

  const sunVec = (i) => [eph[i * 6], eph[i * 6 + 1], eph[i * 6 + 2]];
  const earthVec = (i) => [eph[i * 6 + 3], eph[i * 6 + 4], eph[i * 6 + 5]];

  /** Hour index for a Date / ISO string / ms number, clamped to the table. */
  function indexOf(t) {
    const ms = t instanceof Date ? t.getTime() : typeof t === "number" ? t : Date.parse(t);
    return Math.max(0, Math.min(count - 1, Math.round((ms - t0) / HOUR_MS)));
  }
  const timeOf = (i) => new Date(t0 + i * HOUR_MS);

  /**
   * Pick the finest grid covering lat/lon; returns { grid, ix, iy } or null.
   * Order: polar grids of the click's hemisphere (finest first), then whole-Moon grids (finest first).
   */
  function findGridPoint(lat, lon) {
    const pole = lat < 0 ? "south" : "north";
    const polar = horizonIndex.grids
      .filter((g) => g.projection === POLAR_PROJECTION[pole])
      .sort((a, b) => a.spacing_km - b.spacing_km);
    const { x, y } = latLonToPolar(lat, lon, pole);
    for (const g of polar) {
      const ix = Math.round((x - g.x0_km) / g.spacing_km);
      const iy = Math.round((y - g.y0_km) / g.spacing_km);
      if (ix >= 0 && iy >= 0 && ix < g.nx && iy < g.ny) return { grid: g, ix, iy };
    }
    const gc = horizonIndex.grids
      .filter((g) => g.projection === "equirectangular")
      .sort((a, b) => a.step_deg - b.step_deg)[0];
    if (gc) {
      const ix = ((Math.round((lon - gc.lon0) / gc.step_deg) % gc.nx) + gc.nx) % gc.nx;
      const iy = Math.max(0, Math.min(gc.ny - 1, Math.round((lat - gc.lat0) / gc.step_deg)));
      return { grid: gc, ix, iy };
    }
    return null;
  }

  async function loadTile(path) {
    if (!tileCache.has(path)) tileCache.set(path, loadBinary(path).then((b) => new Int16Array(b)));
    return tileCache.get(path);
  }

  /**
   * Horizon profile for a site → { values: Float32Array (deg per bin), az_step_deg, precision,
   * grid_id, point: {lat, lon} (actual grid point used) }. Without any covering grid: flat
   * horizon (zeros), precision "low", grid_id null.
   */
  async function getHorizon(lat, lon) {
    const hit = findGridPoint(lat, lon);
    if (!hit) {
      return { values: new Float32Array(180), az_step_deg: 2, precision: "low", grid_id: null, point: { lat, lon } };
    }
    const { grid: g, ix, iy } = hit;
    let raw, k;
    if (g.tiles) {
      const ts = g.tile_size, tx = Math.floor(ix / ts), ty = Math.floor(iy / ts);
      const w = Math.min(ts, g.nx - ts * tx);                     // edge tiles are cut short
      raw = await loadTile(g.tiles.replace("{tx}", tx).replace("{ty}", ty));
      k = ((iy - ts * ty) * w + (ix - ts * tx)) * g.n_az;
    } else {
      raw = await loadTile(g.file);
      k = (iy * g.nx + ix) * g.n_az;
    }
    const values = new Float32Array(g.n_az);
    for (let a = 0; a < g.n_az; a++) {
      const v = raw[k + a];
      values[a] = v === g.nodata ? 0 : v * g.scale;
    }
    const point = g.projection === "equirectangular"
      ? { lat: g.lat0 + iy * g.step_deg, lon: g.lon0 + ix * g.step_deg }
      : polarToLatLon(g.x0_km + ix * g.spacing_km, g.y0_km + iy * g.spacing_km, poleOfGrid(g));
    return { values, az_step_deg: g.az_step_deg, precision: g.precision || "high", grid_id: g.id, point };
  }

  /** Sun & Earth az/el at one site and time (no terrain). */
  function at(lat, lon, t) {
    const i = typeof t === "number" && Number.isInteger(t) && t < count ? t : indexOf(t);
    const site = siteVector(lat, lon), axes = enuAxes(lat, lon);
    return { index: i, time: timeOf(i), sun: azEl(sunVec(i), site, axes), earth: azEl(earthVec(i), site, axes) };
  }

  /**
   * Full analysis for a site over [start, end] (inclusive; Date/ISO/ms or hour index; default all).
   * Returns per-hour typed arrays + summary + windows + horizon.
   */
  async function analyze(lat, lon, { start = 0, end = count - 1 } = {}) {
    const i0 = typeof start === "number" && start < count ? start : indexOf(start);
    const i1 = typeof end === "number" && end < count ? end : indexOf(end);
    const n = i1 - i0 + 1;
    const horizon = await getHorizon(lat, lon);
    const site = siteVector(lat, lon), axes = enuAxes(lat, lon);
    const sun_az = new Float32Array(n), sun_el = new Float32Array(n);
    const earth_az = new Float32Array(n), earth_el = new Float32Array(n);
    const sun_fraction = new Float32Array(n);
    const power = new Uint8Array(n), comms = new Uint8Array(n), both = new Uint8Array(n);
    let nP = 0, nC = 0, nB = 0;
    for (let k = 0; k < n; k++) {
      const i = i0 + k;
      const s = azEl(sunVec(i), site, axes), e = azEl(earthVec(i), site, axes);
      sun_az[k] = s.az; sun_el[k] = s.el; earth_az[k] = e.az; earth_el[k] = e.el;
      const f = sunVisibleFraction(s.el, horizonAt(horizon.values, s.az));
      sun_fraction[k] = f;
      power[k] = f > 0.5 ? 1 : 0;
      comms[k] = e.el > horizonAt(horizon.values, e.az) ? 1 : 0;
      both[k] = power[k] & comms[k];
      nP += power[k]; nC += comms[k]; nB += both[k];
    }
    const pct = (x) => Math.round((1000 * x) / n) / 10;
    return {
      lat, lon, start: timeOf(i0), end: timeOf(i1), start_index: i0, hours: n,
      precision: horizon.precision, horizon,
      sun_az, sun_el, earth_az, earth_el, sun_fraction, power, comms, both,
      summary: {
        pct_sunlit: pct(nP), pct_earth: pct(nC), pct_both: pct(nB),
        longest_dark_hours: longestRun(power, false),
        longest_no_comms_hours: longestRun(comms, false),
      },
      windows: { power: windows(power), comms: windows(comms), both: windows(both) },
    };
  }

  /** Unit vector to the Sun from the Moon's centre, MOON_ME (for lighting the globe). */
  function sunDirection(t) {
    const i = typeof t === "number" && Number.isInteger(t) && t < count ? t : indexOf(t);
    return norm(sunVec(i));
  }

  /**
   * Unit Sun direction in the polar TERRAIN frame at (lat, lon): x, y along the polar
   * stereographic axes of the data/terrain tiles of that hemisphere (south tiles for lat < 0,
   * north tiles for lat ≥ 0), z = local up. Use this to light the terrain mesh.
   */
  function sunDirectionPolar(lat, lon, t) {
    const { sun } = at(lat, lon, t);
    const ce = Math.cos(sun.el * DEG);
    const e = ce * Math.sin(sun.az * DEG), nn = ce * Math.cos(sun.az * DEG), u = Math.sin(sun.el * DEG);
    const pole = lat < 0 ? "south" : "north";
    const { x, y } = latLonToPolar(lat, lon, pole);
    const rho = Math.hypot(x, y);
    let nx, ny, ex, ey;
    if (pole === "south") {
      [nx, ny] = rho < 1e-9 ? [0, 1] : [x / rho, y / rho];     // north = away from the pole
      [ex, ey] = rho < 1e-9 ? [1, 0] : [y / rho, -x / rho];
    } else {
      [nx, ny] = rho < 1e-9 ? [0, 1] : [-x / rho, -y / rho];   // north = toward the pole
      [ex, ey] = rho < 1e-9 ? [1, 0] : [-y / rho, x / rho];
    }
    return { x: nn * nx + e * ex, y: nn * ny + e * ey, z: u };
  }

  return {
    count, startTime: timeOf(0), endTime: timeOf(count - 1),
    indexOf, timeOf, at, analyze, getHorizon, sunDirection, sunDirectionPolar,
    synthetic: !!ephemerisMeta.synthetic,
  };
}

/** Browser convenience: fetch everything from `base` (URL of the data/ folder). */
export async function loadCore(base = "data") {
  base = base.replace(/\/$/, "");
  const get = async (p) => { const r = await fetch(`${base}/${p}`); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r; };
  const [meta, bin] = await Promise.all([
    get("ephemeris.json").then((r) => r.json()),
    get("ephemeris.bin").then((r) => r.arrayBuffer()),
  ]);
  let horizonIndex = { grids: [] };
  try { horizonIndex = await (await get("horizon/index.json")).json(); } catch { /* flat-horizon fallback */ }
  return createCore({
    ephemerisMeta: meta, ephemerisBin: bin, horizonIndex,
    loadBinary: (p) => get(`horizon/${p}`).then((r) => r.arrayBuffer()),
  });
}

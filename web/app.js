// FHLS web shell. Screens and mode (W1); site selection → core → results panel (W2).
// All astronomy comes from core/fhls-core.js — never recomputed here.
import { loadCore, R_KM } from "../core/fhls-core.js";

const MODES = {
  beginner:     { label: "Beginner" },
  intermediate: { label: "Intermediate" },
  advanced:     { label: "Advanced" },
};

// Shackleton: the point T3 validated the ephemeris against. Used for the landing strip.
const REFERENCE = { lat: -89.90, lon: 0 };

const state = {
  screen: "landing",
  mode: restoreMode() || "beginner",
  site: null,          // { lat, lon, name } once something is picked
  date: "2027-01-15",
  result: null,        // the last core.analyze() result
};

let core = null;
let coreError = null;
let sites = [];

const $ = (id) => document.getElementById(id);

/* ---------- small helpers ---------- */

function el(tag, text, cls, id) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (cls) node.className = cls;
  if (id) node.id = id;
  return node;
}

function formatAngle(deg) {
  return `${deg < 0 ? "−" : "+"}${Math.abs(deg).toFixed(2)}°`;
}

function formatAzEl(a) {
  return `${a.az.toFixed(1)}° az · ${formatAngle(a.el)}`;
}

function formatLatLon(lat, lon) {
  return `${Math.abs(lat).toFixed(3)}°${lat < 0 ? "S" : "N"}, ` +
         `${Math.abs(lon).toFixed(3)}°${lon < 0 ? "W" : "E"}`;
}

function formatHours(h) {
  if (h == null) return "—";
  const d = h / 24;
  return d >= 2 ? `${h} h (${d.toFixed(1)} days)` : `${h} h`;
}

// Great-circle distance on the lunar sphere. Plain geometry, not astronomy.
function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/* ---------- screens ---------- */

function show(screen) {
  state.screen = screen;
  document.body.dataset.screen = screen;
  window.scrollTo(0, 0);
  if (screen === "landing") $("start").focus({ preventScroll: true });
}

/* ---------- mode ---------- */

function restoreMode() {
  try {
    const saved = localStorage.getItem("fhls.mode");
    return saved && saved in MODES ? saved : null;
  } catch {
    return null; // private window or blocked storage: fall back to the default
  }
}

function setMode(mode) {
  if (!(mode in MODES)) return;
  state.mode = mode;
  try { localStorage.setItem("fhls.mode", mode); } catch { /* not essential */ }
  $("mode-chip").textContent = MODES[mode].label;
  document.body.dataset.mode = mode;
}

/* ---------- startup ---------- */

async function init() {
  try {
    core = await loadCore("../data");
  } catch (err) {
    coreError = err;
    console.error("core failed to load", err);
    fail("Could not load data/ — no angles can be shown. Serve the repository over HTTP " +
         "rather than opening the file directly.");
  }

  try {
    const res = await fetch("../data/sites.json");
    if (!res.ok) throw new Error(`sites.json: ${res.status}`);
    sites = await res.json();
  } catch (err) {
    console.warn("sites.json unavailable", err);
  }

  renderSiteList();
  renderLanding();
  mountViewer();
}

function fail(message) {
  const notice = $("data-notice");
  notice.textContent = message;
  notice.hidden = false;
}

/* ---------- viewer hand-off (T1) ---------- */
// The viewer is not in the repo yet. When it arrives it should expose
// window.FHLSViewer.mount(element) and .onPick(cb); until then the site list stands in.
function mountViewer() {
  const viewer = window.FHLSViewer;
  if (!viewer || typeof viewer.mount !== "function") return;
  try {
    viewer.mount($("viewer-slot"));
    $("stage-placeholder").hidden = true;
    if (typeof viewer.onPick === "function") {
      viewer.onPick((lat, lon) => selectSite({ lat, lon }));
    }
  } catch (err) {
    console.error("viewer failed to mount", err);
  }
}

/* ---------- site list (stands in for the viewer) ---------- */

function renderSiteList() {
  const list = $("site-list");
  if (!sites.length) {
    list.replaceChildren(el("li", "No site list available (data/sites.json missing).", "site-empty"));
    return;
  }
  list.replaceChildren(...sites.map((s) => {
    const btn = el("button", null, "site");
    btn.type = "button";
    btn.append(
      el("span", s.name, "site-name"),
      el("span", formatLatLon(s.lat, s.lon), "site-coord"),
    );
    btn.addEventListener("click", () => selectSite(s));
    const li = el("li");
    li.append(btn);
    return li;
  }));
}

/* ---------- selection → core → panel ---------- */

async function selectSite(site) {
  if (!core) return;
  state.site = { lat: site.lat, lon: site.lon, name: site.name || "Picked point" };

  for (const b of document.querySelectorAll(".site")) {
    b.classList.toggle("is-on", b.firstChild?.textContent === state.site.name);
  }

  $("r-title").textContent = state.site.name;
  $("r-sub").textContent = "Computing…";

  try {
    state.result = await core.analyze(state.site.lat, state.site.lon);
  } catch (err) {
    console.error("analyze failed", err);
    $("r-sub").textContent = "Could not compute this point.";
    return;
  }
  renderResults();
}

function renderResults() {
  const r = state.result;
  if (!r) return;
  const site = state.site;

  $("r-sub").textContent = formatLatLon(site.lat, site.lon);
  $("r-body").hidden = false;

  // Precision, and the grid point the terrain actually came from (T3's request).
  const low = r.precision !== "high";
  const badge = $("r-precision");
  badge.textContent = low
    ? "Lower precision · coarse terrain outside the south polar region"
    : "Full terrain precision";
  badge.classList.toggle("badge--low", low);

  const gp = r.horizon?.point;
  $("r-computed-for").textContent = gp
    ? `Terrain taken from the nearest grid point, ${formatLatLon(gp.lat, gp.lon)}, ` +
      `${distanceKm(site, gp).toFixed(2)} km away` + (r.horizon.grid_id ? ` · grid ${r.horizon.grid_id}` : "")
    : "";

  // Values at the selected hour.
  const i = core.indexOf(`${state.date}T12:00:00Z`) - r.start_index;
  const inRange = i >= 0 && i < r.sun_el.length;

  if (inRange) {
    $("r-sun").textContent = formatAzEl({ az: r.sun_az[i], el: r.sun_el[i] });
    $("r-earth").textContent = formatAzEl({ az: r.earth_az[i], el: r.earth_el[i] });
    $("r-now-power").textContent = r.power[i] ? "Yes" : "No";
    $("r-now-comms").textContent = r.comms[i] ? "Yes" : "No";
  } else {
    for (const id of ["r-sun", "r-earth", "r-now-power", "r-now-comms"]) $(id).textContent = "—";
  }

  const s = r.summary;
  $("r-pct-sun").textContent = `${s.pct_sunlit.toFixed(1)} %`;
  $("r-pct-earth").textContent = `${s.pct_earth.toFixed(1)} %`;
  $("r-pct-both").textContent = `${s.pct_both.toFixed(1)} %`;
  $("r-dark").textContent = formatHours(s.longest_dark_hours);
  $("r-nocomms").textContent = formatHours(s.longest_no_comms_hours);
}

/* ---------- landing strip ---------- */

function renderLanding() {
  if (!core) {
    $("live-readout").replaceChildren(
      document.createTextNode(coreError ? "data unavailable" : "loading…"),
      el("small", coreError ? "see the note on the results screen" : "reading data/ephemeris.bin", null, "live-note"),
    );
    return;
  }
  const now = core.at(REFERENCE.lat, REFERENCE.lon, `${state.date}T12:00:00Z`);
  const stamp = `${new Date(now.time).toISOString().slice(0, 16).replace("T", " ")} UTC · computed in your browser`;
  $("live-readout").replaceChildren(
    el("span", `Sun ${formatAngle(now.sun.el)}`, "val-sun"),
    document.createTextNode(" · "),
    el("span", `Earth ${formatAngle(now.earth.el)}`, "val-earth"),
    el("small", stamp, null, "live-note"),
  );
}

/* ---------- wiring ---------- */

$("start").addEventListener("click", () => show("modes"));
$("skip-to-modes").addEventListener("click", () => show("modes"));
$("back-to-landing").addEventListener("click", () => show("landing"));
$("change-mode").addEventListener("click", () => show("modes"));

for (const btn of document.querySelectorAll(".mode")) {
  btn.addEventListener("click", () => {
    setMode(btn.dataset.mode);
    show("app");
  });
}

$("date").addEventListener("change", (e) => {
  if (!e.target.value) return;
  state.date = e.target.value;
  renderLanding();
  renderResults();   // reuses the cached analysis; no recompute
});

setMode(state.mode);
$("date").value = state.date;
init();

// Hook for the viewer (T1) and later web tasks.
window.FHLS = {
  get core() { return core; },
  get state() { return { ...state }; },
  get sites() { return sites; },
  setSite(lat, lon, name) { return selectSite({ lat, lon, name }); },
  setMode,
  show,
  mountViewer,
};

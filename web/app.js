// FHLS web shell. Screens and mode (W1); site selection → core → results panel (W2).
// All astronomy comes from core/fhls-core.js — never recomputed here.
import { loadCore, horizonAt, R_KM } from "../core/fhls-core.js";
import { beginnerSummary, beginnerNow, ICONS } from "../design/beginner.js";
import { createViewer } from "../viewer/index.js?v=20261115-s17";   // version tag: bump with web/index.html
import { drawHorizonPanorama } from "./components/horizon-panorama.js";
import { createStarfield } from "./components/starfield.js";
import { createStarTransition } from "./components/star-transition.js";
import { mountHeatmapControl } from "./components/heatmap-control.js";   // S10 (T3)
import { createTimePlayer } from "./components/time-player.js";            // S9 (T3)
import { createPanoramaSlider } from "./components/panorama-slider.js";    // S11 (T3)
import { mountCameraToolbar } from "./components/camera-toolbar.js";        // P12 (T3)

const MODES = {
  beginner:     { label: "Beginner" },
  intermediate: { label: "Intermediate" },
  advanced:     { label: "Advanced" },
};

// Shackleton ridge: the point T3 validated the ephemeris against (D6/F6).
const REFERENCE = { lat: -89.45, lon: -137.3 };

const state = {
  screen: "landing",
  mode: restoreMode() || "beginner",
  site: null,          // { lat, lon, name } once something is picked
  hour: 348,           // hour index into 2027–2028 (348 = 2027-01-15 12:00 UTC)
  result: null,        // the last core.analyze() result
  pins: [],            // O1: up to MAX_PINS of { site, summary, precision, gridId }
};

const MAX_PINS = 3;

const LAST_HOUR = 17543;

let core = null;
let coreError = null;
let sites = [];
let viewer = null;
let camBar = null, selectSeq = 0;   // P12 (T3): camera toolbar; guards a slow analyze() after Clear selection
let heatControl = null;   // S10 (T3): south-pole heat-map "Map" control over the 3D view
let timePlayer = null;    // S9 (T3): Play / Pause on the timeline
let panoSlider = null;    // S11 (T3): the panorama's own time slider
let panoHour = null;      // S11 (T3): the panorama's own hour (independent of state.hour)
let landingViewer = null;
let horizonGrids = new Map();   // grid id → its entry in data/horizon/index.json
let sky = null;
let transition = null;
let revealObserver = null;
let pickerOrigin = "landing";
let explorerReturnFocus = "home-from-app";
let visitedExplorer = false;
let navigation = 0;
let arrivalTimer = 0;
let lastPointer = null;    // where the Start star rises: the control you clicked

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

function applyScreen(screen) {
  state.screen = screen;
  document.body.dataset.screen = screen;
  window.scrollTo(0, 0);
  sky?.setDensity(screen === "landing" ? "landing" : state.mode);
  if (screen === "landing") mountLandingViewer();
  else { landingViewer?.dispose(); landingViewer = null; }
  if (screen === "app") { drawTimeline(); mountViewer(); }   // zero size while hidden

  const focusTarget = screen === "landing" ? "landing-title"
    : screen === "modes" ? "modes-title"
      : visitedExplorer ? explorerReturnFocus : "app-title";
  $(focusTarget).focus({ preventScroll: true });
  if (screen === "app") visitedExplorer = true;

  document.body.classList.add("is-arriving");
  clearTimeout(arrivalTimer);
  arrivalTimer = setTimeout(() => document.body.classList.remove("is-arriving", "home-return"), 620);
  observeReveals();
}

// The star rises at the control that was used. A keyboard activation leaves
// no pointer, so fall back to the focused element, then to the centre.
function pointerOrigin() {
  if (lastPointer && performance.now() - lastPointer.at < 1200) {
    return { x: lastPointer.x, y: lastPointer.y };
  }
  const el = document.activeElement;
  if (el && el !== document.body && el.getBoundingClientRect) {
    const r = el.getBoundingClientRect();
    if (r.width || r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return null;
}

function show(screen) {
  if (!["landing", "modes", "app"].includes(screen)) return;
  if (screen === state.screen) return;        // no transition when nothing changes
  const token = ++navigation;
  if (screen === "modes") {
    pickerOrigin = state.screen;
    if (state.screen === "app") explorerReturnFocus = "change-mode";
  }
  if (state.screen === "app" && screen !== "app") {
    // Dispose immediately, before a screen animation: this cancels both active
    // flights and terrain requests. Exploration state lives separately above.
    const previous = viewer; viewer = null; heatControl?.attach(null); camBar?.attach(null); previous?.dispose();
  }
  if (transition?.busy) {
    transition.destroy();
    try { transition = createStarTransition($("transition")); }
    catch { transition = null; }
  }
  if (!transition) { if (screen === "landing") renderLanding(); applyScreen(screen); return; }
  if (screen === "landing") renderLanding();

  // The star plays on every Start (landing → mode picker), not just the first
  // of a visit: it is the demo moment and gets clicked repeatedly. Every other
  // screen change is still the plain crossfade F1 asked for. This widens D5's
  // "first time per visit" slightly; the area, opacity and duration ceilings
  // that the rule exists to enforce are unchanged and still measured.
  const isStart = screen === "modes" && state.screen === "landing";
  const options = isStart ? { ...(pointerOrigin() || {}), star: true } : {};

  transition.play(() => {
    if (token !== navigation) return;     // a newer navigation won
    applyScreen(screen);
  }, options);
}

function goHome() {
  if (state.screen === "app") explorerReturnFocus = "home-from-app";
  show("landing");
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
  if (state.screen !== "landing") sky?.setDensity(mode);
  heatControl?.setMode(mode);   // S10 (T3)
}

/* ---------- startup ---------- */

async function init() {
  const issues = []; // P14: retain recoverable failures for the loading handoff.
  try {
    core = await loadCore("../data");
  } catch (err) {
    coreError = err;
    issues.push('Lunar data could not load, so Sun and Earth angles are unavailable. Please reload to try again.');
    console.error("core failed to load", err);
    fail("Could not load data/ — no angles can be shown. Serve the repository over HTTP " +
         "rather than opening the file directly.");
  }

  if (state.screen === "landing") mountLandingViewer();

  try {
    const res = await fetch("../data/sites.json");
    if (!res.ok) throw new Error(`sites.json: ${res.status}`);
    sites = await res.json();
  } catch (err) {
    console.warn("sites.json unavailable", err);
    issues.push('The site list could not load. You can still choose a point on the Moon.');
  }

  try {
    const res = await fetch("../data/horizon/index.json");
    if (!res.ok) throw new Error(`horizon index: ${res.status}`);
    const index = await res.json();
    horizonGrids = new Map((index.grids || []).map((g) => [g.id, g]));
  } catch (err) {
    console.warn("horizon index unavailable", err);
    issues.push('The terrain index could not load. Please reload before using terrain visibility results.');
  }

  renderSiteList();
  syncTimeControls();
  renderLanding();
  if (state.screen === "app") mountViewer();
  return issues;
}

function fail(message) {
  const notice = $("data-notice");
  notice.textContent = message;
  notice.hidden = false;
}

/* ---------- viewer (T1) ---------- */
// The intro uses the same local NASA assets and real Sun as the explorer.
// Its inert host keeps decorative interaction from stopping the rotation.
function mountLandingViewer() {
  if (landingViewer) return;
  const host = $("landing-moon");
  try {
    landingViewer = createViewer(host, { core: core || undefined });
    landingViewer.onStatus((status) => {
      host.dataset.phase = status.phase;
      host.dataset.lighting = status.lighting;
    });
    landingViewer.ready.catch((err) => {
      console.error("landing Moon could not start", err);
    });
  } catch (err) {
    host.textContent = "Moon preview unavailable. Select Start to explore the site data.";
    console.error("landing Moon could not be created", err);
  }
}

// viewer/README.md: createViewer(host, {presentation:false}) → {ready, onPick, flyTo, setTime,
// onStatus, dispose}. The host needs a real size, so this runs once the app screen is visible.

function mountViewer() {
  if (viewer || !$("viewer-slot")) return;
  try {
    viewer = createViewer($("viewer-slot"), { presentation: false });
  } catch (err) {
    console.error("viewer could not be created", err);
    return;
  }

  const instance = viewer;
  mountTimePlayer();   // S9 (T3)
  heatControl ||= mountHeatmapControl($("viewer-slot"), { dataBase: "../data", mode: state.mode });   // S10 (T3)
  camBar ||= mountCameraToolbar($("viewer-slot").parentElement, $("viewer-slot"), { onClear: clearSelection, onStart: goHome });   // P12 (T3)
  camBar.attach(instance);
  heatControl.attach(instance);
  instance.onPick((lat, lon) => {
    if (viewer === instance && state.screen === "app") selectSite({ lat, lon }, { fly: true });
  });

  // The viewer prints its own hint inside the canvas, so only the terrain
  // level is worth repeating here.
  instance.onStatus((status) => {
    if (viewer !== instance) return;
    const terrain = {
      "LOLA-120m": "Terrain · LOLA 120 m tiles",
      "LOLA-474m": "Terrain · LOLA 474 m tiles",               // V8 (T3)
      "LOLA-40m": "Terrain · LOLA 40 m tiles (Artemis site)",  // V8 (T3)
      "LOLA-overview-480m": "Terrain · LOLA 480 m overview",
      "global-lower-precision": "Terrain · global relief, lower precision",
    }[status.terrain] || status.terrain || "";
    $("stage-status").textContent = terrain;
  });

  instance.ready.then(() => {
    if (viewer !== instance || state.screen !== "app") return;
    $("stage-placeholder").hidden = true;
    pushTimeToViewer();
    if (state.site) {
      instance.flyTo(state.site.lat, state.site.lon).catch(() => {});
      instance.showLander?.(state.site.lat, state.site.lon, state.site.name);   // S16 (T3)
    }
  }).catch((err) => {
    if (viewer !== instance) return;
    console.error("viewer failed to start", err);
    $("stage-placeholder").hidden = false;
    $("stage-status").textContent = `3D viewer unavailable: ${err.message}`;
  });
}

function pushTimeToViewer() {
  if (!viewer || !core) return;
  try {
    viewer.setTime(new Date(core.timeOf(state.hour)).toISOString().replace(".000Z", "Z"));
  } catch (err) {
    console.warn("setTime rejected", err);
  }
}

/* ---------- site list ---------- */

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

async function selectSite(site, { fly = true } = {}) {
  if (!core) return;
  const seq = ++selectSeq;   // P12 (T3)
  if (fly && viewer) viewer.flyTo(site.lat, site.lon).catch(() => {});
  state.site = { lat: site.lat, lon: site.lon, name: site.name || "Picked point" };
  try { viewer?.showLander?.(state.site.lat, state.site.lon, state.site.name); } catch { /* viewer gone */ }   // S16 (T3)
  panoHour = state.hour;   // S11 (T3): the panorama starts at the timeline's hour for a new site

  for (const b of document.querySelectorAll(".site")) {
    const on = b.firstChild?.textContent === state.site.name;
    b.classList.toggle("is-on", on);
    if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");   // S16 (T3)
  }

  $("r-title").textContent = state.site.name;
  $("r-sub").textContent = "Computing…";

  try {
    const result = await core.analyze(state.site.lat, state.site.lon);
    if (seq !== selectSeq) return;   // P12 (T3): cleared or replaced meanwhile
    state.result = result;
  } catch (err) {
    console.error("analyze failed", err);
    $("r-sub").textContent = "Could not compute this point.";
    return;
  }
  renderResults();
  drawTimeline();
}

// P12 (T3): "Clear selection" (toolbar or Esc): no site, empty panel, no lander; the camera stays.
function clearSelection() {
  if (!state.site && !state.result) return;
  selectSeq++;
  state.site = null; state.result = null; panoHour = null;
  for (const b of document.querySelectorAll(".site")) { b.classList.remove("is-on"); b.removeAttribute("aria-current"); }
  $("r-title").textContent = "No site selected";
  $("r-sub").textContent = "Pick one of the candidate sites, or click anywhere on the Moon.";
  $("r-body").hidden = true; $("r-body").replaceChildren();
  $("pin-row").hidden = true;
  renderPanorama(); renderHourTable(); drawTimeline();
  const cap = $("timeline-caption"); if (cap) cap.textContent = "Pick a site to see its windows.";
}

function renderResults() {
  const r = state.result;
  if (!r) return;
  const site = state.site;

  $("r-sub").textContent = formatLatLon(site.lat, site.lon);
  const body = $("r-body");
  body.hidden = false;

  const i = state.hour - r.start_index;
  const hour = (i >= 0 && i < r.sun_el.length) ? i : null;

  const parts = state.mode === "beginner"
    ? beginnerPanel(r, hour)
    : [precisionBadge(r),
       ...(state.mode === "advanced" ? advancedPanel(r, hour) : intermediatePanel(r, hour)),
       gridNote(r, site)];

  body.replaceChildren(...parts.filter(Boolean));
  renderPinControl();
  renderPanorama();
  renderHourTable();
}

/* ---------- atmosphere (W9) ---------- */

// M5 · the title and the Moon arrive together, once per visit. sessionStorage,
// not a module variable, so a reload inside the same visit does not replay it.
function playEntrance() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (state.screen !== "landing") return;
  try {
    if (sessionStorage.getItem("fhls.entered")) return;
    sessionStorage.setItem("fhls.entered", "1");
  } catch {
    // private window or blocked storage: play it, rather than never
  }
  document.body.classList.add("is-entering");
  setTimeout(() => document.body.classList.remove("is-entering"), 900);
}

function startAtmosphere() {
  document.addEventListener("pointerdown", (e) => {
    lastPointer = { x: e.clientX, y: e.clientY, at: performance.now() };
  }, { capture: true, passive: true });

  try {
    sky = createStarfield($("sky"), { density: state.mode });
  } catch (err) {
    console.warn("starfield unavailable", err);
  }
  try {
    transition = createStarTransition($("transition"));
  } catch (err) {
    console.warn("transition unavailable", err);
  }

  if ("IntersectionObserver" in window) {
    revealObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        revealObserver.unobserve(entry.target);   // once only
      }
    }, { rootMargin: "0px 0px -8% 0px" });
  }

  observeReveals();

  window.addEventListener("pagehide", () => {
    sky?.destroy();
    transition?.destroy();
    revealObserver?.disconnect();
    viewer?.dispose?.();
  }, { once: true });
}

function observeReveals() {
  if (!revealObserver) return;
  for (const node of document.querySelectorAll(".compare, .panorama, .hourtable, .sites, .strip")) {
    if (node.hidden || node.classList.contains("is-in")) continue;
    node.classList.add("reveal");
    revealObserver.observe(node);
  }
}

/* ---------- pinned sites (O1) ---------- */
// Only the summary is kept, not the hour arrays: three analyses would be a
// few megabytes of typed arrays for numbers nobody reads again.

const COMPARE_ROWS = [
  { key: "pct_sunlit", label: "Time with sunlight", unit: "%", best: "max", tone: "val-sun" },
  { key: "pct_earth", label: "Time with Earth contact", unit: "%", best: "max", tone: "val-earth" },
  { key: "pct_both", label: "Time with both", unit: "%", best: "max", tone: "val-both" },
  { key: "longest_dark_hours", label: "Longest dark period", unit: "h", best: "min" },
  { key: "longest_no_comms_hours", label: "Longest gap in contact", unit: "h", best: "min" },
];

function samePlace(a, b) {
  return Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lon - b.lon) < 1e-6;
}

function pinCurrent() {
  const r = state.result;
  if (!r || !state.site) return;
  if (state.pins.some((p) => samePlace(p.site, state.site))) return;
  if (state.pins.length >= MAX_PINS) return;

  state.pins.push({
    site: { ...state.site },
    summary: { ...r.summary },
    precision: r.precision,
    gridId: r.horizon?.grid_id || null,
  });
  renderPins();
  renderPinControl();
}

function unpin(i) {
  state.pins.splice(i, 1);
  renderPins();
  renderPinControl();
}

function renderPinControl() {
  const row = $("pin-row");
  if (!state.result) {
    row.hidden = true;
    return;
  }
  row.hidden = false;

  const already = state.pins.some((p) => samePlace(p.site, state.site));
  const full = state.pins.length >= MAX_PINS;
  const btn = $("pin-site");
  btn.disabled = already || full;
  btn.textContent = already ? "Pinned" : "Pin for comparison";
  $("pin-count").textContent =
    full ? `${MAX_PINS} of ${MAX_PINS} pinned — remove one to add another`
         : `${state.pins.length} of ${MAX_PINS} pinned`;
}

function bestIndex(row) {
  const values = state.pins.map((p) => p.summary[row.key]);
  if (values.length < 2) return -1;
  const target = row.best === "max" ? Math.max(...values) : Math.min(...values);
  // no marker when everything ties
  return values.every((v) => v === target) ? -1 : values.indexOf(target);
}

function renderPins() {
  const section = $("compare");
  if (!state.pins.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  observeReveals();
  $("compare-sub").textContent =
    `${state.pins.length} of ${MAX_PINS} · figures are for all of 2027–2028`;

  const marks = new Map(COMPARE_ROWS.map((row) => [row.key, bestIndex(row)]));
  const cards = state.pins.map((pin, i) => {
    const card = el("article", null, "pin-card");

    const head = el("header", null, "pin-head");
    const name = el("button", pin.site.name || "Picked point", "pin-name");
    name.type = "button";
    name.title = "Show this site again";
    name.addEventListener("click", () => selectSite(pin.site));
    const remove = el("button", "Remove", "btn btn--quiet pin-remove");
    remove.type = "button";
    remove.addEventListener("click", () => unpin(i));
    head.append(name, remove);

    const meta = el("p", formatLatLon(pin.site.lat, pin.site.lon), "pin-coord");
    const prec = el("p", pin.precision === "high" ? "Full precision" : "Lower precision",
      pin.precision === "high" ? "pin-prec" : "pin-prec is-low");

    const dl = el("dl", null, "pin-figures");
    for (const row of COMPARE_ROWS) {
      const value = pin.summary[row.key];
      const text = row.unit === "%"
        ? `${value.toFixed(1)} %`
        : (value >= 48 ? `${(value / 24).toFixed(1)} days` : `${value} hours`);
      const dd = el("dd", text, row.tone || null);
      if (marks.get(row.key) === i) dd.classList.add("is-best");
      dl.append(el("dt", row.label), dd);
    }

    card.append(head, meta, prec, dl);
    return card;
  });

  $("compare-grid").replaceChildren(...cards);
}

/* ---------- precision wording (W8) ---------- */
// One source for every place the label appears, quoting the real grid.

function precisionOf(r) {
  const low = r.precision !== "high";
  const grid = horizonGrids.get(r.horizon?.grid_id);

  let sampling = "";
  if (grid) {
    if (grid.spacing_km != null) {
      sampling = grid.spacing_km < 1
        ? `${Math.round(grid.spacing_km * 1000)} m grid`
        : `${grid.spacing_km} km grid`;
    } else if (grid.step_deg != null) {
      sampling = `${grid.step_deg}° grid, roughly ${Math.round(grid.step_deg * 30)} km`;
    }
    if (grid.n_az) sampling += `, ${grid.n_az} directions`;
  }

  return {
    low,
    short: low ? "Lower precision" : "Full terrain precision",
    sentence: low
      ? `Lower precision: outside the south polar region the terrain comes from a ${sampling || "coarse grid"}. ` +
        "Sun and Earth positions are exact everywhere."
      : `Full terrain precision: horizon from a ${sampling || "south polar grid"}.`,
  };
}

/* ---------- panel pieces ---------- */

function precisionBadge(r) {
  const p = precisionOf(r);
  return el("p", p.sentence, p.low ? "badge badge--low" : "badge");
}

function gridNote(r, site) {
  const gp = r.horizon?.point;
  if (!gp) return null;
  const txt = `Terrain taken from the nearest grid point, ${formatLatLon(gp.lat, gp.lon)}, ` +
    `${distanceKm(site, gp).toFixed(2)} km away` +
    (r.horizon.grid_id ? ` · grid ${r.horizon.grid_id}` : "");
  return el("p", txt, "pending");
}

function heading(text) {
  return el("h4", text, "r-head");
}

// rows: [[label, value, valueClass?], ...]
function defList(rows) {
  const dl = el("dl");
  for (const [label, value, cls] of rows) {
    dl.append(el("dt", label), el("dd", value, cls));
  }
  return dl;
}

function hoursOrDays(h) {
  if (h == null) return "—";
  return h >= 48 ? `${(h / 24).toFixed(1)} days` : `${h} hours`;
}

/* ---------- Beginner: wording comes from design/beginner.js (D1, T3) ---------- */

function beginnerPanel(r, hour) {
  const b = beginnerSummary(r, {
    placeName: state.site.name,
    clickLat: state.site.lat,
    clickLon: state.site.lon,
  });

  const out = [];

  const list = el("div", null, "answers");
  for (const a of b.answers) {
    const row = el("div", null, `answer tone-${a.tone}`);
    const icon = el("span", null, "answer-icon");
    icon.innerHTML = ICONS[a.icon] || "";
    const text = el("div", null, "answer-text");
    text.append(
      el("p", a.question, "answer-q"),
      el("p", a.answer, "answer-a"),
      el("p", a.detail, "answer-d"),
    );
    row.append(icon, text);
    list.append(row);
  }
  out.push(list);

  if (hour != null) {
    const now = beginnerNow(r, hour);
    const box = el("div", null, `now tone-${now.tone}`);
    box.append(el("p", now.sun, "now-line"), el("p", now.earth, "now-line"));
    out.push(heading("On the date you picked"), box);
  }

  out.push(el("p", b.sentence, "r-sentence"));

  for (const n of b.notes) out.push(el("p", n.text, "pending"));

  return out;
}

/* ---------- Intermediate: angles and percentages ---------- */

function intermediatePanel(r, hour) {
  const s = r.summary;
  return [
    heading("At the selected hour"),
    defList(hour == null ? [["Outside 2027–2028", "—"]] : [
      ["Sun", formatAzEl({ az: r.sun_az[hour], el: r.sun_el[hour] }), "val-sun"],
      ["Earth", formatAzEl({ az: r.earth_az[hour], el: r.earth_el[hour] }), "val-earth"],
      ["Sunlight", r.power[hour] ? "Yes" : "No"],
      ["Earth in view", r.comms[hour] ? "Yes" : "No"],
    ]),
    heading("Across 2027–2028"),
    defList([
      ["Time with sunlight", `${s.pct_sunlit.toFixed(1)} %`, "val-sun"],
      ["Time with Earth contact", `${s.pct_earth.toFixed(1)} %`, "val-earth"],
      ["Time with both", `${s.pct_both.toFixed(1)} %`, "val-both"],
      ["Longest dark period", hoursOrDays(s.longest_dark_hours)],
      ["Longest gap in contact", hoursOrDays(s.longest_no_comms_hours)],
    ]),
  ];
}

/* ---------- Advanced: exact numbers ---------- */
// The hour-by-hour table and the CSV download are W6.

function advancedPanel(r, hour) {
  const s = r.summary;
  const out = [heading("At the selected hour")];

  if (hour == null) {
    out.push(defList([["Outside 2027–2028", "—"]]));
  } else {
    const sunAz = r.sun_az[hour];
    const hz = horizonAt(r.horizon.values, sunAz);
    out.push(defList([
      ["Hour index", String(r.start_index + hour)],
      ["UTC", new Date(core.timeOf(r.start_index + hour)).toISOString().replace(".000Z", "Z")],
      ["Sun azimuth", `${sunAz.toFixed(4)}°`, "val-sun"],
      ["Sun elevation", `${r.sun_el[hour].toFixed(4)}°`, "val-sun"],
      ["Earth azimuth", `${r.earth_az[hour].toFixed(4)}°`, "val-earth"],
      ["Earth elevation", `${r.earth_el[hour].toFixed(4)}°`, "val-earth"],
      ["Sun disc above terrain", `${(r.sun_fraction[hour] * 100).toFixed(1)} %`],
      ...(hz == null ? [] : [["Horizon at Sun azimuth", `${hz.toFixed(4)}°`, "val-terrain"]]),
      ["Power flag", r.power[hour] ? "1" : "0"],
      ["Comms flag", r.comms[hour] ? "1" : "0"],
    ]));
  }

  out.push(
    heading("Across 2027–2028"),
    defList([
      ["Hours analysed", r.hours.toLocaleString("en-GB")],
      ["Sunlit", `${s.pct_sunlit.toFixed(2)} %`, "val-sun"],
      ["Earth contact", `${s.pct_earth.toFixed(2)} %`, "val-earth"],
      ["Both", `${s.pct_both.toFixed(2)} %`, "val-both"],
      ["Longest dark", `${s.longest_dark_hours} h`],
      ["Longest no contact", `${s.longest_no_comms_hours} h`],
      ["Power windows", String(r.windows.power.length)],
      ["Comms windows", String(r.windows.comms.length)],
      ["Windows with both", String(r.windows.both.length)],
      ["Horizon bins", `${r.horizon.values.length} × ${r.horizon.az_step_deg}°`],
    ]),
  );
  return out;
}

/* ---------- time (W4) ---------- */

// S9 (T3): one Play control on the timeline; it cycles slowly through 2027–2028 until paused.
function mountTimePlayer() {
  const head = document.querySelector(".timebar-head");
  if (timePlayer || !head) return;
  timePlayer = createTimePlayer(head, { getHour: () => state.hour, setHour, lastHour: LAST_HOUR, loop: true, speed: 12 });
}

function setHour(h) {
  if (!Number.isFinite(h)) return;
  state.hour = Math.min(LAST_HOUR, Math.max(0, Math.round(h)));
  syncTimeControls();
  renderLanding();
  renderResults();   // reuses the cached analysis; no recompute
  drawMarker();
  pushTimeToViewer();
}

function hourToDate(h) {
  return new Date(core ? core.timeOf(h) : Date.UTC(2027, 0, 1) + h * 3600_000);
}

function syncTimeControls() {
  const d = hourToDate(state.hour);
  const iso = d.toISOString();
  $("time-slider").value = String(state.hour);
  $("date").value = iso.slice(0, 10);
  $("time-readout").textContent =
    `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC · hour ${state.hour.toLocaleString("en-GB")}`;
}

/* ---------- timeline strip ---------- */
// Three bands: sunlight, Earth contact, both. One canvas column per pixel,
// coloured when most of the hours in that column qualify.

const BAND_H = 16;
const BAND_GAP = 2;

function sizeCanvas() {
  const canvas = $("timeline-canvas");
  const width = canvas.parentElement.clientWidth;
  if (!width) return null;
  const dpr = window.devicePixelRatio || 1;
  const height = BAND_H * 3 + BAND_GAP * 2;
  canvas.style.width = "100%";
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawTimeline() {
  const sized = sizeCanvas();
  if (!sized) return;
  const { ctx, width, height } = sized;
  const r = state.result;

  ctx.clearRect(0, 0, width, height);

  const none = cssVar("--none");
  const bands = [
    { flags: r?.power, colour: cssVar("--sun") },
    { flags: r?.comms, colour: cssVar("--earth") },
    { flags: r?.both,  colour: cssVar("--both") },
  ];

  bands.forEach((band, row) => {
    const y = row * (BAND_H + BAND_GAP);
    ctx.fillStyle = none;
    ctx.fillRect(0, y, width, BAND_H);
    if (!band.flags) return;

    const perPx = (LAST_HOUR + 1) / width;
    ctx.fillStyle = band.colour;
    for (let x = 0; x < width; x++) {
      const from = Math.floor(x * perPx);
      const to = Math.min(band.flags.length, Math.floor((x + 1) * perPx));
      let on = 0;
      for (let i = from; i < to; i++) if (band.flags[i]) on++;
      // part-filled columns get a shorter bar, so brief windows stay visible
      const share = to > from ? on / (to - from) : 0;
      if (share > 0) {
        const h = Math.max(3, Math.round(BAND_H * share));
        ctx.fillRect(x, y + BAND_H - h, 1, h);
      }
    }
  });

  // year divider
  const yearX = Math.round((8760 / (LAST_HOUR + 1)) * width);
  ctx.fillStyle = cssVar("--line");
  ctx.fillRect(yearX, 0, 1, height);

  drawMarker();

  $("timeline-caption").textContent = r
    ? `${r.windows.power.length} sunlight windows · ${r.windows.comms.length} contact windows · ` +
      `${r.windows.both.length} with both · ${precisionOf(r).short}. ` +
      "Click or drag to move the date. Left half 2027, right half 2028."
    : "Pick a site to see its windows.";
}

// The marker lives on its own element so moving the date never redraws the bands.
function drawMarker() {
  const el = $("time-marker");
  if (!el) return;
  el.style.left = `${(state.hour / LAST_HOUR) * 100}%`;
}

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { drawTimeline(); renderPanorama(); }, 150);
});

/* ---------- horizon panorama (W5, Intermediate) ---------- */

// One synodic month each side of the selected hour: enough for the Sun to go
// right around the sky once, which is the point of the picture.
const MONTH_HOURS = 709;

function trackPoints(r, azArr, elArr, span, hour = state.hour) {
  const i = hour - r.start_index;
  const from = Math.max(0, i - span);
  const to = Math.min(elArr.length, i + span);
  const points = [];
  for (let k = from; k < to; k++) points.push({ az: azArr[k], el: elArr[k] });
  return points;
}

// S9 (T3): the panorama shows in every mode; the Sun and Earth sit at the selected hour with a fading
// 2-day trail, dim + dashed when behind terrain, and Play moves time (time-player.js).
const TRAIL_HOURS = 48;

function trailPoints(r, azArr, elArr, hour = state.hour) {
  const i = hour - r.start_index, points = [];
  for (let k = Math.max(0, i - TRAIL_HOURS); k <= i && k < elArr.length; k++) points.push({ az: azArr[k], el: elArr[k] });
  return points;
}

function renderPanorama() {
  const section = $("panorama");
  const r = state.result;
  if (!r) {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  // S11 (T3): the panorama runs on its own hour, set by its own slider
  if (panoHour == null) panoHour = state.hour;
  panoSlider ||= createPanoramaSlider($("panorama-canvas").parentElement.insertBefore(document.createElement("div"), $("panorama-canvas")), {
    lastHour: LAST_HOUR, timeOf: (h) => hourToDate(h).getTime(), getTimelineHour: () => state.hour,
    onChange: (h) => { panoHour = h; renderPanorama(); },
  });
  panoSlider.set(panoHour);
  const hour = panoHour;
  const i = hour - r.start_index;
  const inRange = i >= 0 && i < r.sun_el.length;
  const beginner = state.mode === "beginner";
  // every mode labels the two bodies; Beginner adds plain visible / blocked
  const label = (name, ok) => (beginner ? `${name} · ${ok ? "visible" : "blocked"}` : `${name}${ok ? "" : " (blocked)"}`);

  const ok = drawHorizonPanorama($("panorama-canvas"), {
    horizon: r.horizon,
    tracks: [
      ...(beginner ? [] : [
        { points: trackPoints(r, r.sun_az, r.sun_el, MONTH_HOURS, hour), tone: "muted" },
        { points: trackPoints(r, r.earth_az, r.earth_el, MONTH_HOURS, hour), tone: "muted" },
      ]),
      { points: trailPoints(r, r.sun_az, r.sun_el, hour), tone: "sun", fade: true },
      { points: trailPoints(r, r.earth_az, r.earth_el, hour), tone: "earth", fade: true },
    ],
    markers: inRange ? [
      { az: r.sun_az[i], el: r.sun_el[i], tone: "sun", blocked: !r.power[i], label: label("Sun", r.power[i]) },
      { az: r.earth_az[i], el: r.earth_el[i], tone: "earth", blocked: !r.comms[i], label: label("Earth", r.comms[i]) },
    ] : [],
    height: beginner ? 200 : 240,
  });

  const p = precisionOf(r);
  $("panorama-sub").textContent = !ok ? "" : beginner
    ? "The skyline all around this spot, with the Sun and Earth at the panorama's own time. Drag its slider to move them."
    : `${p.short} · skyline from ${r.horizon.values.length} directions · fading trail = last 2 days · ` +
      `grey = ${Math.round(MONTH_HOURS / 24)} days either side · dimmed + dashed = behind terrain`;
  $("panorama-sub").classList.toggle("is-low", p.low);
}

/* ---------- hour-by-hour table + CSV (W6, Advanced) ---------- */

const CSV_COLUMNS = [
  "utc", "hour_index", "sun_az_deg", "sun_el_deg", "earth_az_deg", "earth_el_deg",
  "sun_disc_fraction", "power", "comms",
];

function hourRow(r, i) {
  const abs = r.start_index + i;
  return {
    utc: new Date(core.timeOf(abs)).toISOString().replace(".000Z", "Z"),
    hour_index: abs,
    sun_az_deg: r.sun_az[i],
    sun_el_deg: r.sun_el[i],
    earth_az_deg: r.earth_az[i],
    earth_el_deg: r.earth_el[i],
    sun_disc_fraction: r.sun_fraction[i],
    power: r.power[i] ? 1 : 0,
    comms: r.comms[i] ? 1 : 0,
  };
}

// The 24 hours of the UTC day the slider is on.
function dayRange(r) {
  const dayStart = Math.floor(state.hour / 24) * 24;
  const from = Math.max(0, dayStart - r.start_index);
  const to = Math.min(r.sun_el.length, from + 24);
  return { from, to };
}

function renderHourTable() {
  const section = $("hour-table");
  const r = state.result;
  if (!r || state.mode !== "advanced") {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  const { from, to } = dayRange(r);
  const body = $("hourtable-body");
  const rows = [];

  for (let i = from; i < to; i++) {
    const d = hourRow(r, i);
    const tr = el("tr", null, d.hour_index === state.hour ? "is-now" : null);
    tr.append(
      el("td", d.utc.slice(11, 16)),
      el("td", d.sun_az_deg.toFixed(2), "val-sun"),
      el("td", d.sun_el_deg.toFixed(3), "val-sun"),
      el("td", d.earth_az_deg.toFixed(2), "val-earth"),
      el("td", d.earth_el_deg.toFixed(3), "val-earth"),
      el("td", `${(d.sun_disc_fraction * 100).toFixed(0)}%`),
      el("td", d.power ? "1" : "·", d.power ? "val-sun" : "val-off"),
      el("td", d.comms ? "1" : "·", d.comms ? "val-earth" : "val-off"),
    );
    // clicking a row moves the whole app to that hour
    tr.addEventListener("click", () => setHour(d.hour_index));
    rows.push(tr);
  }
  body.replaceChildren(...rows);

  const day = new Date(core.timeOf(state.hour)).toISOString().slice(0, 10);
  $("hourtable-day").textContent = `${day} · ${rows.length} hours · click a row to jump`;
  const p = precisionOf(r);
  $("hourtable-precision").textContent = p.sentence;
  $("hourtable-precision").classList.toggle("is-low", p.low);
  $("csv-note").textContent =
    `CSV columns: ${CSV_COLUMNS.join(", ")}. Angles in degrees, power and comms are 1 or 0. ` +
    "Lines starting with # record the site, the grid the terrain came from and its precision.";
}

function buildCsv(r, from, to) {
  const site = state.site;
  const gp = r.horizon?.point;
  const lines = [
    `# FHLS export · ${site.name || "picked point"}`,
    `# click: ${site.lat.toFixed(5)}, ${site.lon.toFixed(5)}`,
    gp ? `# terrain grid point: ${gp.lat.toFixed(5)}, ${gp.lon.toFixed(5)} (${distanceKm(site, gp).toFixed(3)} km away)` : "# terrain grid point: none",
    `# grid: ${r.horizon?.grid_id || "none"} · precision: ${r.precision}`,
    `# ${precisionOf(r).sentence}`,
    "# power = more than half the Sun's disc above the terrain; comms = centre of Earth above the terrain",
    "# neither guarantees usable power or a radio link",
    `# ephemeris: JPL SPICE DE440 via core/fhls-core.js · generated ${new Date().toISOString().slice(0, 19)}Z`,
    CSV_COLUMNS.join(","),
  ];
  for (let i = from; i < to; i++) {
    const d = hourRow(r, i);
    lines.push([
      d.utc, d.hour_index,
      d.sun_az_deg.toFixed(4), d.sun_el_deg.toFixed(4),
      d.earth_az_deg.toFixed(4), d.earth_el_deg.toFixed(4),
      d.sun_disc_fraction.toFixed(4), d.power, d.comms,
    ].join(","));
  }
  return lines.join("\n") + "\n";
}

function downloadCsv(scope) {
  const r = state.result;
  if (!r) return;
  const { from, to } = scope === "day" ? dayRange(r) : { from: 0, to: r.sun_el.length };
  const csv = buildCsv(r, from, to);

  const slug = (state.site.name || "point").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const stamp = scope === "day"
    ? new Date(core.timeOf(state.hour)).toISOString().slice(0, 10)
    : "2027-2028";
  const name = `fhls-${slug}-${stamp}.csv`;

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
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
  const now = core.at(REFERENCE.lat, REFERENCE.lon, state.hour);
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
$("back-to-landing").addEventListener("click", () => show(pickerOrigin));
for (const button of document.querySelectorAll("[data-home]")) button.addEventListener("click", goHome);
$("change-mode").addEventListener("click", () => show("modes"));

for (const btn of document.querySelectorAll(".mode")) {
  btn.addEventListener("click", () => {
    setMode(btn.dataset.mode);
    show("app");
    renderResults();
  });
}

$("date").addEventListener("change", (e) => {
  if (!e.target.value || !core) return;
  setHour(core.indexOf(`${e.target.value}T12:00:00Z`));
});

$("time-slider").addEventListener("input", (e) => setHour(Number(e.target.value)));

$("pin-site").addEventListener("click", pinCurrent);
$("clear-pins").addEventListener("click", () => { state.pins = []; renderPins(); renderPinControl(); });

$("csv-day").addEventListener("click", () => downloadCsv("day"));
$("csv-all").addEventListener("click", () => downloadCsv("all"));

// Clicking or dragging on the strip jumps to that hour.
for (const type of ["pointerdown", "pointermove"]) {
  $("timeline-canvas").addEventListener(type, (e) => {
    if (type === "pointermove" && e.buttons !== 1) return;
    const box = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    setHour(Math.round(frac * LAST_HOUR));
  });
}

startAtmosphere();     // before init(): the sky must not wait on the data load
playEntrance();
sky?.setDensity(state.screen === "landing" ? "landing" : state.mode);
setMode(state.mode);
// P14: core includes the ephemeris; init also loads sites and the horizon index.
const startupReady = init().then(async issues => {
  if (landingViewer) await landingViewer.ready;
  else if (state.screen === 'landing') throw new Error('The Moon preview could not start. Site data may still be available.');
  if (issues.length) throw new Error(issues.join(' '));
});
startupReady.catch(() => {}); // the early inline loader announces startup errors
window.FHLSLoading?.waitFor(startupReady);

// A restored page keeps its existing viewers; a page leaving the cache releases
// both GPU contexts. Screen changes already dispose the decorative intro.
window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  landingViewer?.dispose(); viewer?.dispose();
});

// Hook for the viewer (T1) and later web tasks.
window.FHLS = {
  ready: startupReady,
  get core() { return core; },
  get state() { return { ...state }; },
  get sites() { return sites; },
  setSite(lat, lon, name) { return selectSite({ lat, lon, name }); },
  setMode,
  show,
  get sky() { return sky; },
  pin: pinCurrent,
  get pins() { return state.pins.map((p) => ({ ...p })); },
  get viewer() { return viewer; },
  get landingViewer() { return landingViewer; },
  buildCsv: (scope = "all") => {
    const r = state.result;
    if (!r) return null;
    const { from, to } = scope === "day" ? dayRange(r) : { from: 0, to: r.sun_el.length };
    return buildCsv(r, from, to);
  },
};

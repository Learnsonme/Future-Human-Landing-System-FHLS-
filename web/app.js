// FHLS web shell. Screens and mode (W1); site selection → core → results panel (W2).
// All astronomy comes from core/fhls-core.js — never recomputed here.
import { loadCore, horizonAt, R_KM } from "../core/fhls-core.js";
import { beginnerSummary, beginnerNow, ICONS } from "../design/beginner.js";

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
  const body = $("r-body");
  body.hidden = false;

  const i = core.indexOf(`${state.date}T12:00:00Z`) - r.start_index;
  const hour = (i >= 0 && i < r.sun_el.length) ? i : null;

  const parts = state.mode === "beginner"
    ? beginnerPanel(r, hour)
    : [precisionBadge(r),
       ...(state.mode === "advanced" ? advancedPanel(r, hour) : intermediatePanel(r, hour)),
       gridNote(r, site)];

  body.replaceChildren(...parts.filter(Boolean));
}

/* ---------- panel pieces ---------- */

function precisionBadge(r) {
  const low = r.precision !== "high";
  const node = el("p",
    low ? "Lower precision · coarse terrain outside the south polar region"
        : "Full terrain precision",
    low ? "badge badge--low" : "badge");
  return node;
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
    el("p", "Hour-by-hour table and CSV download arrive with W6.", "pending"),
  );
  return out;
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
    renderResults();
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

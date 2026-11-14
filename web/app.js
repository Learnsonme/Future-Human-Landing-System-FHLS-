// FHLS web shell (W1). Screens, mode state, and the first real numbers from core.
// All astronomy comes from core/fhls-core.js — never recomputed here.
import { loadCore } from "../core/fhls-core.js";

const MODES = {
  beginner:     { label: "Beginner" },
  intermediate: { label: "Intermediate" },
  advanced:     { label: "Advanced" },
};

// Shackleton, the reference point T3 validated the ephemeris against.
const DEFAULT_SITE = { lat: -89.90, lon: 0 };

const state = {
  screen: "landing",
  mode: restoreMode() || "beginner",
  site: { ...DEFAULT_SITE },
  date: "2027-01-15",
};

let core = null;
let coreError = null;

const $ = (id) => document.getElementById(id);

/* ---------- screens ---------- */

function show(screen) {
  state.screen = screen;
  document.body.dataset.screen = screen;
  window.scrollTo(0, 0);
  const focus = {
    landing: "start",
    modes: null,
    app: null,
  }[screen];
  if (focus) $(focus).focus({ preventScroll: true });
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

/* ---------- core ---------- */

async function initCore() {
  try {
    core = await loadCore("../data");
  } catch (err) {
    coreError = err;
    console.error("core failed to load", err);
    const notice = $("data-notice");
    notice.textContent =
      "Could not load data/ — the page is running without the ephemeris, so no angles are shown. " +
      "Serve the repository over HTTP rather than opening the file directly.";
    notice.hidden = false;
  }
  render();
}

function formatAngle(deg) {
  const sign = deg < 0 ? "−" : "+";
  return `${sign}${Math.abs(deg).toFixed(2)}°`;
}

function formatAzEl(a) {
  return `${a.az.toFixed(1)}° az · ${formatAngle(a.el)}`;
}

function el(tag, text, cls, id) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (cls) node.className = cls;
  if (id) node.id = id;
  return node;
}

/* ---------- render ---------- */

function render() {
  const { lat, lon } = state.site;
  $("r-latlon").textContent =
    `${Math.abs(lat).toFixed(2)}°${lat < 0 ? "S" : "N"}, ${Math.abs(lon).toFixed(2)}°${lon < 0 ? "W" : "E"}`;

  if (!core) {
    for (const id of ["r-sun", "r-earth"]) $(id).textContent = "—";
    $("live-readout").replaceChildren(
      document.createTextNode(coreError ? "data unavailable" : "loading…"),
      el("small", coreError ? "see the note on the results screen" : "reading data/ephemeris.bin", null, "live-note"),
    );
    return;
  }

  const t = `${state.date}T12:00:00Z`;
  const now = core.at(lat, lon, t);

  $("r-sun").textContent = formatAzEl(now.sun);
  $("r-earth").textContent = formatAzEl(now.earth);

  // Landing strip: one specific, real line, in the style guide's own example format.
  // Rebuilt as nodes, not innerHTML, so the caption element survives a re-render.
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
    render();
  });
}

$("date").addEventListener("change", (e) => {
  if (!e.target.value) return;
  state.date = e.target.value;
  render();
});

setMode(state.mode);
$("date").value = state.date;
initCore();

// Lets the viewer (T1) and later web tasks hook in without touching this file again.
window.FHLS = {
  get core() { return core; },
  get state() { return { ...state }; },
  setSite(lat, lon) { state.site = { lat, lon }; render(); },
  setMode,
  show,
};

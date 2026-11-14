// S10 + P10 · "Map" control over the 3D view (T3). Off by default. Whole Moon, higher detail at the south pole.
//   Beginner      one switch "Sunlight map", legend "rarely lit … often lit"
//   Intermediate  Off / Sunlight / Earth contact / Both, numeric % legend
//   Advanced      + Longest blackout and a month selector; clicking the terrain shows the exact map value
//
//   import { mountHeatmapControl } from "./components/heatmap-control.js";
//   const heat = mountHeatmapControl(document.getElementById("viewer-slot"), { mode: "beginner" });
//   heat.attach(viewer);   // after each createViewer (Home round trips make a new viewer)
//   heat.setMode(mode);    // when the mode changes
import { loadHeatmap, scaleColour } from "./heatmap.js";

const LAYERS = {
  sunlit: { label: "Sunlight", fill: "--sun-fill", fallback: "#F2B33D" },
  earth: { label: "Earth contact", fill: "--earth-fill", fallback: "#4C9BE8" },
  both: { label: "Both", fill: "--both-fill", fallback: "#5BC08A" },
  dark: { label: "Longest blackout", fill: "--sun-fill", fallback: "#F2B33D" },
};
const BY_MODE = { beginner: ["sunlit"], intermediate: ["sunlit", "earth", "both"], advanced: ["sunlit", "earth", "both", "dark"] };
const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

export function mountHeatmapControl(stage, { dataBase = "../data", mode = "beginner" } = {}) {
  if (!document.querySelector("link[data-fhls-heatmap]")) {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.dataset.fhlsHeatmap = "";
    link.href = new URL("./heatmap.css", import.meta.url).href; document.head.append(link);
  }
  const state = { mode, layer: null, month: null, viewer: null, unpick: null };
  let heat = null, heatPromise = null;
  const rendered = new Map();
  const ensure = () => (heatPromise ||= loadHeatmap(dataBase).then((h) => (heat = h)));

  const root = el("section", "heat-control"); root.setAttribute("aria-label", "Heat map, whole Moon");
  const head = el("div", "heat-head"); head.append(el("span", "heat-title", "Map"), el("span", "heat-note", "Whole Moon · higher detail at the south pole"));
  const buttons = el("div", "heat-buttons"); buttons.setAttribute("role", "group");
  const monthWrap = el("label", "heat-month"); const monthSelect = el("select");
  monthWrap.append(el("span", null, "Period"), monthSelect);
  const legend = el("div", "heat-legend"); const bar = el("div", "heat-bar"); bar.setAttribute("aria-hidden", "true");
  const ticks = el("div", "heat-ticks"); legend.append(bar, ticks);
  const readout = el("p", "heat-readout"); readout.setAttribute("aria-live", "polite");
  // P13: on phones the panel folds into a small "Map" button so it doesn't cover the Moon
  const toggle = el("button", "heat-toggle"); toggle.type = "button"; toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = '<svg viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d="M2.5 4.5 7 3l4 1.5 4.5-1.5v10L11 14.5 7 13l-4.5 1.5z M7 3v10M11 4.5v10"/></svg><span>Map</span>';
  toggle.addEventListener("click", () => { const open = !root.classList.contains("is-open"); root.classList.toggle("is-open", open); toggle.setAttribute("aria-expanded", String(open)); });
  const body = el("div", "heat-body"); body.append(head, buttons, monthWrap, legend, readout);
  root.append(toggle, body);
  stage.append(root);

  // P10: the same blue → cyan → yellow → orange → red scale as the map (heatmap.js scaleColour)
  const ramp = (t) => `rgb(${scaleColour(t).join(",")})`;
  function drawLegend() {
    legend.hidden = !state.layer; if (!state.layer) return;
    // a CSS gradient with the same square-root ramp as the map (no extra canvas in the stage)
    bar.style.background = `linear-gradient(to right, ${Array.from({ length: 11 }, (_, i) => `${ramp(i / 10)} ${i * 10}%`).join(", ")})`;
    ticks.replaceChildren(...(state.mode === "beginner" ? ["0 % · rarely lit", "100 % · often lit"]
      : state.layer === "dark" ? ["0 days", "30", "≥ 60 days"] : ["0 %", "25 %", "50 %", "75 %", "100 %"])
      .map((t) => el("span", null, t)));
  }
  async function apply() {
    drawLegend();
    readout.textContent = "";
    const v = state.viewer;
    if (!v) return;
    const alive = () => state.viewer === v && !v.getDiagnostics?.().disposed;
    if (!alive()) return;
    if (!state.layer) { try { v.clearOverlay?.(); v.clearGlobalOverlay?.(); } catch { /* disposed */ } return; }
    root.dataset.loading = "";
    try {
      await ensure();
      const key = `${state.layer}|${state.month}`;
      // P10: the whole-Moon layer first (shows at once on the globe), then the detailed south polar one
      if (!rendered.has("g|" + key)) rendered.set("g|" + key, heat.renderGlobal({ layer: state.layer, month: state.month }));
      const G = await rendered.get("g|" + key);
      if (!alive() || `${state.layer}|${state.month}` !== key) return;
      if (G) v.setGlobalOverlay?.(G.canvas, { lat_min: G.lat_min, lat_max: G.lat_max, lon_min: G.lon_min, lon_max: G.lon_max, opacity: 0.6 });
      if (!rendered.has(key)) rendered.set(key, heat.render({ layer: state.layer, month: state.month }));
      const L = await rendered.get(key);
      if (!alive() || `${state.layer}|${state.month}` !== key) return;
      v.setOverlay(L.canvas, { x0_km: L.x0_km, y0_km: L.y0_km, size_km: L.size_km, opacity: 0.6 });
    } catch (err) {
      console.error("heat map unavailable", err); readout.textContent = "Heat map unavailable.";
    } finally { delete root.dataset.loading; }
  }
  function build() {
    const allowed = BY_MODE[state.mode] || BY_MODE.beginner;
    if (state.layer && !allowed.includes(state.layer)) state.layer = allowed[0];
    if (state.mode !== "advanced") state.month = null;
    buttons.replaceChildren();
    if (state.mode === "beginner") {
      const b = el("button", "heat-btn", "Sunlight map"); b.type = "button";
      b.setAttribute("aria-pressed", String(!!state.layer));
      b.addEventListener("click", () => { state.layer = state.layer ? null : "sunlit"; build(); apply(); });
      buttons.append(b);
    } else {
      for (const key of [null, ...allowed]) {
        const b = el("button", "heat-btn", key ? LAYERS[key].label : "Off"); b.type = "button";
        b.setAttribute("aria-pressed", String(state.layer === key));
        b.addEventListener("click", () => { state.layer = key; build(); apply(); });
        buttons.append(b);
      }
    }
    monthWrap.hidden = state.mode !== "advanced" || !state.layer;
    drawLegend();
  }
  monthSelect.addEventListener("change", () => { state.month = monthSelect.value === "" ? null : Number(monthSelect.value); apply(); });
  ensure().then((h) => {
    monthSelect.replaceChildren(el("option", null, "All of 2027–2028"),
      ...h.months.map((m, k) => { const o = el("option", null, new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })); o.value = String(k); return o; }));
    monthSelect.firstChild.value = "";
  }).catch(() => {});
  build();

  return {
    attach(viewer) {
      state.unpick?.(); state.viewer = viewer; state.unpick = null;
      if (!viewer) return;
      // Advanced: clicking the terrain shows the exact stored map value there.
      state.unpick = viewer.onPick(async (lat, lon) => {
        if (state.mode !== "advanced" || !state.layer || state.viewer !== viewer) return;
        await ensure();
        const r = await heat.valueAt(lat, lon, state.layer, state.month);
        const where = r && (r.precision === "low" ? "whole-Moon map, lower precision" : r.grid.replace("_", " "));
        readout.textContent = !r ? "No map value here."
          : state.layer === "dark" ? `Map value here: ${r.capped ? "≥ 255" : r.value} days longest blackout (${where})`
          : `Map value here: ${r.value} % ${LAYERS[state.layer].label.toLowerCase()} (${where})`;
      });
      viewer.ready.then(() => { if (state.viewer === viewer) apply(); }).catch(() => {});
    },
    setMode(mode) { state.mode = mode; build(); apply(); },
    destroy() { state.unpick?.(); root.remove(); },
  };
}

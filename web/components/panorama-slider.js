// S11 · The horizon panorama's own time slider (T3). Independent of the main timeline: it moves only the
// panorama's Sun and Earth. "Match timeline" copies the main timeline's hour into it.
//
//   const slider = createPanoramaSlider(mountEl, { lastHour, timeOf, getTimelineHour, onChange });
//   slider.set(hour)      // programmatic (e.g. when a new site is chosen); does not call onChange
const CSS = `.pano-time{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;gap:12px;align-items:center;margin:4px 0 12px;max-width:100%;padding-right:4px;box-sizing:border-box}
.pano-time label{font:500 12px/1 var(--mono,monospace);letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#9A978F)}
.pano-time input[type=range]{width:100%;accent-color:var(--sun,#F2B33D)}
.pano-time input[type=range]:focus-visible{outline:2px solid var(--sun,#F2B33D);outline-offset:4px}
.pano-time output{font:400 12px/1 var(--mono,monospace);color:var(--text,#ECE9E2);white-space:nowrap}
.pano-time .pano-match{white-space:nowrap;font:400 12px/1 var(--sans,sans-serif);color:var(--muted,#9A978F);background:none;border:0;padding:6px 0;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.pano-time .pano-match:hover{color:var(--text,#ECE9E2)}
.pano-time .pano-match:focus-visible{outline:2px solid var(--sun,#F2B33D);outline-offset:2px}
.pano-time .pano-match[hidden]{display:none}
@media (max-width:600px){.pano-time{grid-template-columns:minmax(0,1fr) auto}.pano-time input[type=range]{grid-column:1/-1}}`;

export function createPanoramaSlider(mount, { lastHour, timeOf, getTimelineHour, onChange }) {
  if (!document.querySelector("style[data-pano-time]")) {
    const st = document.createElement("style"); st.dataset.panoTime = ""; st.textContent = CSS; document.head.append(st);
  }
  const row = document.createElement("div"); row.className = "pano-time";
  const label = document.createElement("label"); label.textContent = "Panorama time"; label.htmlFor = "pano-hour";
  const input = document.createElement("input");
  Object.assign(input, { type: "range", id: "pano-hour", min: "0", max: String(lastHour), step: "1", value: "0" });
  input.setAttribute("aria-describedby", "pano-hour-readout");
  const out = document.createElement("output"); out.id = "pano-hour-readout"; out.setAttribute("aria-live", "polite");
  const match = document.createElement("button"); match.type = "button"; match.className = "pano-match"; match.textContent = "Match timeline";
  row.append(label, input, out, match);
  mount.append(row);

  const text = (h) => { const iso = new Date(timeOf(h)).toISOString(); return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`; };
  function show(h) {
    input.value = String(h); out.textContent = text(h);
    input.setAttribute("aria-valuetext", text(h));
    match.hidden = h === getTimelineHour();            // only offered when the two differ
  }
  input.addEventListener("input", () => { const h = Number(input.value); show(h); onChange(h); });
  match.addEventListener("click", () => { const h = getTimelineHour(); show(h); onChange(h); input.focus(); });

  return { set(h) { show(Math.max(0, Math.min(lastHour, Math.round(h)))); }, refresh() { show(Number(input.value)); } };
}

/**
 * web/components/horizon-panorama.js · W5 · Horizon panorama (T2).
 * Standalone: no imports, no astronomy. Give it a horizon array and tracks of
 * azimuth/elevation points; it draws them. See README.md in this folder.
 *
 *   import { drawHorizonPanorama } from "./components/horizon-panorama.js";
 *   drawHorizonPanorama(canvas, {
 *     horizon: { values, az_step_deg },      // elevation of the skyline per azimuth bin
 *     tracks:  [{ points: [{az, el}], tone: "sun", label: "Sun, this month" }],
 *     markers: [{ az, el, tone: "sun", label: "Sun now" }],
 *   });
 *
 * S9 (T3) additions, all optional and backward compatible:
 *   tracks[].fade = true      draw the points with opacity rising from old to new (a fading trail)
 *   markers[].blocked = true  body is behind terrain: drawn at 35 % with a dashed outline
 *   markers[].label = "…"     small text next to the marker (used in Beginner: "Sun · visible")
 *
 * Colours come from CSS custom properties on the canvas (--sun, --earth,
 * --terrain, --line, --muted, --text, --surface), so it follows design/style.md
 * wherever it is mounted. Pass `colours` to override.
 */

const PAD = { top: 14, right: 12, bottom: 26, left: 40 };
const TONES = ["sun", "earth", "both", "terrain", "muted", "text"];

function readColours(canvas, overrides = {}) {
  const style = getComputedStyle(canvas);
  const pick = (name, fallback) =>
    overrides[name] || style.getPropertyValue(`--${name}`).trim() || fallback;
  return {
    sun: pick("sun", "#F2B33D"),
    earth: pick("earth", "#4C9BE8"),
    both: pick("both", "#5BC08A"),
    terrain: pick("terrain", "#6B6760"),
    line: pick("line", "#2E2E2E"),
    muted: pick("muted", "#9A978F"),
    text: pick("text", "#ECE9E2"),
    surface: pick("surface", "#1E1E1E"),
  };
}

/** Elevation of the skyline at an azimuth, with wrap-around. */
export function horizonAtAzimuth(values, azStep, az) {
  if (!values || !values.length) return 0;
  const n = values.length;
  const exact = (((az % 360) + 360) % 360) / azStep;
  const i = Math.floor(exact);
  const frac = exact - i;
  const a = values[i % n];
  const b = values[(i + 1) % n];
  return a + (b - a) * frac;   // linear between bins, so the skyline is not stepped
}

/** The elevation window to draw, from the data, rounded outwards. */
function elevationRange(horizon, tracks, markers = []) {
  let lo = 0, hi = 2;
  if (horizon?.values?.length) {
    for (const v of horizon.values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  }
  for (const t of tracks || []) {
    for (const p of t.points) { if (p.el < lo) lo = p.el; if (p.el > hi) hi = p.el; }
  }
  // S9 fix (T3): the current Sun/Earth must always be inside the chart, never clipped off it
  for (const m of markers || []) { if (m.el < lo) lo = m.el; if (m.el > hi) hi = m.el; }
  const pad = Math.max(1, (hi - lo) * 0.12);
  return { lo: Math.floor(lo - pad), hi: Math.ceil(hi + pad) };
}

export function drawHorizonPanorama(canvas, data = {}) {
  const { horizon, tracks = [], markers = [], colours: overrides } = data;
  const host = canvas.parentElement || canvas;
  const cssWidth = host.clientWidth;
  if (!cssWidth) return false;               // hidden: nothing to measure

  const cssHeight = data.height || 220;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = "100%";
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const c = readColours(canvas, overrides);
  const plot = {
    x: PAD.left,
    y: PAD.top,
    w: cssWidth - PAD.left - PAD.right,
    h: cssHeight - PAD.top - PAD.bottom,
  };
  if (plot.w <= 0 || plot.h <= 0) return false;

  const { lo, hi } = elevationRange(horizon, tracks, markers);
  const xOf = (az) => plot.x + ((((az % 360) + 360) % 360) / 360) * plot.w;
  const yOf = (el) => plot.y + plot.h - ((el - lo) / (hi - lo)) * plot.h;

  // ── grid: compass points and elevation lines ────────────────────────────
  ctx.font = '11px "Open Sans", ui-sans-serif, sans-serif';
  ctx.fillStyle = c.muted;
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 1;

  for (const [az, label] of [[0, "N"], [90, "E"], [180, "S"], [270, "W"], [360, "N"]]) {
    const x = Math.round(plot.x + (az / 360) * plot.w) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, plot.y);
    ctx.lineTo(x, plot.y + plot.h);
    ctx.stroke();
    ctx.textAlign = az === 0 ? "left" : az === 360 ? "right" : "center";
    ctx.fillText(label, x, plot.y + plot.h + 16);
  }

  const step = Math.max(1, Math.ceil((hi - lo) / 6));
  ctx.textAlign = "right";
  for (let el = Math.ceil(lo / step) * step; el <= hi; el += step) {
    const y = Math.round(yOf(el)) + 0.5;
    ctx.strokeStyle = el === 0 ? c.muted : c.line;
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
    ctx.stroke();
    ctx.fillStyle = c.muted;
    ctx.fillText(`${el}°`, plot.x - 8, y + 4);
  }

  // ── terrain silhouette ──────────────────────────────────────────────────
  if (horizon?.values?.length) {
    const azStep = horizon.az_step_deg || (360 / horizon.values.length);
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.h);
    for (let px = 0; px <= plot.w; px++) {
      const az = (px / plot.w) * 360;
      ctx.lineTo(plot.x + px, yOf(horizonAtAzimuth(horizon.values, azStep, az)));
    }
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.closePath();
    ctx.fillStyle = c.surface;
    ctx.fill();
    ctx.strokeStyle = c.terrain;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ── tracks: one dot per sample, so gaps in azimuth do not become lines ──
  for (const track of tracks) {
    ctx.fillStyle = c[track.tone] || c.text;
    const n = track.points.length;
    track.points.forEach((p, k) => {
      if (track.fade) ctx.globalAlpha = 0.08 + 0.8 * ((k + 1) / n);   // S9: older = fainter
      const size = track.fade ? 2 : 1.5;
      ctx.fillRect(xOf(p.az) - size / 2, yOf(p.el) - size / 2, size, size);
    });
    ctx.globalAlpha = 1;
  }

  // ── markers for "now" ───────────────────────────────────────────────────
  for (const m of markers) {
    const x = xOf(m.az);
    const y = yOf(m.el);
    ctx.strokeStyle = c[m.tone] || c.text;
    ctx.fillStyle = c[m.tone] || c.text;
    ctx.lineWidth = 1;
    ctx.globalAlpha = m.blocked ? 0.35 : 1;          // S9: behind terrain → dimmed, dashed
    ctx.setLineDash(m.blocked ? [2, 2] : []);
    ctx.beginPath();
    ctx.arc(x, y, m.label ? 7 : 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, m.label ? 4 : 1.5, 0, Math.PI * 2);
    ctx.fill();
    if (m.label) {
      ctx.globalAlpha = 1;
      ctx.font = '11px "Open Sans", ui-sans-serif, sans-serif';
      ctx.textAlign = x > plot.x + plot.w - 110 ? "right" : "left";
      ctx.fillText(m.label, x + (ctx.textAlign === "right" ? -10 : 10), y - 8);
    }
    ctx.globalAlpha = 1;
  }

  return true;
}

export { TONES };

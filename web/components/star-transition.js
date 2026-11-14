/**
 * web/components/star-transition.js · Screen transitions (T2).
 * Standalone: no imports. Rewritten for D6/F1 against the D5 motion rules.
 *
 *   import { createStarTransition } from "./components/star-transition.js";
 *   const fx = createStarTransition(document.getElementById("transition"));
 *   await fx.play(swap, { x, y, star: true });   // the one Start moment
 *   await fx.play(swap);                         // every other screen change
 *
 * Two behaviours, both from design/style.md → Motion (D5):
 *
 *  · star: true  — only the first Start of a visit. One small star brightens
 *    at the button: at most ~15% of the viewport, peaking at 60% opacity,
 *    760 ms end to end, screens crossfading under it. No rings, no particles,
 *    no spikes. The caller is responsible for passing it only once.
 *  · default     — a plain 520 ms crossfade, inside the 400–700 ms rule.
 *
 * prefers-reduced-motion: the swap happens at once and nothing is drawn, and
 * the setting is re-read on every play so a change mid-visit is honoured.
 */

const CROSSFADE_MS = 520;
const STAR_MS = 760;
const STAR_SWAP_AT = 300;          // the crossfade starts here, under the star
const PEAK_OPACITY = 0.6;          // D5 ceiling
const VIEWPORT_SHARE = 0.15;       // D5 ceiling on how much it may light

const easeOut = (p) => 1 - Math.pow(1 - p, 3);

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || "").trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [236, 233, 226];
}

export function createStarTransition(root) {
  const canvas = document.createElement("canvas");
  canvas.className = "startx-canvas";
  canvas.setAttribute("aria-hidden", "true");
  root.classList.add("startx");
  root.setAttribute("aria-hidden", "true");
  root.append(canvas);

  const ctx = canvas.getContext("2d");
  let busy = false;
  let raf = 0;
  let timer = 0;
  let w = 0, h = 0, cx = 0, cy = 0, radius = 0;
  let tint = { text: [236, 233, 226], sun: [242, 179, 61] };

  const prefersReduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function size(origin) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    cx = origin && Number.isFinite(origin.x) ? origin.x : w / 2;
    cy = origin && Number.isFinite(origin.y) ? origin.y : h / 2;
    // the lit disc may cover at most VIEWPORT_SHARE of the viewport
    radius = Math.sqrt((w * h * VIEWPORT_SHARE) / Math.PI);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = getComputedStyle(root);
    tint = {
      text: hexToRgb(s.getPropertyValue("--text") || "#ECE9E2"),
      sun: hexToRgb(s.getPropertyValue("--sun") || "#F2B33D"),
    };
  }

  function rgba([r, g, b], a) {
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  }

  // One star: a --sun core inside a --text halo, brightening then fading.
  function drawStar(p) {
    ctx.clearRect(0, 0, w, h);
    const rise = Math.min(1, p / 0.42);
    const fall = p <= 0.42 ? 1 : Math.max(0, 1 - (p - 0.42) / 0.58);
    const alpha = PEAK_OPACITY * easeOut(rise) * fall;
    if (alpha <= 0.004) return;

    const r = radius * (0.35 + 0.65 * easeOut(rise));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba(tint.text, alpha));
    g.addColorStop(0.18, rgba(tint.sun, alpha * 0.8));
    g.addColorStop(0.55, rgba(tint.sun, alpha * 0.22));
    g.addColorStop(1, rgba(tint.sun, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function finish(resolve) {
    ctx.clearRect(0, 0, w, h);
    root.classList.remove("is-running");
    document.body.classList.remove("is-crossfading");
    raf = 0;
    busy = false;
    resolve();
  }

  function play(swap, options = {}) {
    if (prefersReduced() || busy) { swap?.(); return Promise.resolve(); }
    busy = true;

    // Every screen change crossfades; only Start adds the star.
    document.body.classList.add("is-crossfading");

    if (!options.star) {
      return new Promise((resolve) => {
        timer = setTimeout(() => {
          try { swap?.(); } catch (err) { console.error(err); }
          timer = setTimeout(() => finish(resolve), CROSSFADE_MS / 2);
        }, CROSSFADE_MS / 2);
      });
    }

    size(options);
    root.classList.add("is-running");

    return new Promise((resolve) => {
      const started = performance.now();
      let swapped = false;
      const step = (now) => {
        const elapsed = now - started;
        if (!swapped && elapsed >= STAR_SWAP_AT) {
          swapped = true;
          try { swap?.(); } catch (err) { console.error(err); }
        }
        drawStar(Math.min(1, elapsed / STAR_MS));
        if (elapsed < STAR_MS) raf = requestAnimationFrame(step);
        else { if (!swapped) swap?.(); finish(resolve); }
      };
      raf = requestAnimationFrame(step);
    });
  }

  return {
    play,
    get busy() { return busy; },
    destroy() {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      raf = 0;
      busy = false;
      root.classList.remove("startx", "is-running");
      document.body.classList.remove("is-crossfading");
      canvas.remove();
    },
  };
}

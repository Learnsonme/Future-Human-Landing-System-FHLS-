/**
 * web/components/starfield.js · W9 · Ambient starfield (T2).
 * Standalone: no imports. One canvas behind everything, pointer-events none.
 *
 *   import { createStarfield } from "./components/starfield.js";
 *   const sky = createStarfield(document.getElementById("sky"));
 *   sky.setDensity("beginner");   // landing | beginner | intermediate | advanced
 *   sky.destroy();
 *
 * Colours come from the --text, --muted and --sun tokens in scope, at low
 * alpha, so it stays inside design/style.md. The modes differ in how many
 * stars there are and how often they twinkle, never in hue.
 *
 * S13 (T3): slow left → right drift; frequent, visible landing shooting stars.
 * Budget: at most 150 stars, redrawn at 24fps, paused when the tab is hidden
 * and when prefers-reduced-motion is set (then it paints once and stops).
 */

const FPS = 24;
const FRAME_MS = 1000 / FPS;

// Stars per million CSS pixels, so a phone does not get a desktop's worth.
const DENSITY = {
  // the landing page is the arrival: it carries the fullest sky, whatever
  // mode is remembered, so the page does not look empty beside the viewer's
  // own starfield inside the Moon canvas
  // matches the viewer's own 3-D starfield (--muted, 1.1 px, no twinkle) so the
  // page sky and the sky inside the Moon canvas read as one continuous field
  landing:      { per1M: 230, twinkle: 0,    shootingEveryMs: 0,     maxR: 1.1, gain: 1.3, match: true },
  beginner:     { per1M: 150, twinkle: 0.55, shootingEveryMs: 0, maxR: 1.5, gain: 1.15 },
  intermediate: { per1M: 95,  twinkle: 0.35, shootingEveryMs: 0, maxR: 1.4, gain: 1 },
  advanced:     { per1M: 55,  twinkle: 0.18, shootingEveryMs: 0, maxR: 1.7, gain: 1.1 },
};
const MAX_STARS = 240;
// S13 (T3, user request): the whole field drifts slowly left → right (px per second, nearer stars a little
// faster), and landing shooting stars are more frequent and clearly visible.
const DRIFT_PX_S = [2.5, 7];
const SHOOT_EVERY_MS = [6000, 14000];
const SHOOT_TRAIL_PX = [70, 150];
const SHOOT_PEAK = 0.75;

const rand = (a, b) => a + Math.random() * (b - a);

export function createStarfield(canvas, options = {}) {
  const ctx = canvas.getContext("2d", { alpha: true });
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  let mode = options.density || "intermediate";
  let stars = [];
  let shooting = null;
  let nextShootingAt = performance.now() + rand(...SHOOT_EVERY_MS);
  let raf = 0;
  let lastFrame = 0;
  let width = 0, height = 0;
  let colours = { text: "#ECE9E2", muted: "#9A978F", sun: "#F2B33D" };
  let destroyed = false;

  function readColours() {
    const s = getComputedStyle(canvas);
    const pick = (n, f) => s.getPropertyValue(`--${n}`).trim() || f;
    colours = { text: pick("text", "#ECE9E2"), muted: pick("muted", "#9A978F"), sun: pick("sun", "#F2B33D") };
  }

  function makeStars() {
    const cfg = DENSITY[mode] || DENSITY.intermediate;
    const wanted = Math.min(MAX_STARS, Math.round((width * height / 1e6) * cfg.per1M));
    const match = !!cfg.match;
    stars = Array.from({ length: Math.max(0, wanted) }, () => {
      const depth = Math.random();            // 0 far, 1 near — drives size and brightness
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        // the viewer draws every star the same size, with no attenuation
        r: match ? cfg.maxR : rand(0.4, cfg.maxR) * (0.5 + depth * 0.5),
        base: match
          ? rand(0.5, 0.85)
          : Math.min(0.85, rand(0.10, 0.42) * (0.45 + depth * 0.55) * (cfg.gain || 1)),
        // a share of stars twinkle; the rest are steady, so it never pulses in sync
        twinkles: Math.random() < cfg.twinkle,
        speed: rand(0.00018, 0.0009),
        phase: Math.random() * Math.PI * 2,
        // the viewer's field is a single token, so matched skies have no warm star
        warm: match ? false : Math.random() < 0.08,
        muted: match,
        vx: rand(...DRIFT_PX_S) * (0.6 + depth * 0.4),
      };
    });
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);   // 3x on phones is wasted here
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    if (!width || !height) return false;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    readColours();
    makeStars();
    return true;
  }

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [236, 233, 226];
  }

  function paint(t) {
    ctx.clearRect(0, 0, width, height);
    const [tr, tg, tb] = hexToRgb(colours.text);
    const [sr, sg, sb] = hexToRgb(colours.sun);
    const [mr, mg, mb] = hexToRgb(colours.muted);

    for (const s of stars) {
      let alpha = s.base;
      if (s.twinkles && !reduced.matches) {
        // slow sine, offset per star, so brightness drifts rather than blinks
        alpha = s.base * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(s.phase + t * s.speed)));
      }
      const [r, g, b] = s.muted ? [mr, mg, mb] : s.warm ? [sr, sg, sb] : [tr, tg, tb];
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
      // S13: slow drift to the right, wrapping at the edge (t = 0 under reduced motion → still)
      const x = width ? (((s.x + s.vx * t / 1000) % width) + width) % width : s.x;
      ctx.beginPath();
      ctx.arc(x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (shooting && canShoot()) {
      ctx.save();
      // P8: keep the trail in empty sky, outside every text/control area.
      const canvasRect = canvas.getBoundingClientRect();
      for (const node of document.querySelectorAll("#screen-landing h1, #screen-landing h2, #screen-landing h3, #screen-landing p, #screen-landing button, #screen-landing dl, #screen-landing .stats-ticker")) {
        const r = node.getBoundingClientRect(); if (!r.width || !r.height) continue;
        const mask = new Path2D(); mask.rect(0, 0, width, height);
        mask.rect(r.left - canvasRect.left - 8, r.top - canvasRect.top - 8, r.width + 16, r.height + 16);
        ctx.clip(mask, "evenodd");
      }
      const p = (t - shooting.start) / shooting.life;
      if (p >= 1) {
        shooting = null;
      } else {
        const fade = Math.sin(Math.PI * p);            // in and out, no hard edges
        const x = shooting.x + shooting.dx * p;
        const y = shooting.y + shooting.dy * p;
        const len = Math.hypot(shooting.dx, shooting.dy);
        const tx = x - shooting.dx / len * shooting.trail, ty = y - shooting.dy / len * shooting.trail;
        const grad = ctx.createLinearGradient(x, y, tx, ty);
        grad.addColorStop(0, `rgba(${tr},${tg},${tb},${(SHOOT_PEAK * fade).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${tr},${tg},${tb},0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        // a small bright head
        ctx.fillStyle = `rgba(${tr},${tg},${tb},${(Math.min(1, SHOOT_PEAK + 0.15) * fade).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, 1.3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  function canShoot() {
    return mode === "landing" && (document.body.dataset.screen || "landing") === "landing" && !reduced.matches;
  }
  function maybeShoot(t) {
    if (!canShoot() || shooting || t < nextShootingAt) return;
    nextShootingAt = t + rand(...SHOOT_EVERY_MS);
    // S13: mostly left → right and slightly downward, matching the drift
    const angle = rand(0.12, 0.6), distance = rand(260, 460);
    shooting = { start: t, life: rand(900, 1400), trail: rand(...SHOOT_TRAIL_PX),
      x: rand(0.05, 0.6) * width, y: rand(0.05, 0.7) * height,
      dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance };
  }

  function frame(t) {
    if (destroyed || document.hidden || reduced.matches) {
      raf = 0;
      if (!destroyed && !document.hidden) paint(0);
      return;
    }
    raf = requestAnimationFrame(frame);
    if (t - lastFrame < FRAME_MS) return;      // throttle: the globe needs the frames more
    lastFrame = t;
    maybeShoot(t);
    paint(t);
  }

  function start() {
    if (destroyed || raf || document.hidden) return;
    if (reduced.matches) { paint(0); return; }   // one static sky, no loop
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  const resetShooting = () => { shooting = null; nextShootingAt = performance.now() + rand(...SHOOT_EVERY_MS); };
  const onVisibility = () => { resetShooting(); document.hidden ? stop() : start(); };
  const onReducedChange = () => { resetShooting(); stop(); start(); };

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (resize()) paint(performance.now()); }, 200);
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("resize", onResize);
  reduced.addEventListener?.("change", onReducedChange);

  if (resize()) start();

  return {
    setDensity(next) {
      if (!DENSITY[next] || next === mode) return;
      mode = next;
      resetShooting();
      makeStars();
      if (reduced.matches) paint(0);
    },
    get mode() { return mode; },
    get starCount() { return stars.length; },
    getDiagnostics() { return { mode, shooting: !!shooting && canShoot(), nextShootingAt, trail: shooting?.trail || 0, running: !!raf, frameMs: FRAME_MS }; },
    destroy() {
      destroyed = true;
      stop();
      clearTimeout(resizeTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      reduced.removeEventListener?.("change", onReducedChange);
      ctx.clearRect(0, 0, width, height);
    },
  };
}

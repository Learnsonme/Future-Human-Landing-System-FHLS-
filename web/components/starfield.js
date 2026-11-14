/**
 * web/components/starfield.js · W9 · Ambient starfield (T2).
 * Standalone: no imports. One canvas behind everything, pointer-events none.
 *
 *   import { createStarfield } from "./components/starfield.js";
 *   const sky = createStarfield(document.getElementById("sky"));
 *   sky.setDensity("beginner");   // beginner | intermediate | advanced
 *   sky.destroy();
 *
 * Colours come from the --text, --muted and --sun tokens in scope, at low
 * alpha, so it stays inside design/style.md. The modes differ in how many
 * stars there are and how often they twinkle, never in hue.
 *
 * Budget: at most 150 stars, redrawn at 24fps, paused when the tab is hidden
 * and when prefers-reduced-motion is set (then it paints once and stops).
 */

const FPS = 24;
const FRAME_MS = 1000 / FPS;

// Stars per million CSS pixels, so a phone does not get a desktop's worth.
const DENSITY = {
  beginner:     { per1M: 150, twinkle: 0.55, shootingEveryMs: 22000, maxR: 1.5 },
  intermediate: { per1M: 95,  twinkle: 0.35, shootingEveryMs: 45000, maxR: 1.4 },
  advanced:     { per1M: 55,  twinkle: 0.18, shootingEveryMs: 90000, maxR: 1.7 },
};
const MAX_STARS = 150;

const rand = (a, b) => a + Math.random() * (b - a);

export function createStarfield(canvas, options = {}) {
  const ctx = canvas.getContext("2d", { alpha: true });
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  let mode = options.density || "intermediate";
  let stars = [];
  let shooting = null;
  let nextShootingAt = 0;
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
    stars = Array.from({ length: Math.max(0, wanted) }, () => {
      const depth = Math.random();            // 0 far, 1 near — drives size and brightness
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        r: rand(0.4, cfg.maxR) * (0.5 + depth * 0.5),
        base: rand(0.10, 0.42) * (0.45 + depth * 0.55),
        // a share of stars twinkle; the rest are steady, so it never pulses in sync
        twinkles: Math.random() < cfg.twinkle,
        speed: rand(0.00018, 0.0009),
        phase: Math.random() * Math.PI * 2,
        // one in twelve is a warm star, the only colour variation
        warm: Math.random() < 0.08,
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

    for (const s of stars) {
      let alpha = s.base;
      if (s.twinkles && !reduced.matches) {
        // slow sine, offset per star, so brightness drifts rather than blinks
        alpha = s.base * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(s.phase + t * s.speed)));
      }
      const [r, g, b] = s.warm ? [sr, sg, sb] : [tr, tg, tb];
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (shooting) {
      const p = (t - shooting.start) / shooting.life;
      if (p >= 1) {
        shooting = null;
      } else {
        const fade = Math.sin(Math.PI * p);            // in and out, no hard edges
        const x = shooting.x + shooting.dx * p;
        const y = shooting.y + shooting.dy * p;
        const grad = ctx.createLinearGradient(x, y, x - shooting.dx * 0.08, y - shooting.dy * 0.08);
        grad.addColorStop(0, `rgba(${tr},${tg},${tb},${(0.5 * fade).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${tr},${tg},${tb},0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - shooting.dx * 0.08, y - shooting.dy * 0.08);
        ctx.stroke();
      }
    }
  }

  function maybeShoot(t) {
    if (reduced.matches || shooting || t < nextShootingAt) return;
    const cfg = DENSITY[mode] || DENSITY.intermediate;
    nextShootingAt = t + cfg.shootingEveryMs * rand(0.6, 1.8);
    const fromLeft = Math.random() < 0.5;
    shooting = {
      start: t,
      life: rand(700, 1100),
      x: fromLeft ? rand(-0.1, 0.3) * width : rand(0.7, 1.1) * width,
      y: rand(0, 0.45) * height,
      dx: (fromLeft ? 1 : -1) * rand(0.25, 0.45) * width,
      dy: rand(0.12, 0.3) * height,
    };
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (t - lastFrame < FRAME_MS) return;      // throttle: the globe needs the frames more
    lastFrame = t;
    maybeShoot(t);
    paint(t);
  }

  function start() {
    if (destroyed || raf) return;
    if (reduced.matches) { paint(0); return; }   // one static sky, no loop
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  const onVisibility = () => (document.hidden ? stop() : start());
  const onReducedChange = () => { stop(); start(); };

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
      makeStars();
      if (reduced.matches) paint(0);
    },
    get mode() { return mode; },
    get starCount() { return stars.length; },
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

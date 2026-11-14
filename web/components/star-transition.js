/**
 * web/components/star-transition.js · W9 · Supernova screen transition (T2).
 * Standalone: no imports. A star collapses, detonates across the whole screen
 * with a shockwave, light spikes and an ember burst, then fades to the next screen.
 *
 *   import { createStarTransition } from "./components/star-transition.js";
 *   const fx = createStarTransition(document.getElementById("transition"));
 *   await fx.play(() => showTheNextScreen(), { x, y });   // origin: the click
 *
 * ~1150 ms: the star collapses first, infalling matter streaming into the point
 * you clicked, then detonates there. The screen is swapped at 440 ms, under the
 * brightest part of the flash.
 * One canvas, drawn only while running and cleared after, so it costs nothing
 * at rest. Only --text and --sun are used: --earth and --both carry meaning
 * elsewhere in the app and must not be spent on decoration.
 * prefers-reduced-motion: the swap runs immediately and nothing is drawn.
 */

const TOTAL_MS = 1150;
const SWAP_MS = 440;      // under the brightest part of the flash
const COLLAPSE_END = 0.26;   // of the run: infall, then the pinpoint
const BLAST = 0.30;          // detonation
const EMBERS = 72;
const SPIKES = 14;
const INFALL = 54;

const rand = (a, b) => a + Math.random() * (b - a);
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeIn = (p) => p * p;

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || "").trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [236, 233, 226];
}

export function createStarTransition(root) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const canvas = document.createElement("canvas");
  canvas.className = "startx-canvas";
  canvas.setAttribute("aria-hidden", "true");
  root.classList.add("startx");
  root.setAttribute("aria-hidden", "true");
  root.append(canvas);

  const ctx = canvas.getContext("2d");
  let busy = false;
  let raf = 0;
  let w = 0, h = 0, cx = 0, cy = 0, maxR = 0;
  let embers = [];
  let spikes = [];
  let infall = [];
  let tint = { text: [236, 233, 226], sun: [242, 179, 61] };

  function size(origin) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    cx = origin && Number.isFinite(origin.x) ? origin.x : w / 2;
    cy = origin && Number.isFinite(origin.y) ? origin.y : h / 2;
    // far enough to clear the screen from wherever the click was
    maxR = Math.max(
      Math.hypot(cx, cy), Math.hypot(w - cx, cy),
      Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy),
    );
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = getComputedStyle(root);
    tint = {
      text: hexToRgb(s.getPropertyValue("--text") || "#ECE9E2"),
      sun: hexToRgb(s.getPropertyValue("--sun") || "#F2B33D"),
    };
  }

  function seed() {
    embers = Array.from({ length: EMBERS }, () => ({
      angle: Math.random() * Math.PI * 2,
      // a spread of speeds so the shell has depth instead of one clean circle
      speed: rand(0.35, 1.05),
      size: rand(0.8, 2.4),
      warm: Math.random() < 0.45,
      lag: rand(0, 0.12),
      trail: rand(18, 70),
    }));
    infall = Array.from({ length: INFALL }, () => ({
      angle: Math.random() * Math.PI * 2,
      from: rand(0.3, 1.0),        // fraction of maxR it falls in from
      lag: rand(0, 0.45),          // of the collapse, so it streams rather than snaps
      size: rand(0.6, 1.8),
      warm: Math.random() < 0.35,
      trail: rand(26, 90),
    }));
    spikes = Array.from({ length: SPIKES }, (_, i) => ({
      angle: (i / SPIKES) * Math.PI * 2 + rand(-0.12, 0.12),
      len: rand(0.5, 1.1),
      width: rand(0.8, 2.2),
      warm: i % 3 === 0,
    }));
  }

  function rgba([r, g, b], a) {
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  }

  function draw(p) {
    ctx.clearRect(0, 0, w, h);

    // ── 0 · the collapse: matter streaming into the point ───────────────
    if (p < BLAST) {
      const cp = Math.min(1, p / COLLAPSE_END);
      for (const f of infall) {
        const fp = Math.min(1, Math.max(0, (cp - f.lag) / (1 - f.lag)));
        if (fp <= 0) continue;
        const r = (1 - easeIn(fp)) * maxR * f.from;     // accelerating inward
        const x = cx + Math.cos(f.angle) * r;
        const y = cy + Math.sin(f.angle) * r;
        const alpha = Math.min(1, fp * 1.6) * 0.75;
        const colour = f.warm ? tint.sun : tint.text;
        const bx = cx + Math.cos(f.angle) * (r + f.trail);
        const by = cy + Math.sin(f.angle) * (r + f.trail);
        const g = ctx.createLinearGradient(x, y, bx, by);
        g.addColorStop(0, rgba(colour, alpha));
        g.addColorStop(1, rgba(colour, 0));
        ctx.strokeStyle = g;
        ctx.lineWidth = f.size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }

    // ── 1 · the pinpoint, then the flash ────────────────────────────────
    // it tightens to almost nothing before it goes, which sells the blast
    const coreR = p < BLAST
      ? Math.max(1.5, 22 * (1 - easeIn(p / BLAST)))
      : 1.5 + easeOut((p - BLAST) / 0.22) * 150;
    const coreAlpha = p < BLAST
      ? 0.55 + 0.45 * easeIn(p / BLAST)
      : Math.max(0, 1 - (p - BLAST) / 0.5);

    if (coreAlpha > 0.01) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, coreR));
      g.addColorStop(0, rgba(tint.text, coreAlpha));
      g.addColorStop(0.35, rgba(tint.sun, coreAlpha * 0.55));
      g.addColorStop(1, rgba(tint.sun, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, coreR), 0, Math.PI * 2);
      ctx.fill();
    }

    // full-screen wash, brightest right as the screens swap
    const fp = (p - BLAST) / 0.14;
    const flash = p < BLAST ? 0
      : fp < 1 ? easeOut(fp) * 0.46
      : Math.max(0, 0.46 * (1 - (p - BLAST - 0.14) / 0.42));
    if (flash > 0.004) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      g.addColorStop(0, rgba(tint.text, flash));
      g.addColorStop(0.45, rgba(tint.sun, flash * 0.3));
      g.addColorStop(1, rgba(tint.sun, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // ── 2 · light spikes ────────────────────────────────────────────────
    if (p > BLAST && p < 0.82) {
      const sp = (p - BLAST) / 0.52;
      const alpha = Math.sin(Math.PI * sp) * 0.5;
      for (const s of spikes) {
        const len = easeOut(sp) * maxR * s.len;
        const x = cx + Math.cos(s.angle) * len;
        const y = cy + Math.sin(s.angle) * len;
        const g = ctx.createLinearGradient(cx, cy, x, y);
        g.addColorStop(0, rgba(s.warm ? tint.sun : tint.text, alpha));
        g.addColorStop(1, rgba(s.warm ? tint.sun : tint.text, 0));
        ctx.strokeStyle = g;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }

    // ── 3 · shockwave, two rings so the edge is not a single hard line ──
    for (const [delay, colour, weight] of [[BLAST, tint.text, 2.4], [BLAST + 0.07, tint.sun, 1.4]]) {
      if (p <= delay) continue;
      const rp = Math.min(1, (p - delay) / 0.62);
      const r = easeOut(rp) * maxR * 1.25;
      const alpha = (1 - rp) * 0.55;
      if (alpha <= 0.01 || r <= 0) continue;
      ctx.strokeStyle = rgba(colour, alpha);
      ctx.lineWidth = weight * (1 - rp * 0.6);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ── 4 · embers thrown clear of the blast ────────────────────────────
    if (p > BLAST) {
      for (const e of embers) {
        const ep = Math.max(0, (p - BLAST - e.lag) / (0.78 - e.lag));
        if (ep <= 0 || ep >= 1) continue;
        const r = easeOut(ep) * maxR * e.speed * 1.2;
        const x = cx + Math.cos(e.angle) * r;
        const y = cy + Math.sin(e.angle) * r;
        const alpha = (1 - ep) * 0.85;
        const colour = e.warm ? tint.sun : tint.text;

        const tx = cx + Math.cos(e.angle) * Math.max(0, r - e.trail);
        const ty = cy + Math.sin(e.angle) * Math.max(0, r - e.trail);
        const g = ctx.createLinearGradient(x, y, tx, ty);
        g.addColorStop(0, rgba(colour, alpha));
        g.addColorStop(1, rgba(colour, 0));
        ctx.strokeStyle = g;
        ctx.lineWidth = e.size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        ctx.fillStyle = rgba(colour, alpha);
        ctx.beginPath();
        ctx.arc(x, y, e.size * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function play(swap, origin) {
    if (reduced.matches || busy) { swap?.(); return Promise.resolve(); }
    busy = true;
    size(origin);
    seed();
    root.classList.add("is-running");

    return new Promise((resolve) => {
      const started = performance.now();
      let swapped = false;

      const step = (now) => {
        const p = Math.min(1, (now - started) / TOTAL_MS);
        if (!swapped && now - started >= SWAP_MS) {
          swapped = true;
          try { swap?.(); } catch (err) { console.error(err); }
        }
        draw(p);
        if (p < 1) {
          raf = requestAnimationFrame(step);
        } else {
          ctx.clearRect(0, 0, w, h);
          root.classList.remove("is-running");
          raf = 0;
          busy = false;
          if (!swapped) swap?.();
          resolve();
        }
      };
      raf = requestAnimationFrame(step);
    });
  }

  return {
    play,
    get busy() { return busy; },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      root.classList.remove("startx", "is-running");
      canvas.remove();
    },
  };
}

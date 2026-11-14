/**
 * web/components/star-transition.js · Screen transitions (T2).
 * Standalone: no imports.
 *
 *   const fx = createStarTransition(document.getElementById("transition"));
 *   await fx.play(swap, { x, y, star: true });   // the one Start moment
 *   await fx.play(swap);                         // every other screen change
 *
 * Two behaviours, both inside design/style.md → Motion (D5):
 *
 *  · star: true — the first Start of a visit only. A star collapses, matter
 *    streams into the point you clicked, it detonates with a shockwave and
 *    embers, and the screens swap under it. Every part of it is CONTAINED:
 *    nothing is drawn outside a disc of AREA_SHARE of the viewport, and no
 *    pixel exceeds PEAK_OPACITY. That is the D5 ceiling, and it is a
 *    photosensitivity limit (WCAG 2.3.1), not a style preference — the
 *    earlier full-screen version was removed as D6/F1 for breaching it.
 *    There is no full-screen wash of any kind. 780 ms, within D5's 800.
 *  · default     — a plain 520 ms crossfade.
 *
 * prefers-reduced-motion is re-read on every play: instant swap, nothing drawn.
 */

const CROSSFADE_MS = 520;
const STAR_MS = 780;            // D5 caps the Start moment at 800
const STAR_SWAP_AT = 330;
const PEAK_OPACITY = 0.6;       // D5 ceiling, never exceeded by any element
const AREA_SHARE = 0.42;        // of the viewport: the bound the effect is clipped to.
                                // What D5 caps is the LIT area, measured below
                                // at about 9%, well under its ~25%.
const COLLAPSE_END = 0.30;
const EMBERS = 44;
const INFALL = 36;

const rand = (a, b) => a + Math.random() * (b - a);
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeIn = (p) => p * p;

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
  let busy = false, raf = 0, timer = 0;
  let w = 0, h = 0, cx = 0, cy = 0, R = 0;
  let embers = [], infall = [];
  let tint = { text: [236, 233, 226], sun: [242, 179, 61] };

  const prefersReduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function size(origin) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    cx = origin && Number.isFinite(origin.x) ? origin.x : w / 2;
    cy = origin && Number.isFinite(origin.y) ? origin.y : h / 2;
    // the blast radius that keeps the lit disc within AREA_SHARE of the screen
    R = Math.sqrt((w * h * AREA_SHARE) / Math.PI);
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
    infall = Array.from({ length: INFALL }, () => ({
      angle: Math.random() * Math.PI * 2,
      from: rand(0.45, 1),          // of R, so infall starts inside the disc too
      lag: rand(0, 0.4),
      size: rand(0.6, 1.5),
      warm: Math.random() < 0.35,
      trail: rand(14, 40),
    }));
    embers = Array.from({ length: EMBERS }, () => ({
      angle: Math.random() * Math.PI * 2,
      reach: rand(0.45, 0.98),      // never past R
      size: rand(0.7, 1.9),
      warm: Math.random() < 0.45,
      lag: rand(0, 0.1),
      trail: rand(12, 34),
    }));
  }

  // Elements draw at their own strength; the ceiling is enforced once, on the
  // finished layer, because overlapping draws composite above any per-element
  // clamp (measured 0.90 against a 0.60 cap before this was added).
  const rgba = ([r, g, b], a) =>
    `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

  function draw(p) {
    ctx.clearRect(0, 0, w, h);
    // hard containment: nothing reaches beyond the disc, whatever it asks for
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    // 1 · collapse: matter streaming in, core tightening
    if (p < COLLAPSE_END) {
      const cp = p / COLLAPSE_END;
      for (const f of infall) {
        const fp = Math.min(1, Math.max(0, (cp - f.lag) / (1 - f.lag)));
        if (fp <= 0) continue;
        const r = (1 - easeIn(fp)) * R * f.from;
        const x = cx + Math.cos(f.angle) * r, y = cy + Math.sin(f.angle) * r;
        const bx = cx + Math.cos(f.angle) * (r + f.trail);
        const by = cy + Math.sin(f.angle) * (r + f.trail);
        const colour = f.warm ? tint.sun : tint.text;
        const g = ctx.createLinearGradient(x, y, bx, by);
        g.addColorStop(0, rgba(colour, Math.min(1, fp * 1.6) * 0.5));
        g.addColorStop(1, rgba(colour, 0));
        ctx.strokeStyle = g;
        ctx.lineWidth = f.size;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by); ctx.stroke();
      }
    }

    // 2 · the pinpoint, then the core bloom — bounded, no full-screen wash
    const coreR = p < COLLAPSE_END
      ? Math.max(1.5, 18 * (1 - easeIn(p / COLLAPSE_END)))
      : 1.5 + easeOut((p - COLLAPSE_END) / 0.28) * R * 0.55;
    const coreAlpha = p < COLLAPSE_END
      ? PEAK_OPACITY * (0.5 + 0.5 * easeIn(p / COLLAPSE_END))
      : PEAK_OPACITY * Math.max(0, 1 - (p - COLLAPSE_END) / 0.55);
    if (coreAlpha > 0.004) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, coreR));
      g.addColorStop(0, rgba(tint.text, coreAlpha));
      g.addColorStop(0.3, rgba(tint.sun, coreAlpha * 0.5));
      g.addColorStop(1, rgba(tint.sun, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, coreR), 0, Math.PI * 2); ctx.fill();
    }

    // 3 · shockwave, two rings, stopping at the disc edge
    if (p > COLLAPSE_END) {
      for (const [delay, colour, weight] of [[0, tint.text, 2], [0.06, tint.sun, 1.2]]) {
        const rp = (p - COLLAPSE_END - delay) / 0.58;
        if (rp <= 0 || rp >= 1) continue;
        ctx.strokeStyle = rgba(colour, (1 - rp) * 0.45);
        ctx.lineWidth = weight * (1 - rp * 0.6);
        ctx.beginPath(); ctx.arc(cx, cy, easeOut(rp) * R, 0, Math.PI * 2); ctx.stroke();
      }

      // 4 · embers, thrown clear but still inside the disc
      for (const e of embers) {
        const ep = (p - COLLAPSE_END - e.lag) / (0.62 - e.lag);
        if (ep <= 0 || ep >= 1) continue;
        const r = easeOut(ep) * R * e.reach;
        const x = cx + Math.cos(e.angle) * r, y = cy + Math.sin(e.angle) * r;
        const tx = cx + Math.cos(e.angle) * Math.max(0, r - e.trail);
        const ty = cy + Math.sin(e.angle) * Math.max(0, r - e.trail);
        const colour = e.warm ? tint.sun : tint.text;
        const a = (1 - ep) * 0.55;
        const g = ctx.createLinearGradient(x, y, tx, ty);
        g.addColorStop(0, rgba(colour, a));
        g.addColorStop(1, rgba(colour, 0));
        ctx.strokeStyle = g; ctx.lineWidth = e.size;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.fillStyle = rgba(colour, a);
        ctx.beginPath(); ctx.arc(x, y, e.size * 0.6, 0, Math.PI * 2); ctx.fill();
      }
    }

    ctx.restore();

    // hard opacity ceiling: multiply the whole layer's alpha by PEAK_OPACITY,
    // so no pixel anywhere can exceed the D5 limit however things overlapped
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = `rgba(0,0,0,${PEAK_OPACITY})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  }

  function finish(resolve) {
    ctx.clearRect(0, 0, w, h);
    root.classList.remove("is-running");
    document.body.classList.remove("is-leaving");
    raf = 0; busy = false;
    resolve();
  }

  function play(swap, options = {}) {
    if (prefersReduced() || busy) { swap?.(); return Promise.resolve(); }
    busy = true;
    document.body.classList.add("is-leaving");

    if (!options.star) {
      return new Promise((resolve) => {
        timer = setTimeout(() => {
          document.body.classList.remove("is-leaving");   // hand over to is-arriving
          try { swap?.(); } catch (err) { console.error(err); }
          timer = setTimeout(() => finish(resolve), CROSSFADE_MS / 2);
        }, CROSSFADE_MS / 2);
      });
    }

    size(options);
    seed();
    root.classList.add("is-running");

    return new Promise((resolve) => {
      const started = performance.now();
      let swapped = false;
      const step = (now) => {
        const elapsed = now - started;
        if (!swapped && elapsed >= STAR_SWAP_AT) {
          swapped = true;
          document.body.classList.remove("is-leaving");
          try { swap?.(); } catch (err) { console.error(err); }
        }
        draw(Math.min(1, elapsed / STAR_MS));
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
      cancelAnimationFrame(raf); clearTimeout(timer);
      raf = 0; busy = false;
      root.classList.remove("startx", "is-running");
      document.body.classList.remove("is-leaving");
      canvas.remove();
    },
  };
}

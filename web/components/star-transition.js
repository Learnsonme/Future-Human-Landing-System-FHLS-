/**
 * web/components/star-transition.js · W9 · Screen transition (T2).
 * Standalone: no imports. A star brightens in the centre, a few sparks scatter,
 * the next screen appears behind it.
 *
 *   import { createStarTransition } from "./components/star-transition.js";
 *   const fx = createStarTransition(document.getElementById("transition"));
 *   await fx.play(() => showTheNextScreen());   // swap runs at the brightest point
 *
 * ~700 ms total, 12 spark elements built once and reused. Honours
 * prefers-reduced-motion by running the swap immediately and drawing nothing.
 * Colours are the --text and --sun tokens, so it stays inside design/style.md.
 */

const SPARKS = 12;
const HALF_MS = 320;        // swap happens here, at peak brightness
const TOTAL_MS = 700;

export function createStarTransition(root) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let busy = false;

  root.classList.add("startx");
  root.setAttribute("aria-hidden", "true");

  const core = document.createElement("span");
  core.className = "startx-core";
  root.append(core);

  // built once, reused every time: no DOM churn per navigation
  const sparks = Array.from({ length: SPARKS }, (_, i) => {
    const s = document.createElement("span");
    s.className = "startx-spark";
    const angle = (i / SPARKS) * 360 + (i % 2 ? 7 : -7);
    s.style.setProperty("--angle", `${angle}deg`);
    s.style.setProperty("--reach", `${52 + (i % 4) * 18}px`);
    root.append(s);
    return s;
  });

  function play(swap) {
    if (reduced.matches) { swap?.(); return Promise.resolve(); }
    if (busy) { swap?.(); return Promise.resolve(); }
    busy = true;

    root.classList.add("is-running");
    // restart the CSS animations cleanly
    void root.offsetWidth;

    return new Promise((resolve) => {
      const atPeak = setTimeout(() => { try { swap?.(); } catch (e) { console.error(e); } }, HALF_MS);
      const atEnd = setTimeout(() => {
        root.classList.remove("is-running");
        busy = false;
        resolve();
      }, TOTAL_MS);
      root._timers = [atPeak, atEnd];
    });
  }

  return {
    play,
    get busy() { return busy; },
    destroy() {
      for (const t of root._timers || []) clearTimeout(t);
      root.classList.remove("startx", "is-running");
      core.remove();
      for (const s of sparks) s.remove();
    },
  };
}

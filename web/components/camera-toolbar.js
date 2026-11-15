// P12 · Camera toolbar above the 3D view (T3): Back · Overview · Clear selection · Start.
//   const bar = mountCameraToolbar(stageCol, beforeEl, { onClear, onStart });
//   bar.attach(viewer)   // after each createViewer; attach(null) before dispose
// Keyboard (explorer screen, not while typing): Esc = Clear selection (or leave full screen), O = Overview.
// P13: a Full screen button (Fullscreen API on the stage, fixed-layer fallback, ✕ / Esc to exit).
// Sits in its own row above the stage, so it never covers the Moon, the MAP panel or Look at Sun/Earth.
const ICONS = {
  back: '<path d="M10 4 5 9l5 5M5.5 9H15"/>',
  overview: '<circle cx="9" cy="9" r="6.2"/><path d="M2.8 9h12.4M9 2.8c-2.2 2-2.2 10.4 0 12.4M9 2.8c2.2 2 2.2 10.4 0 12.4"/>',
  clear: '<path d="m5 5 8 8M13 5l-8 8"/>',
  start: '<path d="M3 8.5 9 3.5l6 5M4.8 7.2V14.5h8.4V7.2"/>',
  full: '<path d="M3 7V3h4M11 3h4v4M15 11v4h-4M7 15H3v-4"/>',
  // S23 (T2): ranked list — three bars, tallest first.
  rank: '<path d="M3 4.5h9M3 9h6M3 13.5h3"/><path d="M15.2 11.5v4"/><circle cx="15.2" cy="8.4" r="1.5"/>',
};
const CSS = `.cam-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 8px}
.cam-btn{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:6px 10px;font:500 12px/1 var(--sans,sans-serif);
  letter-spacing:.02em;color:var(--text,#ECE9E2);background:var(--surface,#1E1E1E);border:1px solid var(--line,#2E2E2E);cursor:pointer;
  transition:border-color .2s var(--ease,ease),color .2s var(--ease,ease)}
.cam-btn svg{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.cam-btn:hover{border-color:var(--muted,#9A978F)}
.cam-btn:focus-visible{outline:2px solid var(--sun,#F2B33D);outline-offset:2px}
.cam-btn:disabled{opacity:.45;cursor:default;border-color:var(--line,#2E2E2E)}
.cam-btn kbd{font:inherit;color:var(--muted,#9A978F)}
.cam-bar .cam-spacer{flex:1}
@media (max-width:768px){.cam-bar{gap:4px;padding:0 8px}.cam-btn{min-width:44px;min-height:44px;justify-content:center;padding:6px}
  .cam-btn .cam-label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}}`;

export function mountCameraToolbar(parent, before, { onClear, onStart, onLeaderboard } = {}) {
  if (!document.querySelector("style[data-cam-bar]")) {
    const st = document.createElement("style"); st.dataset.camBar = ""; st.textContent = CSS; document.head.append(st);
  }
  const bar = document.createElement("div"); bar.className = "cam-bar"; bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "Camera");
  const make = (key, label, tip, shortcut) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "cam-btn"; b.dataset.cam = key;
    b.title = shortcut ? `${tip} (${shortcut})` : tip;
    if (shortcut) b.setAttribute("aria-keyshortcuts", shortcut === "Esc" ? "Escape" : shortcut);
    b.innerHTML = `<svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">${ICONS[key]}</svg><span class="cam-label">${label}</span>`;
    return b;
  };
  const backBtn = make("back", "Back", "Go back to the previous view");
  const overBtn = make("overview", "Overview", "Zoom out to the whole Moon", "O");
  const clearBtn = make("clear", "Clear selection", "Remove the lander and forget this point", "Esc");
  const spacer = document.createElement("span"); spacer.className = "cam-spacer";
  const startBtn = make("start", "Start", "Back to the start screen");
  const fullBtn = make("full", "Full screen", "Show the 3D view full screen");
  bar.append(backBtn, overBtn, clearBtn, fullBtn, spacer, startBtn);
  // S23 (T2): the leaderboard sits next to Full screen, only when a handler is given.
  let rankBtn = null;
  if (onLeaderboard) {
    rankBtn = make("rank", "Best sites", "See the top 5 landing sites");
    rankBtn.setAttribute("aria-expanded", "false");
    fullBtn.after(rankBtn);
    rankBtn.addEventListener("click", () => onLeaderboard(rankBtn));
  }
  parent.insertBefore(bar, before);

  // P13 · full screen for the 3D view: Fullscreen API, else a fixed full-viewport layer. ✕ or Esc exits.
  const stage = before;
  const exitBtn = make("clear", "Exit full screen", "Exit full screen", "Esc"); exitBtn.classList.add("fs-exit");
  stage.append(exitBtn);
  const isFull = () => document.fullscreenElement === stage || stage.classList.contains("is-fullscreen");
  const syncFull = () => { fullBtn.setAttribute("aria-pressed", String(isFull())); };
  async function enterFull() {
    try { if (stage.requestFullscreen) { await stage.requestFullscreen(); return syncFull(); } } catch { /* not allowed: fall back */ }
    stage.classList.add("is-fullscreen"); document.documentElement.style.overflow = "hidden"; syncFull(); exitBtn.focus();
  }
  function exitFull() {
    if (document.fullscreenElement === stage) document.exitFullscreen?.().catch(() => {});
    stage.classList.remove("is-fullscreen"); document.documentElement.style.overflow = ""; syncFull();
  }
  fullBtn.addEventListener("click", () => (isFull() ? exitFull() : enterFull()));
  exitBtn.addEventListener("click", exitFull);
  document.addEventListener("fullscreenchange", syncFull);

  let viewer = null, unstatus = null;
  const live = () => viewer && !viewer.getDiagnostics?.().disposed;
  const sync = () => { backBtn.disabled = !live() || !viewer.canGoBack?.(); };
  const overview = () => { if (live()) viewer.flyOverview?.().catch(() => {}); };
  const clear = () => { onClear?.(); if (live()) viewer.clearSelection?.(); };
  backBtn.addEventListener("click", () => { if (live()) viewer.back?.().then(sync, sync); });
  overBtn.addEventListener("click", overview);
  clearBtn.addEventListener("click", clear);
  startBtn.addEventListener("click", () => onStart?.());

  document.addEventListener("keydown", (e) => {
    if (document.body.dataset.screen !== "app" || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName));
    if (typing && t.type !== "range") return;
    if (e.key === "Escape") { if (stage.classList.contains("is-fullscreen")) exitFull(); else clear(); }
    else if ((e.key === "o" || e.key === "O") && !typing) { e.preventDefault(); overview(); }
  });

  return {
    attach(next) {
      unstatus?.(); unstatus = null; viewer = next;
      if (!next && isFull()) exitFull();
      if (viewer) unstatus = viewer.onStatus(sync);
      sync();
    },
    element: bar,
  };
}

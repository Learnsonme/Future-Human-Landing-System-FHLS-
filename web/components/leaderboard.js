// S23 (T2) · Landing-site leaderboard: the top 5 of the candidate sites, ranked on real engine output.
//
//   const board = createLeaderboard({ core, sites, onPick });
//   board.toggle(anchorButton);   // open under the button, or close if already open
//   board.close();
//
// Only the Artemis candidate regions are ranked — the 7 sites actually in the running.
// Ranking all 26 is misleading: the 6 Apollo sites sit near the equator, where the Sun is up
// about half the time and Earth never sets, so they take every top place with ~14.8-day windows
// and 100% Earth contact. They are in the data as historical reference points, with the craters
// and the test point, not as places anyone is choosing between.
//
// Ranking rule, stated in the panel so nobody has to guess it:
//   1. share of 2027–2028 with BOTH sunlight and Earth in view — conditions over the whole period
//   2. ties broken on the longest unbroken run with both
// Both numbers come straight from core.analyze(); nothing is modelled here. Because the best
// conditions and the single longest window can disagree, the panel also names the site with the
// longest unbroken run whenever that is not the one ranked first.
//
// The ranking is computed once on first open (7 sites x ~10 ms) and cached for the session.
import { bestWindows } from "./best-dates.js";

const CSS = `.lb-panel{position:absolute;z-index:40;width:min(560px,calc(100vw - 32px));max-height:min(70vh,520px);overflow:auto;
  background:var(--surface,#1E1E1E);border:1px solid var(--line,#2E2E2E);padding:14px 16px 12px;
  font:400 13px/1.45 var(--sans,sans-serif);color:var(--text,#ECE9E2);box-shadow:0 10px 30px rgb(0 0 0 / .28)}
.lb-panel[hidden]{display:none}
.lb-head{display:flex;align-items:baseline;gap:10px;margin:0 0 2px}
.lb-head h3{margin:0;font:600 13px/1.2 var(--sans,sans-serif);letter-spacing:.06em;text-transform:uppercase}
.lb-close{margin-left:auto;min-width:44px;min-height:32px;background:none;border:1px solid var(--line,#2E2E2E);
  color:var(--muted,#9A978F);font:inherit;cursor:pointer}
.lb-close:hover{color:var(--text,#ECE9E2);border-color:var(--muted,#9A978F)}
.lb-close:focus-visible{outline:2px solid var(--sun,#F2B33D);outline-offset:2px}
.lb-rule{margin:0 0 10px;color:var(--muted,#9A978F);font-size:12px}
.lb-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.lb-row{display:grid;grid-template-columns:auto 1fr auto;gap:4px 12px;align-items:baseline;width:100%;text-align:left;
  padding:8px 10px;background:none;border:1px solid var(--line,#2E2E2E);color:inherit;font:inherit;cursor:pointer;
  transition:border-color .2s var(--ease,ease)}
.lb-row:hover{border-color:var(--muted,#9A978F)}
.lb-row:focus-visible{outline:2px solid var(--sun,#F2B33D);outline-offset:2px}
.lb-row[aria-current="true"]{border-color:var(--sun,#F2B33D)}
.lb-rank{font:600 15px/1 var(--mono,monospace);color:var(--sun,#F2B33D);min-width:1.4em}
.lb-name{font-weight:600}
.lb-days{font:600 13px/1 var(--mono,monospace);white-space:nowrap}
.lb-meta{grid-column:2/4;color:var(--muted,#9A978F);font-size:12px;font-variant-numeric:tabular-nums}
.lb-note{margin:10px 0 0;color:var(--muted,#9A978F);font-size:12px}
.lb-status{margin:6px 0 0;color:var(--muted,#9A978F)}
@media (max-width:768px){.lb-panel{width:calc(100vw - 16px);padding:12px}.lb-row{min-height:44px}}`;

const days = h => (h / 24).toFixed(1);

export function createLeaderboard({ core, sites, onPick }) {
  if (!document.querySelector("style[data-lb]")) {
    const st = document.createElement("style"); st.dataset.lb = ""; st.textContent = CSS; document.head.append(st);
  }

  const panel = document.createElement("div");
  panel.className = "lb-panel"; panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Best landing sites");
  panel.innerHTML =
    `<div class="lb-head"><h3>Best landing sites</h3>` +
    `<button type="button" class="lb-close">Close</button></div>` +
    `<p class="lb-rule">The Artemis candidate regions, ranked on conditions over the whole period: the share of ` +
    `2027–2028 with both sunlight and Earth in view. Ties go to the longer unbroken run. ` +
    `Apollo sites and craters are left out: near the equator Earth never sets, so they would take every place.</p>` +
    `<p class="lb-status">Working through the candidate sites…</p>`;

  let ranking = null, pending = null, anchor = null, lastFocus = null;

  // One pass over every candidate site. analyze() is ~10 ms, so 26 sites is well under a second,
  // but it is still yielded between sites so the 3D view keeps its frames.
  // The sites actually in the running. If the data ever stops marking them, rank everything
  // rather than show an empty board.
  const candidates = (() => {
    const picked = sites.filter(s => String(s.type || "").startsWith("artemis_candidate_region"));
    return picked.length >= 2 ? picked : sites;
  })();

  async function rank() {
    const rows = [];
    for (const site of candidates) {
      let result;
      try { result = await core.analyze(site.lat, site.lon); } catch { continue; }
      const { ranked, kind, neverSunlit } = bestWindows(result, 1);
      const best = kind === "both" ? ranked[0] : null;
      rows.push({
        site,
        hours: best ? best.hours : 0,
        pctBoth: result.summary.pct_both,
        pctSunlit: result.summary.pct_sunlit,
        darkHours: result.summary.longest_dark_hours,
        neverSunlit,
        noEarth: kind !== "both",
      });
      await new Promise(r => setTimeout(r, 0));
    }
    rows.sort((a, b) => b.pctBoth - a.pctBoth || b.hours - a.hours);
    return rows.slice(0, 5);
  }

  function render(rows) {
    panel.querySelector(".lb-status")?.remove();
    panel.querySelector(".lb-list")?.remove();
    panel.querySelector(".lb-note")?.remove();

    const list = document.createElement("ol");
    list.className = "lb-list";
    rows.forEach((row, i) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button"; b.className = "lb-row";
      const why = row.neverSunlit ? "never sunlit here"
        : row.noEarth ? "no Earth contact; sunlight only"
        : `longest unbroken run ${days(row.hours)} days`;
      b.innerHTML =
        `<span class="lb-rank">${i + 1}</span>` +
        `<span class="lb-name"></span>` +
        `<span class="lb-days">${row.pctBoth.toFixed(1)}%</span>` +
        `<span class="lb-meta">of 2027–2028 with both · ${row.pctSunlit.toFixed(1)}% sunlit · ` +
        `${why} · longest blackout ${days(row.darkHours)} days</span>`;
      b.querySelector(".lb-name").textContent = row.site.name;
      b.addEventListener("click", () => { close({ keepFocus: true }); onPick?.(row.site); });
      li.append(b); list.append(li);
    });
    panel.append(list);

    // The best conditions overall and the single longest window need not be the same site.
    // Say so plainly rather than letting rank 1 speak for both.
    const byWindow = [...rows].sort((a, b) => b.hours - a.hours)[0];
    if (byWindow && rows[0] && byWindow.site !== rows[0].site) {
      const alt = document.createElement("p");
      alt.className = "lb-note";
      alt.textContent = `Best conditions overall are at ${rows[0].site.name}, but the single longest window is ` +
        `${byWindow.site.name}'s: ${days(byWindow.hours)} days unbroken, against ${days(rows[0].hours)}.`;
      panel.append(alt);
    }

    const note = document.createElement("p");
    note.className = "lb-note";
    note.textContent = "Sunlight and Earth in view only. This is not a guarantee of power, a radio link, " +
      "or a safe landing — slope, boulders and temperature are not in this ranking.";
    panel.append(note);
  }

  // Open under the button, or above it when the viewport has no room below — otherwise the panel
  // runs off the bottom of a short window and collides with the fixed theme toggle.
  function place() {
    if (!anchor) return;
    const host = panel.offsetParent || document.body;
    const a = anchor.getBoundingClientRect(), h = host.getBoundingClientRect();
    const gap = 6, ph = panel.offsetHeight;
    const below = innerHeight - a.bottom - gap, above = a.top - gap;
    const flip = ph > below && above > below;
    let top = flip ? a.top - h.top - gap - ph : a.bottom - h.top + gap;
    // keep it on screen even when neither side fits
    const minTop = gap - h.top, maxTop = innerHeight - gap - ph - h.top;
    top = Math.max(minTop, Math.min(top, Math.max(minTop, maxTop)));
    panel.style.top = `${top}px`;
    const left = Math.max(0, Math.min(a.left - h.left, host.clientWidth - panel.offsetWidth));
    panel.style.left = `${left}px`;
  }

  const onDocDown = e => { if (!panel.hidden && !panel.contains(e.target) && e.target !== anchor && !anchor?.contains(e.target)) close(); };
  const onKey = e => {
    if (panel.hidden || e.key !== "Escape") return;
    e.stopPropagation();          // Esc closes the board, not the selection or full screen
    e.preventDefault();
    close();
  };

  function open(button) {
    anchor = button;
    lastFocus = document.activeElement;
    if (!panel.parentElement) {
      const host = button.closest(".stage-col, .app-grid, main") || document.body;
      host.append(panel);
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
    }
    panel.hidden = false;
    anchor.setAttribute("aria-expanded", "true");
    place();
    panel.querySelector(".lb-close").focus();
    addEventListener("resize", place);
    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);

    if (ranking) { render(ranking); place(); return; }
    pending ||= rank().then(rows => { ranking = rows; pending = null; return rows; });
    pending.then(rows => { if (!panel.hidden) { render(rows); place(); } });
  }

  // Dismissing the board puts focus back on the button that opened it, the way a popover should.
  // Picking a site passes keepFocus, because the app moves focus into the results itself.
  function close({ keepFocus = false } = {}) {
    if (panel.hidden) return;
    const returnTo = anchor;
    panel.hidden = true;
    anchor?.setAttribute("aria-expanded", "false");
    removeEventListener("resize", place);
    document.removeEventListener("pointerdown", onDocDown, true);
    document.removeEventListener("keydown", onKey, true);
    if (keepFocus) return;
    if (returnTo?.isConnected) returnTo.focus();
    else if (lastFocus?.isConnected) lastFocus.focus();
  }

  panel.querySelector(".lb-close").addEventListener("click", () => close());

  return {
    toggle(button) { panel.hidden ? open(button) : close(); },
    close,
    get isOpen() { return !panel.hidden; },
    element: panel,
  };
}

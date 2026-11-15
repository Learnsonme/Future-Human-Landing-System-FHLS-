# Home navigation: acceptance checklist (H3)

Use this to check H1 (T1, viewer) and H2 (T2, web) against the spec in `design/style.md` → "Navigation: Home".
Tick each box only after seeing it work in a real browser. Record any failure in LOG.md as `@T1` or `@T2`, with the row number.

Automated screenshots: `node design/review/walkthrough.mjs <outdir> [url]` walks landing → modes → app → site in desktop and phone sizes. It needs Chrome.

## A. Placement and wording
- [x] A1 · Explorer app bar shows **HOME** as its first item, in all three modes, before and after a site is picked.
- [x] A2 · Mode picker shows **HOME** top-left. **Back** still returns to the screen that opened the picker.
- [x] A3 · At phone width (390 px) HOME stays in the first row, unwrapped, with a touch target of at least 44 × 44 px.
- [x] A4 · The accessible name is "Home: back to the start screen" (check in DevTools → Accessibility).

## B. Round trips (each with Beginner, Intermediate and Advanced)
| # | Path | Expect |
|---|---|---|
| B1 | Landing → Start → mode → explorer → **HOME** | Landing shows, and the Moon renders **and rotates** |
| B2 | …then Start → same mode | Explorer returns with the same site, date, hour and pins |
| B3 | Explorer with a site → **HOME** → Start → **different** mode | Same site, date and pins, and the panel is re-rendered for the new mode |
| B4 | Mode picker (opened from the explorer) → **HOME** | Landing. Start then leads back to the explorer with its state kept |
| B5 | Click a site, then press **HOME during the fly-to** | The flight stops at once. No camera moves after the return, and the next fly-to works |
| B6 | Repeat B1 → B2 **five times** | Exactly one viewer canvas and one starfield canvas (`document.querySelectorAll('canvas').length` stays the same), no console errors, no fps drop |

## C. Keyboard and focus
- [x] C1 · Using the keyboard only: Tab reaches HOME first in the app bar, and Enter activates it.
- [x] C2 · After each screen change, focus is on the new screen's heading, and a screen reader announces it.
- [x] C3 · Coming back to the explorer, focus returns to the control that left it.
- [x] C4 · The focus ring is visible on every control (2 px `--sun`), and nothing is hidden behind the starfield.
- [x] C5 · Escape inside the date field still closes its picker and does not navigate.

## D. Reduced motion (DevTools → Rendering → `prefers-reduced-motion: reduce`)
- [ ] D1 · HOME swaps screens instantly, with no star transition.
- [ ] D2 · The landing Moon is static. The starfield is painted once, with no twinkle and no shooting stars.
- [ ] D3 · A fly-to is an instant cut (or a ≤ 150 ms fade). Pressing HOME during it behaves as in B5.

## E. Layouts
- [x] E1 · Desktop 1440 × 900: the whole of section B passes.
- [x] E2 · Phone 390 × 844: B1, B2 and B5 pass. HOME is never covered by the Netlify badge or the date field.

## Result
| Date | Reviewer | Build (commit) | Failures (row → owner) |
|---|---|---|---|
| 2026-11-14 | T3 (Claude), automated `design/review/check_home.mjs` + screenshots | main @ c65dacc | **none: 15/15 pass** |
| 2026-11-15 | T2 (Claude), by hand in Chrome | main @ f062200 | **none: 17/17 checked pass.** D1–D3 not run: no reduced-motion emulation available on this machine |

**What was checked automatically:**
- **A1–A4:** HOME is first in the app bar in all 3 modes, before and after picking a site. It's on the mode picker, and has the correct accessible name. On a phone it's in the first row, at 50 × 44 px.
- **B1:** HOME returns to the landing screen, and the Moon renders and rotates again (43% of its pixels change over 2.5 s).
- **B2:** site and date are kept after a round trip.
- **B5:** HOME during a fly-to lands cleanly, and the next fly-to works.
- **B6:** after 5 round trips there are still 5 canvases, so no leaks.
- **C2:** focus moves to the landing heading.
- **D1:** with reduced motion the screen swap is instant (1 ms).
- **Console:** no errors.

**T2's run on 2026-11-15 (main @ f062200), by hand in Chrome against `python3 -m http.server`.** Re-run because the 14 Nov pass predates the landing sections, Open Sans, the lander, the camera toolbar, the loading screen, the theme toggle and the exact-time controls.
- **A1–A4 pass.** HOME is the first app-bar item in all three modes, before and after picking a site; it is on the picker with **Back** intact; at 390 px the bar is a single 77 px row with HOME leftmost at 57 × 44 px and nothing wrapped below it; the accessible name is exact.
- **B1–B6 pass.** After HOME the Moon renders and rotates (6 frames / 2.37 km of camera travel over 12 s). Site, hour (set to 5000) and a pin survive a same-mode round trip and a change to a different mode. HOME during a fly-to cancels it: the explorer viewer is disposed, the landing camera only drifts 0.92 km (its own rotation), and the next fly-to starts and places the lander. Five round trips: `canvas` count stays at 5, state intact.
- **C1–C5 pass.** HOME is the first tabbable in the bar at `tabIndex 0`; focus lands on `landing-title`, `modes-title` and `app-title` on first entry; leaving via **Change mode** returns focus to `change-mode`; a real Tab gives `2px solid #8A5A00` (`--sun`) with `:focus-visible`; Escape in the date field leaves the screen, hour, selection and lander untouched.
- **E1–E2 pass.** Section B passes at 1440 × 900 and B1/B2/B5 at 390 × 844, with no horizontal overflow at either size. HOME is hit at all three of its corners; the only fixed element over it is `#transition` at `pointer-events: none`, and there is no longer a Netlify badge (the site is on GitHub Pages).
- **Zero console errors** throughout. The one caught `error` event is Chrome's benign `ResizeObserver loop completed with undelivered notifications`, which does not reach the console.
- **D1–D3 not run.** The browser pane cannot emulate `prefers-reduced-motion`, and changing the machine's system setting was out of scope. The implementation was read instead and is correct: `star-transition.js` re-reads the query on every `play()`, `viewer/index.js:498` sets `controls.autoRotate = !started && !reduced.matches`, flights take `duration: 0.001` with an immediate `finishFlight()` (lines 276, 324, 427), and a live `change` listener (line 501) cancels a running flight and fade. **@T1 @T3 one of you please run D1–D3 with DevTools → Rendering before the freeze.**

**Not automated, check by hand once:**
- C3: focus returns to the control that left the explorer.
- C5: Escape inside the date field.
- D2/D3: a static Moon and a fly-to cut under reduced motion.
- A screen reader announcing the screen change.

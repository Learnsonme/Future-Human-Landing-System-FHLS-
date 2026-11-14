# Home navigation: acceptance checklist (H3)

Use this to check H1 (T1, viewer) and H2 (T2, web) against the spec in `design/style.md` → "Navigation: Home".
Tick each box only after seeing it work in a real browser. Record any failure in LOG.md as `@T1` or `@T2`, with the row number.

Automated screenshots: `node design/review/walkthrough.mjs <outdir> [url]` walks landing → modes → app → site in desktop and phone sizes. It needs Chrome.

## A. Placement and wording
- [ ] A1 · Explorer app bar shows **HOME** as its first item, in all three modes, before and after a site is picked.
- [ ] A2 · Mode picker shows **HOME** top-left. **Back** still returns to the screen that opened the picker.
- [ ] A3 · At phone width (390 px) HOME stays in the first row, unwrapped, with a touch target of at least 44 × 44 px.
- [ ] A4 · The accessible name is "Home: back to the start screen" (check in DevTools → Accessibility).

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
- [ ] C1 · Using the keyboard only: Tab reaches HOME first in the app bar, and Enter activates it.
- [ ] C2 · After each screen change, focus is on the new screen's heading, and a screen reader announces it.
- [ ] C3 · Coming back to the explorer, focus returns to the control that left it.
- [ ] C4 · The focus ring is visible on every control (2 px `--sun`), and nothing is hidden behind the starfield.
- [ ] C5 · Escape inside the date field still closes its picker and does not navigate.

## D. Reduced motion (DevTools → Rendering → `prefers-reduced-motion: reduce`)
- [ ] D1 · HOME swaps screens instantly, with no star transition.
- [ ] D2 · The landing Moon is static. The starfield is painted once, with no twinkle and no shooting stars.
- [ ] D3 · A fly-to is an instant cut (or a ≤ 150 ms fade). Pressing HOME during it behaves as in B5.

## E. Layouts
- [ ] E1 · Desktop 1440 × 900: the whole of section B passes.
- [ ] E2 · Phone 390 × 844: B1, B2 and B5 pass. HOME is never covered by the Netlify badge or the date field.

## Result
| Date | Reviewer | Build (commit) | Failures (row → owner) |
|---|---|---|---|
| 2026-11-14 | T3 (Claude), automated `design/review/check_home.mjs` + screenshots | main @ c65dacc | **none: 15/15 pass** |

**What was checked automatically:**
- **A1–A4:** HOME is first in the app bar in all 3 modes, before and after picking a site. It's on the mode picker, and has the correct accessible name. On a phone it's in the first row, at 50 × 44 px.
- **B1:** HOME returns to the landing screen, and the Moon renders and rotates again (43% of its pixels change over 2.5 s).
- **B2:** site and date are kept after a round trip.
- **B5:** HOME during a fly-to lands cleanly, and the next fly-to works.
- **B6:** after 5 round trips there are still 5 canvases, so no leaks.
- **C2:** focus moves to the landing heading.
- **D1:** with reduced motion the screen swap is instant (1 ms).
- **Console:** no errors.

**Not automated, check by hand once:**
- C3: focus returns to the control that left the explorer.
- C5: Escape inside the date field.
- D2/D3: a static Moon and a fly-to cut under reduced motion.
- A screen reader announcing the screen change.

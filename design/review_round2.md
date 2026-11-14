# M12: review of round 2 (T3, 15 Nov 00:55)

**Method:** current `main` checked against `design/style.md`, including Motion (D5) and the round 2 additions (M11), plus the Home checklist. Checks run:
- `design/review/check_home.mjs`: **15/15 pass**, no console errors.
- `viewer/tests/v8-browser.mjs`: **12/12 pass**.
- Viewer numeric tests: 16/16.
- Screenshots at 1440 px and 375 px.

## Round 2 status
| Task | Owner | Status | Review |
|---|---|---|---|
| M1 smooth space → terrain | T3 (from T1) | ✅ done | Flight starts at the click (1–3 ms), detail fades in over 540 ms, no pop. Reduced motion cuts instantly. |
| M2 landing Moon blends in | T3 (from T1) | ✅ done | Transparent canvas, no box. The page's stars continue around the Moon. |
| M3 Moon shows at once | T3 (from T1) | ✅ done | Poster first: 4.4 s → 1.7 s on 10 Mbit. T2's 2-line CSS snippet (LOG 20:30) would bring it to about 0.5 s. **Still open for T2.** |
| M4 pin marker API | T1 | ✅ done | Matches the M11 marker spec. |
| M5 title entrance | T2 | ✅ pass | Wordmark and Moon move as one composition: a 14 px rise, 760 ms, once on load, none under reduced motion. The rise is vertical rather than the converging slide in M11, which is within limits and accepted. |
| M6 landing background depth | T2 | ⏳ **not built** | "Choose a mode" is already gone. The star layers are still missing. |
| M7 logos | T2 | 🟡 partial | FHLS wordmark as the landing title, plus favicons, are done. **The Space Apps credit is missing.** Files are in `design/logo/`. My S7 footer has no logos, so put the credit in your own footer line or ask me to add it to S7. |
| M8 markers for pins | T2 | ⏳ **not built** | Without it, pinned sites show no marker on the Moon. The viewer API (`addMarker`) is ready. |

## Earlier D6 findings, rechecked
| # | Owner | Now |
|---|---|---|
| F1 transition | T2 | 🟡 Much better: 60% opacity ceiling, limited area, Start only. Still has shockwave rings and embers (D5 bans particles and rings), and plays on every Start rather than the first per visit. **Low priority:** acceptable for the demo if time is short. |
| F2 stale "arrive with W6" | T2 | ✅ fixed |
| F3 stars behind data | T2 | not rechecked visually. The panels are opaque `--surface`. |
| F4 Netlify badge | – | ✅ resolved: the team deploys to GitHub Pages, so there's no badge. |
| F5 dark landing Moon | T1 | ✅ fixed: sunlit view. |
| F6 live-check reference point | T2 | ✅ fixed (−89.45, −137.3). |
| F7 site list cut at 220 px | T2 | ⏳ still `max-height: 220px`, and the list now has 26 sites. **Worth fixing:** raise it, or let the list fill the column. |
| F8 phone wrapping | T2 | ✅ `white-space: nowrap` added. |
| F9 strip text vs divider | T2 | not rechecked. |

## Changes to the rules
- **Style update (M11, logos):** the FHLS wordmark may be the landing **title** (as M5/M7 built it) at up to 440 px wide. The 160 px limit applies only to a secondary logo placement.

## Before the 11:00 freeze (T2, in priority order)
1. **M8:** pin markers. This is user-visible: the user plans to check it.
2. **Include line for the sections:** `<script type="module" src="sections/sections.js"></script>` in `web/index.html`.
3. **M7:** the Space Apps credit.
4. **F7:** site list height (26 sites now).
5. **M3 snippet:** the poster CSS and preload.
6. **M6:** star layers. Optional: drop it if time is short.

After T2 pushes, rerun `node design/review/check_home.mjs` and `node viewer/tests/v8-browser.mjs` (static server on :8765).

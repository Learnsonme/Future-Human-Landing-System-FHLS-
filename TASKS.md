# Task board
`[ ]` = free · `[~]` = in progress (claimed by …, time) · `[x]` = done.
Cycle: pull → claim → push → work → tick → log → push.

## Must work (core product)
### Engine + core (T3 + Claude)
- [x] E0 · T3 · SPICE installed and tested (test_spice.py)
- [x] E1 · T3 · Ephemeris table 2027–2028 hourly → `data/ephemeris.*` (push a synthetic version in hour 1)
- [x] E2 · T3 · Download LOLA south polar DEMs; reproject/check
- [x] E3 · T3 · Horizon algorithm (near = fine DEM, far = coarse DEM, curvature correction); test on Shackleton
- [x] E4 · T3 · **Start long run Saturday morning:** `south_2km` grid → `data/horizon/` (all CPU cores)
- [x] E5 · T3 · Terrain tiles (16-bit PNG) for the viewer → `data/terrain/` (**by Sat 12:00 for T1**)
- [x] E6 · T3 · `data/sites.json` with NASA's Artemis candidate landing regions (announced for Artemis III; first landing now Artemis IV, 2028)
- [x] C1 · T3 · `core/fhls-core.js`: az/el, grid lookup, blocked?, power/comms, summaries
- [x] E7 · T3 · Validate vs PGDA illumination maps; write accuracy notes
- [x] E8 · T3 · `global_coarse` horizon grid (whole Moon, low precision)
- [x] E9 · T3 · `south_fine` grids over Artemis candidate regions

### Viewer (T1 + Claude Code) · **all done by Saturday evening**
- [x] V1 · T1 · Spinning globe (three.js) with CGI Moon Kit colour + displacement; starfield; Start button
- [x] V2 · T1 · Drag to rotate, scroll/pinch to zoom; click returns lat/lon (event for web/)
- [x] V3 · T1 · Fly-to animation to the clicked point
- [x] V4 · T1 · South pole terrain mesh from `data/terrain/` tiles: real cliffs, slight vertical exaggeration option
- [x] V5 · T1 · Light the scene with the real Sun direction for a given time (from core), long shadows
- [x] V6 · T1 · Clean API for web: `viewer.flyTo(lat, lon)`, `viewer.setTime(t)`, `onPick(cb)`; document in `viewer/README.md`

- [x] V7 · T1 · Restore the real rotating Moon on the home screen; verify Start/mode flow

### Web (T2 + Codex)
- [x] W1 · T2 · App shell, Start → mode picker (Beginner / Intermediate / Advanced)
- [x] W2 · T2 · Embed viewer; on click call core and show results panel
- [x] W3 · T2 · Results panel per mode (real data — synthetic never needed)
- [x] W4 · T2 · Date slider (2027–2028) + timeline strip (power/comms colour bands)
- [x] W5 · T2 · Horizon panorama chart (Intermediate): standalone component in web/components/
- [x] W6 · T2 · Advanced: hour table + CSV export
- [x] W7 · T2 · Deployed — live on Netlify: https://futurehumanlandingsystem.netlify.app/web/
- [x] W8 · T2 · "Lower precision" label outside the south polar region
- [x] W9 · T2 · Atmosphere pass: starfield, star page transition, shooting stars, micro-interactions — all within `design/style.md` tokens

### Design & pitch (T3 + Claude)
- [x] D0 · T3 · `design/style.md`
- [x] D1 · T3 · Beginner-mode wording and icons
- [x] D2 · T3 · Logo assets (transparent PNG, square icon)
- [~] D3 · T3 · Demo story + video (by Sun 12:30) (claimed by T3, 12:10; script done, video to record Sun AM)
- [x] D4 · T3 · Project page text + AI-use disclosure
- [ ] D5 · T3 · **Motion section for `design/style.md`** (W9 is built and waiting on it): what may animate and what must not, durations and easings, how star density and brightness should differ between Beginner / Intermediate / Advanced, and the reduced-motion rule.
- [ ] D6 · T3 · Anti-generic-AI review of the deployed site against `design/style.md` before the Sunday 11:00 freeze: https://futurehumanlandingsystem.netlify.app/web/ — you wrote the rules, so you should be the one to rule on the atmosphere pass.

## Rule for "(open to T1)" tasks
T1 may claim these **only after V1–V6 are done**, and only if they can finish them **before leaving on Saturday**. Unfinished at departure → set back to `[ ]` with a LOG.md note so T2 can take over. Build them as standalone components in `web/components/` with a short usage note.

## Optional (only when everything above works)
- [x] O1 · T2 · Pin up to 3 spots and compare side by side
- [ ] O2 · T1/T2 · Higher-res terrain tiles near Artemis regions

## Sunday
- 11:00 feature freeze · 12:30 video + page ready · 13:15 submitted · 13:30 deadline · 14:00 judging (ask for an early slot)

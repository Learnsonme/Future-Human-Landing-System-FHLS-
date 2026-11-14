# Task board
`[ ]` = free · `[~]` = in progress (claimed by …, time) · `[x]` = done.
Cycle: pull → claim → push → work → tick → log → push.

## Must work (core product)
### Engine + core (T3 + Claude)
- [x] E0 · T3 · SPICE installed and tested (test_spice.py)
- [x] E1 · T3 · Ephemeris table 2027–2028 hourly → `data/ephemeris.*` (push a synthetic version in hour 1)
- [x] E2 · T3 · Download LOLA south polar DEMs; reproject/check
- [~] E3 · T3 · Horizon algorithm (near = fine DEM, far = coarse DEM, curvature correction); test on Shackleton (claimed by T3, 09:08)
- [~] E4 · T3 · **Start long run Saturday morning:** `south_2km` grid → `data/horizon/` (all CPU cores) (claimed by T3, 09:08)
- [x] E5 · T3 · Terrain tiles (16-bit PNG) for the viewer → `data/terrain/` (**by Sat 12:00 for T1**)
- [ ] E6 · T3 · `data/sites.json` with NASA's Artemis candidate landing regions (announced for Artemis III; first landing now Artemis IV, 2028)
- [ ] C1 · T3 · `core/fhls-core.js`: az/el, grid lookup, blocked?, power/comms, summaries
- [ ] E7 · T3 · Validate vs PGDA illumination maps; write accuracy notes
- [ ] E8 · T3 · `global_coarse` horizon grid (whole Moon, low precision)
- [ ] E9 · T3 · `south_fine` grids over Artemis candidate regions

### Viewer (T1 + Claude Code) · **all done by Saturday evening**
- [ ] V1 · T1 · Spinning globe (three.js) with CGI Moon Kit colour + displacement; starfield; Start button
- [ ] V2 · T1 · Drag to rotate, scroll/pinch to zoom; click returns lat/lon (event for web/)
- [ ] V3 · T1 · Fly-to animation to the clicked point
- [ ] V4 · T1 · South pole terrain mesh from `data/terrain/` tiles: real cliffs, slight vertical exaggeration option
- [ ] V5 · T1 · Light the scene with the real Sun direction for a given time (from core), long shadows
- [ ] V6 · T1 · Clean API for web: `viewer.flyTo(lat, lon)`, `viewer.setTime(t)`, `onPick(cb)`; document in `viewer/README.md`

### Web (T2 + Codex)
- [~] W1 · T2 · App shell, Start → mode picker (Beginner / Intermediate / Advanced) (claimed by T2, 22:46)
- [ ] W2 · T2 · Embed viewer; on click call core and show results panel
- [ ] W3 · T2 · Results panel per mode (use synthetic data until real data lands)
- [ ] W4 · T2 · Date slider (2027–2028) + timeline strip (power/comms colour bands)
- [ ] W5 · T2 · Horizon panorama chart (Intermediate) (open to T1): standalone component, input = horizon array + Sun/Earth tracks
- [ ] W6 · T2 · Advanced: hour table + CSV export (open to T1)
- [ ] W7 · T2 · Deploy to GitHub Pages (placeholder live in hour 1)
- [ ] W8 · T2 · "Lower precision" label outside the south polar region

### Design & pitch (T3 + Claude)
- [x] D0 · T3 · `design/style.md`
- [ ] D1 · T3 · Beginner-mode wording and icons
- [ ] D2 · T3 · Logo assets (transparent PNG, square icon)
- [ ] D3 · T3 · Demo story + video (by Sun 12:30)
- [ ] D4 · T3 · Project page text + AI-use disclosure

## Rule for "(open to T1)" tasks
T1 may claim these **only after V1–V6 are done**, and only if they can finish them **before leaving on Saturday**. Unfinished at departure → set back to `[ ]` with a LOG.md note so T2 can take over. Build them as standalone components in `web/components/` with a short usage note.

## Optional (only when everything above works)
- [ ] O1 · T2 · Pin up to 3 spots and compare side by side
- [ ] O2 · T1/T2 · Higher-res terrain tiles near Artemis regions

## Sunday
- 11:00 feature freeze · 12:30 video + page ready · 13:15 submitted · 13:30 deadline · 14:00 judging (ask for an early slot)

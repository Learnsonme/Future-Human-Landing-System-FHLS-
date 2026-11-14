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
- [x] D5 · T3 · **Motion section for `design/style.md`** (W9 is built and waiting on it): what may animate and what must not, durations and easings, how star density and brightness should differ between Beginner / Intermediate / Advanced, and the reduced-motion rule.
- [x] D6 · T3 · Anti-generic-AI review of the deployed site against `design/style.md` before the Sunday 11:00 freeze: https://futurehumanlandingsystem.netlify.app/web/ — you wrote the rules, so you should be the one to rule on the atmosphere pass.

## Rule for "(open to T1)" tasks
T1 may claim these **only after V1–V6 are done**, and only if they can finish them **before leaving on Saturday**. Unfinished at departure → set back to `[ ]` with a LOG.md note so T2 can take over. Build them as standalone components in `web/components/` with a short usage note.

## Return to Home · shared equally across the three teammates
Users must have a clear **Home** choice after choosing Beginner / Intermediate / Advanced and after selecting a lunar site. Home returns to the landing screen with its rotating Moon, without reloading the page. Keep the selected mode, site, date and comparison pins in memory when navigating away.

One work package per teammate; each edits only their owned folder and claims their item before starting:

- [x] H1 · T1 · **Viewer lifecycle and regression checks** (`viewer/`): verify/fix site → Home → Start → site round trips, including a return during a fly-to. The home Moon must render and rotate again, reduced motion must be respected, and repeated navigation must not create duplicate canvases or leave stale flights running. Wait for the actual screen transition in browser checks.
- [x] H2 · T2 · **Home control and navigation** (`web/`): add a clearly labeled Home button to the mode picker and persistent app header, available in all three modes before and after site selection. Wire it through the existing screen/transition flow, preserve mode/site/date/pins, and keep Start → mode → explorer working after returning home.
- [x] H3 · T3 · **Design, accessibility and acceptance review** (`design/`): specify Home placement, wording, focus and keyboard behavior within `design/style.md`; record a checklist covering every mode, a selected site, desktop/mobile layouts, keyboard navigation and reduced motion. Review T1/T2's finished behavior and record findings for the responsible owner in LOG.md.

Done when H1–H3 are verified, Home is visible and usable after both mode and site selection in every mode, and the round trip restores the home Moon without losing the current exploration state.

## Optional (only when everything above works)
- [x] O1 · T2 · Pin up to 3 spots and compare side by side
- [x] O2 · T3 · Higher-res terrain tiles near Artemis regions (reassigned from T1 to T3 at the user’s request; unclaimed)
- [x] E10 · T3 · Whole-Moon horizon grid 4× sharper: `global_fine` (0.25° ≈ 7.5 km, from LOLA LDEM_64 474 m), tiled + lazy-loaded
- [x] E11 · T3 · North pole at south-pole quality: `north_2km` horizon grid + `data/terrain/` north tiles (LOLA LDEM_80N_40M)
- [x] C2 · T3 · `core/fhls-core.js`: use north polar grids + tiled `global_fine` automatically
- [x] V8 · T3 · **Viewer: load the new detailed terrain.** (a) North pole tiles: `data/terrain/index_north.json`. (b) **Whole Moon at 474 m**: `data/terrain/index_global.json`, 990 equirectangular 8° tiles, loading only the tiles around the camera, replacing the 7.6 km globe relief when you fly down. (c) **40 m Artemis tiles**: `data/terrain/index_detail.json`, lod 2, inside each site's 20 km box. Same 16-bit PNG tile format and decode formula as the south tiles. The index files explain the registration. Seams match exactly, including across the date line. (reassigned from T1 to T3 at the user’s request; unclaimed)

## Round 2 · polish from user feedback (14 Nov)
All of these follow `design/style.md`. Anything animated must also follow the M11 update to "Motion (D5)", so read M11 before building M1, M5 or M6. Claim before you start, as usual.

### T1 · viewer/ · completed work
- [x] M4 · T1 · **Pin markers in the viewer.** Add `viewer.addMarker(id, lat, lon, label)` and `viewer.removeMarker(id)`, and document them in `viewer/README.md`. Markers must be visible on the globe and on the terrain. Use a thin `--text` ring with a small number label (1–3) and no glow. (claimed by T1, 11:50)
- (V8 above now covers loading all the new terrain: north, whole Moon at 474 m, and 40 m Artemis.)

### T1 · polish pass (Saturday, all done before leaving)
Small fixes only, no new features. Claim each one, push, tick, log. If one is unfinished when you leave, set it back to `[ ]` and leave a LOG.md note for T2.
P1 touches `web/`: allowed for T1 by agreement. Build it as `web/components/stats-ticker.js` and tell @T2 in LOG.md, because M6 also changes the landing screen.
- [x] P1 · T1 · **Landing stats move slowly left → right.** The three stat cards (Ephemeris · Terrain · Live check) become one strip drifting slowly to the right in a seamless loop (about 40 s per full cycle). Pause on hover/focus, keep text readable, palette tokens only. `prefers-reduced-motion` → static strip, no motion. (claimed by T1, 15:10)
- [x] P2 · T1 · **No blank Moon on load.** Show a still poster image of the Moon until the 3D viewer is ready, then cross-fade. No white or empty flash. (claimed by T1, 15:10)
- [x] P3 · T1 · **Camera feel.** Smooth ease-in-out fly-to, no jitter at the end, zoom limits so you can't clip into the terrain or zoom out to a dot. (claimed by T1, 15:10)
- [x] P4 · T1 · **Phone touch.** One-finger rotate, pinch zoom, tap to pick a site. Test at 375 px width. (claimed by T1, 15:10)
- [x] P5 · T1 · **Loading and error states.** Subtle indicator while terrain tiles load; if a tile fails, fall back to the coarser terrain instead of a hole. (claimed by T1, 15:10)
- [x] P6 · T1 · **Clean console.** Zero errors and zero 404s from opening the site through Start → mode → click → fly-to → Home. (claimed by T1, 15:10)
- [x] P7 · T1 · **Smooth and light.** Cap device pixel ratio at 2, pause rendering when the tab is hidden, aim for smooth motion on a normal laptop. (claimed by T1, 15:10)

- [x] P8 · T1 · **Faint shooting stars on the landing background.** Tune the existing shooting stars (W9, `web/components/starfield.js`) or add them if missing: very faint, thin short trail, rare (one about every 20–40 s at a random spot and angle), never over text, landing screen only. `prefers-reduced-motion` → none. Tell @T2 in LOG.md, since it's their component. (claimed by T1, 15:10)

- [x] P9 · T1 · **Overlay hook for the heat map (small, before leaving).** Add `viewer.setOverlay(imageOrCanvas, {projection, x0_km, y0_km, size_km, opacity})` and `viewer.clearOverlay()`, which drape a semi-transparent image over the south polar terrain. Document it in `viewer/README.md`. T3 builds the heat map on top of it. (done by T3)

### T2 · web/
- [x] M5 · T2 · **Title screen entrance.** The "FUTURE HUMAN LANDING SYSTEM" title and the Moon swish in together, as one composition, when the page first loads. Play it once per visit, ≤ 800 ms, with no animation under reduced motion (M11 rules).
- [ ] M6 · T2 · **Simplify the landing actions and add background depth.** Remove "CHOOSE A MODE", because Start does the same. Add the background visual effects allowed by M11 (e.g. depth layers of stars drifting slowly at different speeds), on the landing screen only, palette tokens only.
- [~] M7 · T2 · FHLS logo + favicons DONE; Space Apps and team logos BLOCKED on M10 (files do not exist). **Put the logos on the site.** Use the FHLS logo from `design/logo/` (wordmark/header plus favicon tags), the NASA Space Apps logo `design/logo/app_logo.png`, and the team logo, all from M10. Placement: the FHLS logo on the landing screen, and the Space Apps and team logos small in a footer credit line. Follow `design/logo/README.md` and the Space Apps brand rules noted there.
- [ ] M8 · T2 · **Show what you pinned.** When a site is pinned, call `viewer.addMarker` (M4). The marker number matches its pin card (1–3). Unpinning removes the marker, and markers survive mode changes and Home round trips.

### T2 · round 3 additions
- [ ] M13 · T2 · **Light / dark mode toggle, bottom-right.** A small, subtle round button fixed to the bottom-right corner that stays on screen everywhere (sun/moon icon, tooltip "Light mode"/"Dark mode"). Default follows the system setting (`prefers-color-scheme`); the user's choice is remembered (localStorage wrapped in try/catch). Only switches the colour tokens: panels, text, cards, charts. The 3D Moon and space backgrounds stay dark in both modes (it's space). Smooth 0.3 s colour fade. Must not overlap the Netlify badge or pin cards; keyboard-accessible with a visible focus ring. Uses the light tokens from D7 (T3).
- [ ] M14 · T2 · **Text transitions inwards.** Headings, labels and panel text enter with a subtle inward motion: a few pixels from the side toward their final position plus a fade, lines staggered by about 40–60 ms, 400–500 ms total (see style.md Motion). Only when a screen or panel first appears, never on every number update (live values must stay readable). `prefers-reduced-motion` → no motion. Same easing and timings as T3's S1 scroll reveal, so the site feels consistent.

### T3 · scroll-down sections below the landing (`web/sections/`, owned by T3)
Below the landing screen, the page scrolls into these sections. Built by T3 in `web/sections/` (HTML partial + CSS + small JS); T2 only adds one include line in `web/index.html`, so tell @T2 in LOG.md. Palette and type from style.md. Must be finished before the Sunday 11:00 freeze; swapping in the real video link after the freeze is fine.
- [x] D7 · T3 · **Light-mode tokens in style.md** for M13: a light version of every colour token (background, surface, line, text, muted), keeping the Sun/Earth/both/none colours recognisable and readable on light backgrounds (contrast ≥ 4.5:1 for text).
- [x] S1 · T3 · **Smooth scroll reveal.** Each section fades and rises ≤ 8 px as it enters the screen (IntersectionObserver, ≤ 500 ms, once only; see style.md Motion). `prefers-reduced-motion` → appear instantly.
- [x] S2 · T3 · **Video placeholder.** A 16:9 frame with a still poster and "Demo video coming soon". Later replaced by the real demo: muted, captions on, play button, no sound until clicked.
- [x] S3 · T3 · **About: how we came to this idea.** Two short paragraphs: the challenge, why the south pole's low Sun and wobbling Earth make landing-site choice hard, how the architect's sun-path/shading-mask idea led to FHLS, and who it helps.
- [x] S4 · T3 · **Limits.** One short note: sunlight and Earth visibility are planning inputs, not proof a site is safe; slope, boulders, temperature and mission constraints also matter.
- [x] S5 · T3 · **How it's built.** Data → engine → browser in one line or a simple diagram, NASA data used, validation result (r = 0.99 vs NASA's illumination map).
- [~] S6 · T3 · **Team.** Three members, names and roles. (claimed by T3; built with placeholders, waiting for the three names)
- [x] S11 · T3 · **Own time slider for the horizon panorama.** A separate slider inside the panorama, independent of the timeline at the top: moving it moves only the panorama's Sun and Earth (with trails and visible/blocked states), never the main hour, the 3D view or the results panel. It starts at the timeline's hour when a site is chosen; a "Match timeline" link re-syncs it. Keyboard accessible; all modes.
- [x] S7 · T3 · **Footer.** "Made by Team FHLS · NASA Space Apps Challenge 2026". No NASA logo.
- [x] S8 · T3 · Check on phone (375 px) and laptop; no layout jumps.
- [ ] S12 · T3 · **Make the landing scroll like a real website, in this layout** (before the Sunday 11:00 freeze).
  - **Why it's invisible today:** `web/sections/` is built (S1–S8) but `web/index.html` never loads it. Add the one line next to the app.js script tag: `<script type="module" src="sections/sections.js"></script>` (T3 adds it, tell @T2 in LOG.md). Check the landing screen can actually scroll (no `overflow: hidden` / fixed 100 % height trapping it) and add a quiet "Scroll ↓" cue at the bottom of the hero.
  - **Layout, top to bottom, each block fading in on scroll (S1 rules):**
    1. **Video: "How to use FHLS · Beginner mode".** Full-width 16:9 frame, placeholder poster + "Video coming soon" for now; later the Beginner walkthrough video (muted, English captions, plays on click). Set via `VIDEO` in `sections.js`.
    2. **Two columns:** **left** a paragraph (why we built FHLS: the south pole's low Sun and wobbling Earth, the sun-path idea, who it helps; ~120–150 words); **right** an image of the Moon and a Moon landing. Placeholder frame for now. Final image: a real NASA public-domain photo (e.g. an Apollo surface photo or an LRO view of a landing site) with a small credit line. **No AI-generated images, no NASA logo.** On phone the columns stack: text first, image below.
    3. Keep "How it's built" (with r = 0.99), "Limits" and "Team" as compact blocks below (judges look for validation and limits); they can be shortened.
    4. **Bottom footer:** "Made by Team FHLS · NASA Space Apps Challenge 2026", team names, links to the GitHub repo and data credits (SPICE, LOLA, PGDA, CGI Moon Kit). No NASA logo.
  - Palette/type from style.md, light and dark mode, reduced motion → no animation. Check laptop and phone, no console errors.

- [x] S9 · T3 · **Moving Sun and Earth in the sky panorama (Option A).** In the horizon panorama (`web/components/horizon-panorama.js`, coordinate with @T2), draw the Sun and Earth at their positions for the current hour over the real skyline. **Linked to the timeline:** dragging the date slider or timeline moves them to that hour instantly; a ▶ Play / ⏸ Pause button animates time at 1 day per second (options: 1 h/s, 1 day/s, 1 week/s). When either is behind terrain it dims to 35% and its marker gets a dashed outline. Short fading trail of the last ~2 days. Reduced motion → no autoplay, scrubbing still works. All modes; Beginner shows just the Sun/Earth icons with "visible / blocked" labels.
- [x] E13 · T3 · **Heat-map data.** In the engine, for every point of the south polar grids: `pct_sunlit`, `pct_earth`, `pct_both`, `longest_dark_hours` over 2027–2028 (and per month). Save as small PNG/bin layers in `data/heatmap/` with a legend file. Precomputed, never in the browser.
- [x] S10 · T3 · **Heat-map toggle in every mode** (uses P9 overlay). A "Map" control over the 3D view:
  - **Beginner:** one switch "Sunlight map" (dark → bright amber, legend "rarely lit … often lit").
  - **Intermediate:** choose Sunlight / Earth contact / Both, with a numeric legend in %.
  - **Advanced:** also "Longest blackout" and a month selector; clicking the map shows the exact value.
  Overlay opacity about 60%, colours from `--sun-fill` / `--earth-fill` / `--both-fill` ramps only, south polar region only (label "south pole only"). Off by default.

### T3 · engine/, design/, plus reassigned viewer/ work
The user reassigned unfinished T1 work to T3. T3 is authorized to edit `viewer/` for V8, O2 and M1–M3; claim these before continuing. M4 is complete and pushed.

- [x] M1 · T3 · **Smooth the move from space down to the terrain.** No jump or pop where the globe hands over to the terrain tiles. Keep one continuous camera path and crossfade globe → terrain detail. Fly-to stays 1.2–2.5 s (D5); with reduced motion it is an instant cut. (reassigned from T1 to T3 at the user’s request; unclaimed)
- [x] M2 · T3 · **Landing Moon blends into the page.** The Moon currently sits in a visibly lighter/darker box, and its brightness doesn't match the page. Make the canvas background transparent (or exactly `--bg`), with no edge or box, so the page's stars continue behind and around the Moon. Keep the real-Sun lighting from F5. (reassigned from T1 to T3 at the user’s request; unclaimed)
- [x] M3 · T3 · **Landing Moon shows up straight away.** It appears late during loading. Show a lightweight first frame immediately (a small texture or a poster image of the same view), then swap in the full-resolution globe without a flash. Report the time to first visible Moon before and after. (reassigned from T1 to T3 at the user’s request; unclaimed)
- [x] M9 · T3 · **Higher-res terrain where it matters.** Full-resolution 40 m LOLA tiles around the 7 Artemis sites (lod 2, same tile format). Check the north tiles too. Hand over to T1 for V8 in LOG.md.
- [x] M10 · T3 · **Logo files.** Get the official NASA Space Apps logo per the Space Apps brand guidelines, saved as `design/logo/app_logo.png`. Prepare the team logo, and web sizes of the FHLS logo for M7. Document the usage rules in `design/logo/README.md`.
- [x] M11 · T3 · **Update "Motion (D5)" for round 2.** Specify the M5 title entrance, the M6 background effects, the M1 globe→terrain handover and the M2 blend, with what is allowed, durations and reduced-motion behaviour. Do this first, because M1, M5 and M6 depend on it.
- [x] E12 · T3 · **120 m "south-pole quality" terrain for 9 regions**: the 6 Apollo sites + Tycho, Copernicus, Aristarchus (12° × 12° each, LOLA LDEM_256 ≈ 118 m), `data/terrain/index_regions.json`
- [x] V9 · T3 · Viewer: use the 120 m region tiles when flying into those regions
- [x] M12 · T3 · **Review round 2.** Check M1–M8 against style.md and the H3 checklist, using `design/review/walkthrough.mjs` on desktop and phone. Log findings to owners before the Sunday 11:00 freeze. (see design/review_round2.md; rerun the checks after T2's M6–M8)

## Sunday
- 11:00 feature freeze · 12:30 video + page ready · 13:15 submitted · 13:30 deadline · 14:00 judging (ask for an early slot)

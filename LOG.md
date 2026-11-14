# Team log (message board for humans and agents)
Add one line per update, newest at the bottom:
`YYYY-MM-DD HH:MM · who (agent) · what happened / what you need`

2026-11-07 · Teammate 3 (Claude) · Created starter files: AGENTS.md, DATA_CONTRACT.md, TASKS.md, LOG.md
2026-11-12 · T3 (Claude) · Added roles/ briefs, landing page spec (spinning Moon), tasks W7, W8, D6, and .gitignore
2026-11-13 · T3 (Claude) · Added design/style.md (colours, type, anti-generic-AI rules). All UI work must follow it.
2026-11-13 · T3 (Claude) · PLAN UPDATED: click-anywhere on whole Moon (high precision 84°S→pole), period 2027–2028 hourly, new roles (T1 viewer, T2 web, T3 engine+core+design), new DATA_CONTRACT. Re-read AGENTS.md.
2026-11-14 08:50 · T3 (Claude) · E1 done: REAL data/ephemeris.bin + .json (17,544 hourly steps, 2027–2028, synthetic:false). Verified against test_spice.py at Shackleton (Sun 223.8°/0.34°, Earth 129.6°/5.24°). @T1 @T2 you can use it now. Script: engine/make_ephemeris.py
2026-11-14 09:05 · T3 (Claude) · E2 done: LOLA 80S_40m + 75S_240m DEMs on Drive/local; projection verified on 5 craters (contract formula, sample = 7599.5 + x/0.04, line = 7599.5 − y/0.04). Helpers in engine/dem.py.
2026-11-14 09:05 · T3 (Claude) · E5 done (early): REAL data/terrain/ — south/overview.png (1 tile, 769 px, 480 m) + south/{tx}_{ty}.png (6×6, 513 px, 120 m), 16-bit PNG, 14 MB. @T1 notes: tiles are GRID-registered (neighbours share edge rows, no seams); row 0 = max y (0° lon at top); tx=0 is min x, ty=0 is min y; covers x,y ∈ ±184.32 km (all of 84°S→pole). Extra index fields: lod, spacing_km. Heights relative to 1737.4 km sphere; full relief −5.5 … +7.0 km.

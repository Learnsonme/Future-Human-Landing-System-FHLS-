# Task board
Format: `- [ ] ID · owner · task`
`[ ]` = free · `[~]` = in progress (claimed by …, time) · `[x]` = done. Claim → push immediately → work → tick → log.

## Before the event
- [ ] S1 · all · Create GitHub repo, add teammates, push these starter files
- [ ] S2 · all · Install Claude Code / Codex; each person does one practice commit
- [ ] S3 · all · Agree on 5–6 sites and the date range; confirm DATA_CONTRACT.md

## Engine (Teammate 1 + Claude Code)
- [ ] E1 · T1 · SPICE setup: Sun & Earth az/el for one site, hourly, 30 days
- [ ] E2 · T1 · Horizon mask from LOLA DEM for one site
- [ ] E3 · T1 · Combine → power/comms flags + summary → `data/<site>.json`
- [ ] E4 · T1 · Run for all sites; write `data/sites.json`
- [ ] E5 · T1 · Sanity check against a known source; note accuracy limits

## Web (Teammate 2 + Codex)
- [ ] W1 · T2 · App shell + mode switcher (Beginner / Intermediate / Advanced)
- [ ] W2 · T2 · Load data from `data/` (use synthetic sample until E3 is done)
- [ ] W3 · T2 · Date slider + hourly strip (power/comms colour bands)
- [ ] W4 · T2 · Site comparison cards
- [ ] W5 · T2 · Advanced tables + CSV export
- [ ] W6 · T2 · Deploy (GitHub Pages): placeholder page live on day 1
- [ ] W7 · T2 · Landing page: spinning 3D Moon (three.js) + Start button
- [ ] W8 · T2 · Transition: rotate to south pole → zoom → site pins → site view

## Design & pitch (Teammate 3 + Claude)
- [ ] D1 · T3 · Sun-path sky chart component (sun track, Earth loop, horizon mask)
- [ ] D2 · T3 · Colour system + typography + logo assets
- [ ] D3 · T3 · Beginner-mode wording and icons
- [ ] D4 · T3 · 30-second demo video + slides
- [ ] D5 · T3 · Project page text + AI-use disclosure
- [ ] D6 · T3 · Landing page look: Moon texture, starfield, pin style, transition timing (spec for W7/W8)

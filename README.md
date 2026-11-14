# FHLS – Future Human Landing System

Click anywhere on the Moon and see, hour by hour through 2027 and 2028, whether the Sun and Earth clear that spot's own horizon: the two numbers that decide power and direct communication for a landing.

**Live demo:** https://learnsonme.github.io/Future-Human-Landing-System-FHLS-/
**Demo video:** coming soon
**NASA Space Apps 2026:** [team page](https://www.spaceappschallenge.org/2026/find-a-team/future-human-landing-system-fhls/)

![FHLS explorer: the Connecting Ridge Artemis site on 40 m LOLA terrain with the sunlight heat map, and its results panel](docs/img/fhls-explorer.jpg)

## The problem
At the lunar south pole, where Artemis crews will land, the Sun never rises more than about 1–2° above the horizon, and Earth wobbles by up to about ±6.7° over a month. At such low angles, a crater rim a few hundred metres away decides whether solar panels get light and whether a lander can see Earth for a direct radio link. A good site 1 km away can be dark for weeks.

## What FHLS does
- **Any spot on the Moon:** click the 3D Moon or pick one of 26 candidate sites (Artemis regions, Apollo sites, famous craters).
- **Sun and Earth against the real horizon,** for all 17,544 hours of 2027–2028, from NASA terrain and JPL ephemerides.
- **Three modes:** Beginner (a plain yes/no and one sentence), Intermediate (angles, percentages, windows), Advanced (exact numbers, an hour-by-hour table, CSV export).
- **Heat maps over the whole Moon:** sunlight, Earth contact, both, longest blackout, per month. Higher detail (250 m) at the south pole.
- **Horizon panorama:** the site's real skyline with the Sun and Earth moving across it, with its own time slider and a Play button.
- **Compare up to 3 sites** side by side, with numbered markers on the Moon.
- **Light and dark mode,** keyboard controls, phone layout and full screen.

## How it works
```
NASA data ──► engine/ (Python, run once) ──► data/ (small files) ──► browser (core/ + viewer/ + web/)
SPICE, LOLA     horizons, ephemeris,          JSON, binary,           combines them for any click
                terrain tiles, heat maps      PNG tiles               in about 10 ms
```
- **Engine (`engine/`):** traces each point's skyline in 180 directions from LOLA elevation data (every 2 km around the south pole, 250 m at Artemis sites, 0.25° over the whole Moon). It computes the Sun and Earth position for every hour from JPL SPICE.
- **Browser (`core/`, `viewer/`, `web/`):** no server. The site loads the precomputed files, and `core/fhls-core.js` combines skyline and ephemeris for the clicked spot. The 3D Moon is three.js with real LOLA terrain tiles.

## NASA data used
- **JPL NAIF SPICE:** DE440s planetary ephemeris, Moon PA/ME frame kernels (`moon_de440_250416.tf`), `pck00011.tpc`, `naif0012.tls`.
- **LRO LOLA polar DEMs:** 40 m (80°S/80°N) and 240 m (75°S/75°N) gridded elevation maps.
- **LRO LOLA global DEMs:** LDEM_16, LDEM_64, and LDEM_256 regions (about 120 m) for the Apollo sites and famous craters.
- **NASA PGDA:** LOLA south polar illumination map (Mazarico et al. 2011), used for validation only.
- **NASA SVS CGI Moon Kit:** globe colour (LROC) and displacement.
- **Apollo 11 photo:** AS11-40-5903, NASA, public domain.

## Validation
We compared FHLS with NASA's published LOLA south polar illumination map at **400 random points**. The mean difference is **0.8 percentage points**, the correlation **0.99**, and we find the same permanently shadowed ground (37 of 37 points). Details in [engine/ACCURACY.md](engine/ACCURACY.md).

## Limits
- Seeing the Sun or Earth does **not** guarantee power or a radio link, and it is **not** proof that a site is safe to land on. Slope, boulders, temperature and dust matter too.
- Away from the poles the terrain is lower precision (1° to 0.25° horizon grids), and the app says so wherever it applies.
- The 3D shadows are illustrative; the numbers come from the horizon calculation.

## Run locally
```sh
git clone https://github.com/Learnsonme/Future-Human-Landing-System-FHLS-.git && cd Future-Human-Landing-System-FHLS-
python3 -m http.server 8000      # then open http://localhost:8000/
```
Core checks: `node core/test.mjs`.

### Rebuild the data
You need Python 3 with numpy, spiceypy and Pillow, plus the SPICE kernels and LOLA maps listed in [engine/README.md](engine/README.md). From `engine/`, in this order:
1. `python3 make_ephemeris.py`: hourly Sun and Earth, 2027–2028
2. `python3 make_horizon.py` (then `fine`, `north_2km`): polar skylines
3. `python3 make_horizon_global.py coarse`, then `fine`: whole-Moon skylines
4. `python3 make_terrain.py`, then `python3 make_terrain.py north`: polar terrain tiles
5. `python3 make_terrain_detail.py artemis`, then `global`: 40 m Artemis and 474 m whole-Moon tiles
6. `python3 make_terrain_regions.py`: 120 m Apollo and crater regions
7. `python3 sites.py`: candidate sites
8. `python3 make_heatmap.py`, then `python3 make_heatmap_global.py`: heat maps
9. `python3 validate.py`: the comparison with NASA's illumination map

## Repository layout
| Folder | What it holds |
|---|---|
| `web/` | The website: screens, results panel, charts, landing sections |
| `viewer/` | The 3D Moon and terrain (three.js) |
| `core/` | Browser maths: combines skyline and ephemeris for any spot |
| `engine/` | Python scripts that build everything in `data/` |
| `data/` | Precomputed ephemeris, horizons, terrain tiles, heat maps, sites |
| `design/` | Style guide, logo, demo script, reviews |
| `docs/` | README images and team setup notes |
| `roles/`, `TASKS.md`, `LOG.md`, `AGENTS.md` | How the team and its AI agents split and logged the work |

## Team
- **Abdullah Khan:** 3D Moon viewer
- **Alessandro Savastano:** web app and integration
- **Hariyank Suvarna:** data engine, browser maths, design and pitch

## Use of AI
We used AI coding agents throughout: **Claude** (Claude Code) and **OpenAI Codex**. They wrote most of the code and much of the documentation text, and helped plan and split the tasks. The team chose the idea, made the design and scientific decisions, directed every task, reviewed the results and tested the site. Validation against NASA's published illumination map was the team's check that the science is right. How the agents were briefed is in `AGENTS.md`, `roles/` and `LOG.md`.

## Credits and licences
- **Code:** MIT, see [LICENSE](LICENSE).
- **three.js r170:** MIT. **Open Sans:** SIL Open Font License. **SpiceyPy:** MIT. **NumPy:** BSD. **Pillow:** MIT-CMU.
- **NASA data and imagery:** public domain (NASA does not endorse this project).
- The NASA Space Apps Challenge logo is used only as a participation credit.
- Every asset with its source is listed in [CREDITS.md](CREDITS.md).

Team setup notes from the hackathon: [docs/TEAM_SETUP.md](docs/TEAM_SETUP.md).

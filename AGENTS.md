# FHLS – Future Human Landing System
*Lunar landing site navigator · NASA Space Apps Challenge 2026*

**Every AI agent (Claude, Codex, ChatGPT) reads this file first, then its role brief in `roles/`, then TASKS.md and LOG.md.**

## The challenge (official wording)
> Create an intuitive tool or application that lets mission planners, educators, and the public
> compare landing sites and dates quickly, visualizing Sun and Earth positions relative to the
> horizon to assess power generation potential and direct-to-Earth communication windows.

## The product: click anywhere on the Moon
1. **Open the site:** a 3D Moon spins slowly on a starfield, with the FHLS title and a **Start** button.
2. **Start → choose a mode:** Beginner / Intermediate / Advanced. The mode changes how much detail the results show, not what you can explore.
3. **Explore like Google Earth:** drag to rotate, scroll/pinch to zoom, anywhere on the **whole Moon**. Real relief from LOLA elevation data.
4. **Click any spot:** the camera flies down to it.
5. **Site view:** 3D terrain around the point (ridges, cliffs, crater walls), lit by the **real Sun** for the selected date, plus a results panel:
   - Sun angle (azimuth + elevation) and Earth angle
   - Is the Sun / Earth blocked by terrain right now?
   - % of time with sunlight, Earth contact, both; longest dark period
   - Timeline strip of good windows; a date slider
6. **Mode differences:** Beginner = plain-language yes/no + one sentence. Intermediate = angles, %, timeline, horizon panorama. Advanced = exact numbers, hour-by-hour table, CSV download.
7. **Optional (only after everything above works):** "Pin for comparison" to compare 2–3 spots side by side.

Earth does **not** need to appear as a 3D object. Showing its angle and visibility is enough.

## Scope decisions (fixed)
- **Clickable area: the whole Moon.**
  - **South polar region (84°S → pole): full terrain precision** (precomputed horizon grid, detailed 3D terrain tiles).
  - **Elsewhere:** Sun/Earth angles are exact; terrain is coarser and the UI labels it **"lower precision"**.
- **Time period: 2027-01-01 00:00 UTC → 2028-12-31 23:00 UTC, hourly** (17,544 steps). Covers the run-up to and the year of NASA's first crewed landing (Artemis IV, planned 2028; Artemis III is now a 2027 Earth-orbit test) and shows how windows shift year to year.
- **No server.** Everything heavy is precomputed; the browser does the final, light maths. The demo must work offline.

## Why time matters (for UI text and the pitch)
- The Sun circles the polar horizon once per lunar day (~29.5 days), so terrain blocks it from different directions during the month.
- The Moon's 1.5° tilt gives "seasons" with a ~346.6-day cycle (eclipse year), so good months shift ~18–19 days earlier each calendar year.
- Earth bobs ±6.7° (libration) every ~27 days and can sink below the polar horizon for about 2 weeks.
- The full pattern repeats only every ~18.6 years.

## Architecture
```
engine/ (Python, T3)                 core/ (JS, T3)              web/ (T2)            viewer/ (T1)
SPICE → ephemeris table ─┐
LOLA  → horizon grids ───┼─▶ data/ ─▶ fhls-core.js: az/el,  ─▶ results panel,  ◀─▶ 3D globe + terrain,
LOLA  → terrain tiles ───┘            blocked?, windows,       modes, timeline,      camera fly-to,
                                       summaries                 slider, deploy        real-Sun lighting
```

## Team & ownership (each person only edits their own folder)
| Folder    | Owner      | AI          | Job |
|-----------|------------|-------------|-----|
| `viewer/` | Teammate 1 | Claude Code | 3D globe → fly-to → terrain with cliffs, real-Sun lighting. **Saturday only, must be done by Sat evening.** If V1–V6 are done early, T1 may claim tasks marked `(open to T1)`. |
| `web/`    | Teammate 2 | Codex       | App shell, modes, results panel, timeline, click handling, final integration, deploy |
| `engine/` | Teammate 3 | Claude      | Python: ephemeris table, horizon grids, terrain tiles → `data/` |
| `core/`   | Teammate 3 | Claude      | `fhls-core.js`: the browser maths (shared by viewer and web) |
| `design/` | Teammate 3 | Claude      | Style guide, Beginner wording, pitch, video, project page |
| `data/`   | written by engine only | | Format fixed by DATA_CONTRACT.md |

Role briefs: `roles/T1_viewer.md`, `roles/T2_web.md`, `roles/T3_engine_design.md`.

## Rules for agents
- **Claim before you work:** in TASKS.md change `[ ]` to `[~]` and add `(claimed by T1, 14:05)`, then commit and push that change **immediately**. If a task is already `[~]`, don't touch it.
- **Need something from another folder?** Don't edit it. Write a request in LOG.md starting with `@T1`, `@T2` or `@T3`.
- **Pull before you start, push when you finish.** Small commits, clear messages.
- **Never change DATA_CONTRACT.md alone.** Propose in LOG.md and wait for the team.
- Follow `design/style.md` for every visible element.
- Label placeholder data `"synthetic": true`. Never present it as real.
- Never claim visibility = guaranteed power or a guaranteed radio link.
- Keep the demo offline-safe: no live API calls during judging.

## Key data sources
- JPL NAIF SPICE generic kernels: https://naif.jpl.nasa.gov/naif/data_generic.html
- LOLA data (PDS Geosciences): https://pds-geosciences.wustl.edu/missions/lro/lola.htm
- LOLA south pole DEMs (PGDA): https://pgda.gsfc.nasa.gov/products/78 and /products/81
- LOLA polar illumination (for validation): https://pgda.gsfc.nasa.gov/products/69
- NASA CGI Moon Kit (globe colour + displacement maps): https://svs.gsfc.nasa.gov/4720

# FHLS – Future Human Landing System
*Lunar landing site navigator · NASA Space Apps Challenge 2026*

**Every AI agent (Claude, Codex, ChatGPT) reads this file first, then TASKS.md and LOG.md.**

## The challenge (official wording)
> Create an intuitive tool or application that lets mission planners, educators, and the public
> compare landing sites and dates quickly, visualizing Sun and Earth positions relative to the
> horizon to assess power generation potential and direct-to-Earth communication windows.

## What we are building
One engine, one dataset, **three modes**:
1. **Beginner** (public): traffic-light answers like "Sun? Earth? Both?" in plain language.
2. **Intermediate** (educators/hobbyists): sun-path sky chart with terrain horizon, date slider, compare 2 sites.
3. **Advanced** (mission planners): az/el tables, exact windows, panel/antenna height, CSV export, data sources.

Build order: Intermediate → Beginner → Advanced.

## Landing page (first thing judges see)
- A **3D Moon slowly spinning** in the centre of a dark starfield, with the FHLS logo/title and a "Start" button.
- On click (or scroll), the Moon **rotates to the south pole and the camera zooms in**. Candidate sites appear as glowing pins.
- Clicking a pin **transitions** (fade/zoom) into that site's view: horizon panorama + timeline + mode switcher.
- Tech: three.js sphere with NASA's public-domain CGI Moon Kit texture (https://svs.gsfc.nasa.gov/4720). Keep it light so it loads fast.
- Respect `prefers-reduced-motion`: show a still Moon if the user has reduced motion on.

## Team & ownership (each person only edits their own folder)
**Your personal brief is in `roles/`: T1 → `roles/T1_engine.md`, T2 → `roles/T2_web.md`, T3 → `roles/T3_design.md`. Read yours after this file.**

| Folder    | Owner        | AI          | Job |
|-----------|--------------|-------------|-----|
| `engine/` | Teammate 1   | Claude Code | Python: SPICE (spiceypy) + LOLA horizon masks → JSON in `data/` |
| `web/`    | Teammate 2   | Codex       | Web app shell, 3 modes, site picker, date slider, deploy |
| `design/` | Teammate 3   | Claude      | Sun-path sky chart, visual style, pitch, demo video |
| `data/`   | written by engine only | | Precomputed JSON, format fixed by DATA_CONTRACT.md |

## Rules for agents
- **Claim before you work:** in TASKS.md change `[ ]` to `[~]` and add `(claimed by T1, 14:05)`, then commit and push that change **immediately**, before writing any code. If a task is already `[~]`, do not touch it: pick another one or ask in LOG.md.
- **Need something from another folder?** Do not edit it. Write a request in LOG.md starting with `@T1`, `@T2` or `@T3`.
- **Pull before you start, push when you finish.** Small commits with clear messages.
- **Never change `DATA_CONTRACT.md` alone.** Propose the change in LOG.md and wait for the team.
- Tick your task in `TASKS.md` and add one line to `LOG.md` after every task.
- Do not edit another owner's folder. If you need something from them, ask in LOG.md.
- Use real NASA data where possible. If you use placeholder/synthetic values, label them `"synthetic": true`.
- Never claim visibility = guaranteed power or a guaranteed radio link.
- Keep the demo working offline: all data is precomputed, with no live API calls during judging.

## Key data sources
- JPL NAIF SPICE generic kernels: https://naif.jpl.nasa.gov/naif/data_generic.html
- LOLA south pole DEMs (5 m): https://pgda.gsfc.nasa.gov/products/78 and /products/81
- LOLA polar illumination: https://pgda.gsfc.nasa.gov/products/69
- NASA Lunar Surface Data Book: https://ntrs.nasa.gov/citations/20230007818

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

## Team & ownership (each person only edits their own folder)
| Folder    | Owner        | AI          | Job |
|-----------|--------------|-------------|-----|
| `engine/` | Teammate 1   | Claude Code | Python: SPICE (spiceypy) + LOLA horizon masks → JSON in `data/` |
| `web/`    | Teammate 2   | Codex       | Web app shell, 3 modes, site picker, date slider, deploy |
| `design/` | Teammate 3   | Claude      | Sun-path sky chart, visual style, pitch, demo video |
| `data/`   | written by engine only | | Precomputed JSON, format fixed by DATA_CONTRACT.md |

## Rules for agents
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

# Role brief: Teammate 1 · Science engine · `engine/`
You are the AI assistant for Teammate 1. Read AGENTS.md first.

**Your job:** turn NASA data into the JSON files the website shows.

**Inputs (where your data comes from)**
- JPL NAIF SPICE kernels (de440.bsp, naif0012.tls, Moon orientation kernels) → Sun & Earth positions.
- LOLA south pole DEMs (PGDA products 78/81) → terrain heights → horizon masks.
- Big data files live in `engine/kernels/` and `engine/dem/`, which are **git-ignored**. Never commit them.

**Outputs (where your work goes)**
- `data/sites.json` and `data/<site_id>.json`, exactly as defined in DATA_CONTRACT.md.
- You are the **only** one who writes to `data/`.

**Who depends on you:** T2 (web) reads your JSON to draw everything. T3 (design) uses it for the sky chart.
**First thing to do:** push `data/sample_site.json` (synthetic, labelled `"synthetic": true`) in the first hour, so T2 and T3 can start building straight away.

**Tasks:** E1–E5 in TASKS.md.

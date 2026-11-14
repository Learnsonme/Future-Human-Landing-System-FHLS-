# Prompt · Repository clean-up (safe, no behaviour changes)

Paste everything below the line into the AI.

---

You are cleaning up the GitHub repo of **FHLS – Future Human Landing System**, a NASA Space Apps 2026 project. The live site is served by **GitHub Pages from the repo root** (`index.html` → `web/`). Judges will read this repo. Goal: make it look clean and professional **without changing how the site works**.

## Hard rules
1. `git pull --rebase origin main`, then work on a branch: `git switch -c cleanup`.
2. **Do not move or rename** `web/`, `core/`, `data/`, `viewer/`, `design/logo/`, `index.html`, `AGENTS.md`, `CLAUDE.md`. The site loads `../core/` and `../data/` from `web/` with relative paths; agents read `AGENTS.md`/`CLAUDE.md` from the root.
3. **Never delete anything in `data/`** (it is the science data the site loads). Never edit `core/fhls-core.js` logic.
4. Before deleting any file, `git grep` its name (and path) across the repo. If anything references it, keep it.
5. Small commits, one per kind of change, clear messages.
6. Before merging: serve the repo root locally (`python3 -m http.server 8000`, open `http://localhost:8000/`), click Start → each mode → click a spot → fly-to → MAP layers → pin/compare → Home → scroll the landing sections. **Zero console errors.** Run `node core/test.mjs` (all `ok`). Only then merge to `main` and push.
7. Must be merged **before the Sunday 11:00 (Bahrain) feature freeze**. If short on time, do steps A–C only.

## A · Remove clutter
- `roles/_old/` (superseded role briefs).
- `.gitkeep` files in folders that now contain files.
- Unused files: anything not referenced anywhere (check with `git grep`), stray screenshots, temp/test outputs, `.DS_Store`.
- `.github/workflows/pages.yml` if Pages is set to "Deploy from a branch" (check repo Settings → Pages). Otherwise keep it.
- Leftover debug code: `console.log` used for debugging, large commented-out blocks, TODOs that are done.

## B · Professional README.md (rewrite the top-level README)
Sections, in this order, short and scannable:
1. **FHLS – Future Human Landing System**: one-sentence pitch + **Live demo** link (GitHub Pages) + demo video link (placeholder until ready) + one screenshot.
2. **The problem**: lunar south pole, Sun ~1–2° above the horizon, Earth wobbling ±6.7°, terrain decides power and comms (2–3 sentences).
3. **What FHLS does**: click anywhere on the Moon; Sun/Earth vs the real horizon hour by hour for 2027–2028; three modes (Beginner / Intermediate / Advanced); heat maps; compare sites; CSV export.
4. **How it works**: data → engine (Python) → browser diagram; precomputed, no server.
5. **NASA data used**: JPL NAIF SPICE (DE440, Moon PA/ME kernels), LRO LOLA polar DEMs + LDEM_16 global, PGDA illumination (validation), NASA CGI Moon Kit, Apollo photo credit.
6. **Validation**: method and result (r = 0.99 against NASA's illumination map, mean difference 0.8 points), see `engine/ACCURACY.md`.
7. **Limits**: visibility ≠ guaranteed power/radio link or a safe landing site.
8. **Run locally** (2 commands) and **Rebuild the data** (engine scripts in order).
9. **Repository layout** (one line per folder).
10. **Team**: names and roles (from the site's Team block).
11. **Use of AI**: which AI tools were used and for what (code, planning, text), as Space Apps requires.
12. **Credits & licences**: three.js (MIT), Open Sans (SIL OFL), NASA data (public domain), any other library.
Move the old "preparation" notes (clone, agents, Drive link) into `docs/TEAM_SETUP.md` and link it.

## C · Licence and credits
- Add `LICENSE` (ask the team; default suggestion: MIT for the code).
- Add `CREDITS.md` listing every external asset/library/dataset with source URL and licence.
- AI acknowledgement: a one-line header comment in the main code files (`core/fhls-core.js`, `viewer/index.js`, `web/app.js`, engine scripts), e.g. `// Part of FHLS (NASA Space Apps 2026). Written with AI assistance (Claude, Codex); reviewed by the team.`

## D · Consistency (only if time allows)
- Consistent file headers and naming; delete dead CSS rules (verify with `git grep` first).
- Make sure `TASKS.md`, `LOG.md` and `roles/` stay (they document the team process) but add a short note at the top of `TASKS.md`: "Team task board used during the hackathon".

When done: update `LOG.md` with one line per step, push `main`, check the live site again in a private window.

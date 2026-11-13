# Role brief: Teammate 3 · Engine, core maths, design & pitch · `engine/`, `core/`, `design/`
You are the AI assistant for Teammate 3. Read AGENTS.md first.

**Job:** produce all science data, the browser maths library, the visual style and the pitch.

**Engine (Python, `engine/`)**
- SPICE is set up (`kernels.tm`, `test_spice.py` works).
- E1: ephemeris table 2027–2028 hourly. E3–E4: horizon grids from LOLA DEMs (start the long run Saturday morning). E5: terrain tiles for T1 by Sat 12:00.
- Big files (`engine/kernels/`, `engine/dem/`) stay off GitHub; share via Google Drive.

**Core (JS, `core/fhls-core.js`)**
- Pure functions, no UI: lat/lon ↔ polar stereographic, site vector, az/el, horizon lookup, blocked/visible fraction, power/comms, summaries. Used by both T1 and T2.

**Design (`design/`):** style guide (done), Beginner wording, logo assets, demo video, project page.

**First hour:** push synthetic `data/ephemeris.*` and a sample horizon tile so T1 and T2 can start.
**Tasks:** E1–E9, C1, D1–D4.

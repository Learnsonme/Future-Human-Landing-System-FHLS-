# Role brief: Teammate 1 · 3D viewer · `viewer/`
You are the AI assistant for Teammate 1. Read AGENTS.md first.
**Teammate 1 attends Saturday only. Everything here must be finished, pushed and documented by Saturday evening.**

**Job:** the 3D Moon people explore: spinning globe → drag/zoom anywhere → click → fly down → detailed south pole terrain with real cliffs, lit by the real Sun.

**Inputs**
- NASA CGI Moon Kit colour + displacement maps (https://svs.gsfc.nasa.gov/4720) for the whole globe.
- `data/terrain/` heightmap tiles from T3 (arrive by Sat 12:00; use any sample heightmap until then).
- Sun direction for a time: from `core/fhls-core.js` (T3). Until ready, use a fixed low Sun (elevation ~1°).
- Visual rules: `design/style.md`.

**Outputs**
- `viewer/`: a self-contained three.js module with this API (document it in `viewer/README.md`):
  - `createViewer(container)` · `viewer.onPick((lat, lon) => …)` · `viewer.flyTo(lat, lon)` · `viewer.setTime(utcString)`
- A standalone `viewer/demo.html` that works on its own.

**Who depends on you:** T2 embeds your viewer on Sunday without you, so the README must be clear.
**Done means:** demo.html works, API documented, pushed, LOG.md updated, and T2 has embedded it once on Saturday.
**Tasks:** V1–V6.

**Extra time?** After V1–V6 are done, you may claim TASKS.md items marked `(open to T1)` (e.g. W5 horizon panorama, W6 Advanced table). Build them as standalone components in `web/components/`, and only claim one you can finish before leaving. If you can't finish, un-claim it in TASKS.md and leave a LOG.md note for T2.

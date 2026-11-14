# Project page text (D4): paste-ready

Each section below matches one field of the Space Apps 2026 project form (Project Submission Guide, 13 Nov 2026).
**Before submitting:** fill in each `[TEAM: …]` and check the links in a private browser window. Judges must be able to open them without logging in.

---

## Project Name
FHLS: Future Human Landing System

## High-Level Project Summary
FHLS is a free web app that answers one question for any spot on the Moon: when does it see the Sun, and when does it see Earth? Spin a 3D Moon built from NASA elevation data, click anywhere, and the camera flies down to the real terrain, lit by the real Sun for the date you choose.

For that spot, FHLS shows how often in 2027 and 2028 the Sun clears the surrounding hills (that is what solar panels need) and how often Earth does (that is what a direct radio link needs). It shows the longest dark spell, a timeline of good windows, the skyline with the Sun and Earth moving across it, and heat maps of the whole Moon.

Beginner, Intermediate and Advanced modes give the same answers at three depths, from a plain yes or no to an hour-by-hour table with a CSV download. The question matters because at the lunar south pole, where Artemis crews will land, the Sun skims the horizon at 1–2°. Sunlight there changes within a few hundred metres and from one month to the next.

## Link to Project Demo
[TEAM: public link to the 30-second video, e.g. YouTube unlisted or a Google Drive file set to "anyone with the link"]

## Link to Final Project
https://learnsonme.github.io/Future-Human-Landing-System-FHLS-/ · Code: https://github.com/Learnsonme/Future-Human-Landing-System-FHLS- (public)

## Detailed Project Description

**What it does**
- **Whole Moon:** click anywhere, or pick one of 26 candidate sites (Artemis regions, the six Apollo sites, famous craters). South of 84°S, where NASA's Artemis candidate landing regions are, results use detailed terrain. Elsewhere the Sun and Earth positions are still exact, but the terrain is coarser, and the app labels those results "lower precision".
- **For each spot:**
  - Sun and Earth direction (azimuth and elevation) at any hour
  - whether terrain blocks them
  - the share of hours with sunlight, with Earth in view, and with both
  - the longest stretch without each
  - a timeline of good windows across 2027–2028, the run-up to and year of the first crewed landing planned for Artemis IV
- **Heat maps:** sunlight, Earth contact, both, and longest blackout, over the whole Moon and per month, with 250 m detail at the south pole.
- **Skyline panorama:** the real horizon around the spot, with the Sun and Earth moving across it on their own time slider.
- **Compare:** pin up to three sites side by side, with numbered markers on the Moon.
- **Three modes:** Beginner gives yes or no answers and one sentence. Intermediate adds angles, shares of time, the timeline and the panorama. Advanced adds exact numbers, an hour-by-hour table and a CSV download.
- **Honest output:** the app always says which point a result was computed for, and that seeing the Sun or Earth does not guarantee power or a radio link. Light and dark mode, phone layout and full screen are built in.

**How it works**
1. **Where the Sun and Earth are:** we used NASA/JPL's SPICE toolkit with the DE440 planetary ephemeris and the Moon's DE440 orientation model. From these we computed the Sun and Earth positions relative to the Moon for every hour of 2027–2028 (17,544 steps, 0.4 MB).
2. **What the terrain hides:** from each grid point, our code looks out in 180 directions across NASA LOLA elevation maps (40 m detail near the observer, 240 m out to 250 km). It records the highest terrain angle in each direction, allowing for the Moon's curvature. This gives a skyline for each grid point:
   - every 2 km over the south polar region
   - every 250 m around the Artemis candidate regions
   - every 0.25° across the whole Moon from LOLA's global map, plus a 1° grid for the heat maps
3. **In the browser:** a small JavaScript library combines the Sun and Earth positions with the skyline at the clicked spot. It computes visibility for all 17,544 hours in about 10 milliseconds, with no server and no internet connection needed.
4. **The 3D view:** a three.js globe with NASA LROC colour and LOLA relief. Terrain tiles from LOLA show crater walls and ridges, lit by the computed Sun direction: 40 m at the Artemis sites, 120 m at the Apollo sites and famous craters, and 474 m everywhere else.

**How we checked it (validity)**
- We compared our sunlight percentages with NASA's published LOLA south polar illumination map (Mazarico et al. 2011, Icarus 211) at **400 random points**, using the same definition and the same 18.6-year averaging period.
- On average we differ by **0.8 percentage points** (correlation **0.99**).
- We agree on all **37** points NASA marks as permanently shadowed.
- We also reproduce SPICE's Sun and Earth angles to within 0.01°.
- The known limits are written up in the repository, including how fast sunlight changes on ridge tops and the effect of observer height.

**Benefits**
- **Mission planners** can compare candidate sites and dates in seconds, with the uncertainty stated plainly.
- **Teachers and the public** can see why the lunar south pole is both attractive and hard: peaks with months of sunlight sit next to craters that have not seen the Sun for billions of years.
- **No server:** everything is precomputed and runs in the browser, so it works in a classroom with poor internet.

**What we hope to achieve**
- An easy, trustworthy way to ask "when and where would a lander have sunlight and a line to Earth?", with the uncertainty stated plainly.
- The pipeline is open and fast: the whole Moon builds in seconds and the south polar grid in under a minute. Others can therefore extend it to other date ranges, finer grids, or rover routes.

**Tools**
- **Python:** NumPy, SpiceyPy (NASA NAIF CSPICE) and Pillow.
- **JavaScript:** three.js, with no framework.
- **Fonts:** Open Sans.
- **Hosting:** GitHub Pages (static files, no server).

## Use of Super Intelligence (SI)
*(For data collection only; judges don't see this field.)*

[TEAM: confirm this is accurate before submitting.]

Yes. Each team member worked with an AI coding assistant, used as a tool under the team's direction:
- **Hariyank Suvarna:** Claude (Claude Code) for the data engine, the browser maths library, wording and documentation.
- **Abdullah Khan:** Codex (OpenAI) for the 3D viewer.
- **Alessandro Savastano:** Claude Code for the web app.

[TEAM: state truthfully how the idea and the approach were developed. The rules say SI should not be used to come up with the idea itself.]

**What the assistants did:**
- They wrote code, ran checks and drafted text.
- The team chose the data sources, set the scope and design rules, and reviewed the results.
- The team validated the science output against NASA's published illumination map rather than trusting the AI.

**Where this is acknowledged:**
- AI-assisted code and data are acknowledged in the repository README ("Use of AI"), in `CREDITS.md`, and in a header line at the top of the main code files.
- Commits made with an assistant carry a co-author line.
- No SI-generated images, video or audio are used in the app or demo. [TEAM: if any are added, they need a visible watermark.]

## NASA Data
- **LRO LOLA elevation maps** (PDS Geosciences Node):
  - LDEM_80S_40M and LDEM_75S_240M: south polar terrain, horizons and 3D tiles
  - LDEM_16 and LDEM_64: whole-Moon horizons and 474 m terrain; LDEM_256 for the 120 m Apollo and crater regions
  - https://pds-geosciences.wustl.edu/missions/lro/lola.htm
- **LOLA polar illumination map AVGVISIB_85S_060M** (NASA GSFC PGDA product 69; Mazarico et al. 2011), used for validation. https://pgda.gsfc.nasa.gov/products/69
- **JPL NAIF SPICE generic kernels:** DE440 ephemeris (de440s.bsp), lunar orientation (moon_pa_de440_200625.bpc, moon_de440_250416.tf), pck00011.tpc and naif0012.tls. https://naif.jpl.nasa.gov/naif/data_generic.html
- **NASA SVS CGI Moon Kit** (LROC colour mosaic and LOLA displacement map) for the 3D globe. https://svs.gsfc.nasa.gov/4720
- **NASA Artemis III candidate landing regions** (Oct 2024 update). https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/

## Space Agency Partner Data and Other References
**Space Agency Partner data:** none used.

**Other data and references**
- IAU/USGS Gazetteer of Planetary Nomenclature: crater and mountain coordinates. https://planetarynames.wr.usgs.gov/
- Mazarico, E., et al. (2011). Illumination conditions of the lunar polar regions using LOLA topography. *Icarus* 211, 1066–1081. doi:10.1016/j.icarus.2010.10.030
- Representative landing points in Artemis regions: "Evaluating potential landing sites for the Artemis III mission using a multi-criteria decision making approach", arXiv:2406.19863. https://arxiv.org/abs/2406.19863
- LPSC 2024 abstract #1695 (Connecting Ridge point). https://www.hou.usra.edu/meetings/lpsc2024/pdf/1695.pdf

**Software:** SpiceyPy (MIT), NumPy (BSD), Pillow (MIT-CMU), three.js (MIT), Open Sans font (SIL OFL).

- Apollo 11 photograph AS11-40-5903 (NASA, public domain) on the landing page.

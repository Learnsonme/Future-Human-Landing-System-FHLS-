# FHLS lunar viewer

T1's standalone Three.js ES module. Serve the repository root (no build step):

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open <http://127.0.0.1:8765/viewer/demo.html>. Keep `viewer/`, `core/`, and
`data/` beside one another. The local HTTP server serves files only; all
astronomy and rendering run in the browser. Internet access is unnecessary.
Opening `demo.html` with `file://` does not support module/data fetching.

```js
import { createViewer } from '../viewer/index.js';

// The host needs a nonzero width and height, e.g. height: 600px.
const viewer = createViewer(document.getElementById('viewer-slot'), {
  presentation: false, // omit for the rotating intro and Start button
});
await viewer.ready;
const unsubscribe = viewer.onPick((lat, lon) => {
  viewer.flyTo(lat, lon).catch(console.error);
  // Pass these same coordinates to your core/results panel.
});
await viewer.flyTo(-89.45, -137.3);
viewer.setTime('2027-01-15T12:00:00Z');
// When unmounting:
unsubscribe();
viewer.dispose();
```

Coordinates use planetocentric degrees in MOON_ME, longitude positive east.
`onPick` reports a selection; the host decides when to call `flyTo`.
`ready` rejects on essential asset/WebGL failures. Navigation waits for it.

## API for T2

| Method / property | Behavior |
|---|---|
| `createViewer(container, options?)` | Mounts immediately and returns one independent viewer. Container must be an HTMLElement. |
| `ready` | Promise resolving after local assets, core and renderer initialize; rejects on essential asset/WebGL errors. |
| `onPick((lat, lon) => …)` | Registers a callback and returns an unsubscribe function. A click or tap on terrain/globe emits coordinates. Drag, wheel, pinch and empty space do not. |
| `flyTo(lat, lon)` | Promise resolving `{cancelled:false}` at arrival or `{cancelled:true}` if superseded, interrupted or disposed. Invalid locations reject. |
| `setTime(utcString)` | Accepts a valid ISO UTC string ending in `Z`, within 2027-01-01 00:00 through 2028-12-31 23:00. Selects the nearest hourly sample and returns its ISO string. Invalid/out-of-range inputs throw. No real-time astronomy request occurs. |
| `onStatus(callback)` | Immediately sends a status snapshot, then updates; returns an unsubscribe function. |
| `getStatus()` | Snapshot: `phase`, `message`, `time`, `lighting`, `terrain`, `synthetic`, `exaggeration`. |
| `start()` | Hides Start and stops intro rotation. `flyTo` and direct interaction also start exploration. |
| `overview()` | Returns to the whole Moon and clears selection. |
| `setVerticalExaggeration(value)` | Visual terrain scale: `1`, `1.25`, or `1.5`; default `1`. Does not change scientific core results. |
| `getDiagnostics()` | Camera, selection, actual light direction, shadows, renderer memory/frame count, active flight duration and disposal state for debugging. |
| `dispose()` | Idempotent unmount: cancels flights/animation, aborts viewer fetches, disconnects observer/listeners, disposes controls, GPU geometries/materials/textures/shadows and renderer, and removes the viewer DOM. Call when the host unmounts. |

Options are `presentation` (default `true`), `time` (default
`2027-01-15T12:00:00Z`), `dataBase` (default `../data/`, relative to
`viewer/index.js`, or an absolute URL), and `core` (an already-loaded core or
Promise for one). Sharing T2's loaded core avoids a duplicate ephemeris fetch:

```js
const viewer = createViewer(host, { presentation: false, core });
viewer.setTime(new Date(core.timeOf(hour)).toISOString());
```

Call `setTime` when the app's hour changes. A pick does not call core analysis
or change modes; the host owns those actions. Latitude is −90…90°, longitude
is normalized to [−180,180); exact poles use longitude 0. Mount into a visible
host or let the built-in ResizeObserver resize it when it becomes visible.
Only the contents appended by this viewer are removed during disposal.

`lighting` is `ephemeris`, `synthetic`, or `fixed-development` after loading.
`synthetic:false` identifies real ephemeris lighting; the development fallback
and injected synthetic cores carry `synthetic:true` and visible labels.
`terrain` is `LOLA-overview-480m`, `LOLA-120m` (south or north cap), `LOLA-40m`
(Artemis site), `LOLA-474m` (anywhere else on the Moon), `global-lower-precision`,
`overview-only`, or `unavailable`.
`phase` includes `loading`, `loading-terrain`, `ready`, `error` and `context-lost`.
Keep the viewer's status visible so fallback/error information reaches users.

## Detailed terrain everywhere (V8, T3)

The viewer loads only the tiles around a click. It picks the finest terrain available there:

| Where | Tiles | Spacing | Status |
|---|---|---|---|
| Artemis sites (inside the 20 km boxes) | `data/terrain/index_detail.json`, lod 2 | 40 m | `LOLA-40m` |
| South cap (≤ −84°) | `index.json`, four nearest lod 1 | 120 m | `LOLA-120m` |
| North cap (≥ 84°) | `index_north.json`, four nearest lod 1 | 120 m | `LOLA-120m` |
| Apollo sites, Tycho, Copernicus, Aristarchus (12° boxes) | `index_regions.json`, the 4 nearest 2° tiles (lod 2), with 474 m around them | 118 m | `LOLA-120m` |
| Everywhere else | `index_global.json`, the 2 × 2 block of 8° tiles nearest the click (≈ 480 km) | 474 m | `LOLA-474m` |

**How the layers fit together**
- **The globe mesh is exactly 1° × 1°,** so its vertices are exact grid points of the 8° tiles. After a load, the globe re-samples its heights from the detailed terrain and hides its own surface under the patch. The patch therefore meets the globe without a step. Skirts (4 km) remain at the patch edge as a safety net.
- **Neighbouring whole-Moon tiles join exactly,** including across the ±180° date line.
- **Skirts are shaded like the ground they hang from** (surface normals are copied), so a crack never shows a lit vertical wall.
- **Shadow maps are sized to the detail:** an 80 km half-size for the 120 m regions and 40 m tiles (about 78 m per shadow pixel), 160 km for the polar caps, 320 km for the 474 m patch.
- **40 m tiles have no skirts.** The 120 m surface continues under their edge strip, and they win it by polygon offset. This avoids lit vertical skirts under the grazing polar Sun.
- **Tests:** `tests/terrain-v8.test.mjs` (Node) checks registration, outward faces, seams, cap clipping and priority for the new tile sets. `tests/v8-browser.mjs` (plain Chrome DevTools, no Playwright) flies to six places and checks the terrain type, timing, reduced motion and console errors.

**Space → terrain handover (M1)**
- **The flight starts at the click** (1–3 ms) and lasts 1.8 s. Tiles load during it.
- **The new detail fades in over 540 ms** from 35% of the flight, or as soon as it arrives if that is later. It is drawn on top of a whole globe and overview, with a polygon offset. Once opaque, the coarse surface under it is cut away. Nothing pops.
- **Reduced motion:** an instant cut, with no fade.
- **Cancellation:** a cancelled or superseded flight finishes the fade at once, so no transparent terrain is left behind.

**Landing Moon (M2, M3)**
- **No box:** the presentation viewer's canvas is transparent and carries no stars of its own, so the page's starfield shows around the Moon. The explorer stays opaque with its own stars.
- **First frame:** the presentation viewer shows `assets/moon-poster.webp` (22 KB, the same view, transparent) straight away. It crossfades to the live globe within 300 ms of the first rendered frame, or instantly under reduced motion.
- **Terrain no longer delays the first frame:** LOLA cap terrain streams in afterwards.
- **Regenerating the poster:** if the landing time, camera or imagery changes, run `node viewer/tools/make-poster.mjs` against the static server.

## Terrain, lighting and limits

- South of and including 84°S, the real 16-bit PNG terrain is decoded numerically
  with all PNG filters supported. Height = `min_m + DN/65535 × (max_m−min_m)`.
  Pixel `(col,row)` is at `(x0 + col×spacing, y0 + size − row×spacing)`;
  grid-registered neighbors share their edge. Four nearby detail tiles load per
  selection. Every 120 m sample is rendered; overview data is 480 m sampling
  rendered with a 1.92 km mesh. Borders share canonical decoded heights; skirts
  cover LOD joins. Terrain uses neutral lunar grey, without an invented texture.
- Vertices are mapped through the contract's inverse polar stereographic
  projection onto the 1737.4 km sphere plus elevation. Both globe and terrain
  live in the same Moon-fixed scene: MOON_ME `[x,y,z]` → Three.js `[x,z,−y]`.
  `core.sunDirection(t)` uses this same transform. `sunDirectionPolar` would be
  appropriate for a flat tile scene; this scene retains lunar curvature.
- Outside the cap, global relief is real but coarse (4 pixels/degree source and
  a coarser globe mesh). The status labels it **lower precision** after selection.
- Local directional shadows use a 2048² map across a 320 km box, with a low
  ambient fill for inspection. Shadows and LOD joins illustrate relief; they
  are not the scientific horizon/visibility result. Finite resolution, shadow
  bias, partial tile coverage and exaggerated relief affect the image. T2 must
  use `core.analyze()` for quantitative results. Visibility does not guarantee
  power or a radio link.
- If ephemeris data fails, a fixed 1° Sun relative to the selected local horizon
  is clearly labeled development lighting. Time changes do not move that Sun.
  If terrain detail fails, the real overview remains; if the terrain manifest
  fails, the global LOLA displacement remains. Missing imagery/displacement or
  WebGL fails visibly instead of silently inventing a Moon.
- Requires a modern browser with WebGL2, native ES modules, fetch,
  DecompressionStream and ResizeObserver. Desktop Chrome and mobile viewport /
  touch emulation were tested. Physical mobile GPU and Safari/Firefox testing
  remain outstanding. Full detail may be expensive on low-end GPUs.
- The initial presentation camera sits 30° from the real Sun direction for the
  chosen time, showing the sunlit hemisphere (D6 F5). The Sun vector, light and
  Moon orientation are unchanged. Explorer mounts with `presentation:false`
  retain their original overview/picking frame.
- Intro rotation takes about one minute per turn. Flights take 1.2 s with the
  D5 `cubic-bezier(.4,0,.2,1)` easing. `prefers-reduced-motion` stops intro
  rotation without residual drift and applies the final flight pose directly,
  without waiting for an animation frame. Turning it on during a flight also
  cuts immediately to the destination.

T2 has committed `createViewer` integration in `web/app.js`, including picking,
fly-to and time updates. The home screen mounts the same viewer as a rotating
NASA-textured intro and disposes it when leaving for the mode picker. Integration
checks cover home rotation, reduced motion, mobile layout, Back/remount, and the
explorer's picking and time updates; see below.
Home is available on the mode picker and in the explorer's sticky toolbar.
Returning home disposes the explorer immediately, cancelling flights and terrain
requests; returning through Start creates one new explorer and restores the site
and time. Mode, site, hour and comparison pins stay in the app state. The mode
picker's Back button returns to the screen that opened it. The integration check
also covers five round trips, all three modes, keyboard focus, a 44 px mobile
Home target and cancellation during an animated flight.

## Bundled assets

NASA imagery credit: **NASA's Scientific Visualization Studio**, LRO / LROC / LOLA.
The [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) documents the colour map,
longitude registration and displacement conversion.

- `assets/moon-color-2k.jpg`: NASA `lroc_color_2k.jpg`, 2048 × 1024,
  0°-centred LROC colour. This is a visual texture, not quantitative science data.
- `assets/moon-displacement.tiff`: lossless unsigned half-metre encoding of
  PDS LOLA `LDEM_4.IMG`, 1440 × 720, converted by
  `tools/prepare-displacement.py` using the CGI Moon Kit convention.
  Height = sample × 0.5 − 10000 metres above the 1737.4 km reference sphere.
  The original 0…360° columns are shifted to −180…180° without resampling.
  [Original PDS product directory](https://pds-geosciences.wustl.edu/lro/lro-l-lola-4-gdr-v1/lrolol_1001/data/ldem_4/).
- `assets/open-sans.woff2`: local Open Sans variable font (latin, weights 300–800),
  SIL Open Font License in `assets/OFL-open-sans.txt`.
- `vendor/three.module.js` and `vendor/OrbitControls.js`: Three.js r170,
  MIT license in `vendor/THREE-LICENSE.txt`; OrbitControls imports the local module.
- `../data/terrain/`: T3's real LOLA heightmaps, not duplicated here.
- `../data/ephemeris.{json,bin}` and `../core/fhls-core.js`: T3's scientific Sun.

The viewer performs no CDN or external API requests. The starfield is decorative
and does not represent catalogue star positions.

## Checks

With Node 22 or later:

```sh
node --test viewer/tests/numerics.test.mjs
```

The browser check requires Playwright and Chrome, installed outside this repo:

```sh
export FHLS_PLAYWRIGHT=/absolute/path/to/playwright/index.mjs
export FHLS_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node viewer/tests/browser.mjs
node viewer/tests/lighting.mjs
node viewer/tests/lifecycle.mjs
node viewer/tests/integration.mjs
node viewer/tests/home-acceptance.mjs
node viewer/tests/site-home-acceptance.mjs
```

Run the static server first. `FHLS_TEST_URL` overrides its default
`http://127.0.0.1:8765`. Screenshots go to `/private/tmp/fhls-viewer-tests/`.
The integration check reads the actual `web/` app; it does not
modify T2's files.
`home-acceptance.mjs` isolates the viewer's F5 viewpoint, lifecycle and native
reduced-motion behavior, including an instant cut with animation frames disabled.
`site-home-acceptance.mjs` checks the actual app against Home acceptance rows
B1–B6, D2/D3 and E at verified 1440×900 and 390×844 viewports. It records frame
rates and canvas counts, and writes JSON evidence beside the screenshots.

## AI assistance

V8, M1, M2 and M3 (detailed terrain everywhere, the handover, the landing blend and the poster) were written by T3 with Claude (Anthropic), after T1 handed the viewer over.

T1 used OpenAI Codex to continue implementation, debug, document and test the
viewer. NASA imagery, LOLA elevations and T3's SPICE ephemeris are source data;
they were not generated by the assistant. Human/team review remains required
for mission interpretation and submission.

Validation: eleven numerical tests, the core SPICE-reference checks, the full
Chrome viewer suite, lighting/fallback tests, lifecycle/error tests and the
committed T2 app integration check passed on 14 November 2026. Desktop,
390 px mobile viewport, touch input and reduced-motion paths were exercised;
real-data demo and integration runs made no external network requests.

### The real Sun and Earth in the sky (explorer)

**How they're drawn**
- With `presentation: false`, the viewer draws the Sun and Earth at their true directions from the camera, for the current `setTime` hour, using `core.bodyPositions(t)`.
- They are true to size: the Sun is 0.53° across and Earth about 1.9°. They sit just inside the far plane, so terrain and the Moon's limb hide them correctly.
- Earth is a sphere lit by the scene's Sun, so it shows its real phase.

**Labels**
- Small labels read "Sun" and "Earth".
- With a site selected, a body the site's skyline (from `core.getHorizon`) hides, or that is below the horizon, is not drawn at all, so no globe pokes out from behind the terrain.

**Look-at buttons**
- "Look at Sun" and "Look at Earth" appear at the top right once a site is selected. They swing the camera in 0.9 s, or instantly under reduced motion, to face that body from 20 km behind the site and 4 km up.
- For a low polar Sun or Earth, the site's skyline fills the lower half of the view.
- The same action is available as `viewer.lookAt('sun' | 'earth')`.
- **If the body can't be seen** from the selected site at that hour (below the horizon, or behind the terrain according to the site's skyline), the camera does not point into the ground. A note says, for example, "Earth is not in sight from this area right now: it is below the horizon". The camera keeps its current angle. The same note appears if time moves the body out of sight while you are facing it.
- **While facing a body,** if `setTime` (the slider or Play) moves it out of sight, the same note appears and the view returns to normal. Dragging the view or picking a new site ends "looking at".

### Heat-map overlay (P9)

`viewer.setOverlay(imageOrCanvas, { projection: 'polar_stereographic_south', x0_km, y0_km, size_km, opacity = 0.6 })` drapes an image over the south polar terrain. `size_km` is a number, or `[width, height]`.
- **Placement:** image row 0 is the max-y edge, on the same polar stereographic map as `data/terrain` and `data/heatmap`. The image covers `x0_km … x0_km + width` and `y0_km … y0_km + height`.
- **Blending:** done in the terrain shaders after lighting. The map colour reads the same in sunlight and in shadow, and `1 − opacity` of the lit relief shows through.
- **Removing it:** `viewer.clearOverlay()` removes it. The texture is disposed with the viewer.
- **Used by:** `web/components/heatmap-control.js` (S10).

### Comparison markers (M4)

`viewer.addMarker(id, lat, lon, label)` adds or replaces a pin, where `id` is a
nonempty string and `label` is 1, 2, or 3 (number or string). At most three IDs
may exist. Coordinates use the same planetocentric, east-positive degrees as
`flyTo`. Calls are allowed before `ready`; pins appear when the scene renders.
`viewer.removeMarker(id)` removes it and returns whether it existed.
`viewer.setActiveMarker(id)` optionally highlights that pin in `--sun`; pass
`null` to clear. Other pins use `--text`. Re-add an ID to renumber it.

Pins are 12 px rings with 1.5 px strokes and 11 px Open Sans numbers, at a
constant screen size on the globe and terrain. Labels behind the Moon, offscreen,
or occluded by sampled local relief are hidden. Occlusion is illustrative,
not a scientific visibility result. They create no additional canvas.
Disposal removes pins. The web owner retains pin state and re-adds pins after
Home or a mode change creates a new viewer; the viewer does not store app state.

### Whole-Moon overlay (P10)
`viewer.setGlobalOverlay(image, { lat_min, lat_max, lon_min, lon_max, opacity = 0.6 })` drapes an
equirectangular image (row 0 = north, column 0 = `lon_min`) over the whole globe and every terrain
patch; the extents are the image's outer edges in degrees. The south polar overlay from `setOverlay`
wins wherever it covers. `viewer.clearGlobalOverlay()` removes it. Both are applied in the same shader
step, after lighting.

### Selected-spot lander (S16)
`viewer.showLander(lat, lon, label?)` puts a small lunar-lander glyph (our own 24 px SVG: `--text`
outline, `--sun` descent stage and window) with its feet on that spot, with an optional label below
it (site name or "Picked point"). There is one lander: a new call moves it and replays a single
≤ 400 ms touchdown (drop of 8 px + fade; none under reduced motion). `viewer.clearLander()` removes it,
and so does `overview()` and disposal. It keeps a constant screen size, sits above the numbered pins,
and is hidden only when the spot is round the far side of the Moon or off screen, never by terrain.
`getDiagnostics().lander` reports `{ lat, lon, label, visible }` or `null`.

### T1 polish: camera, terrain loading and rendering

Fly-to retains the 1.8 s design easing and has no fixed-altitude jump when
starting close to the surface. Site zoom ranges from 2 km to three lunar radii
from the target; the overview limit fits the whole Moon to the narrower canvas
dimension, with a minimum cap of four radii. A separate local relief
check keeps the camera at least 500 m above sampled terrain.

`flyTo()` resolves on camera arrival. Terrain streams independently: use
`onStatus()` and wait for `phase === 'ready'` to observe loading completion.
The viewer exposes `aria-busy` while nearby terrain loads. If some tiles fail,
successful coarser tiles remain; any uncovered area uses overview/global relief.
A complete failure fills the previous globe cutouts again, and a later fly-to
retries failed tiles. Status text identifies the reduced terrain precision.

Device pixel ratio is capped at 2. Hidden tabs stop the viewer's animation-frame
requests and pause active flight/fade clocks. Static scenes skip GPU draws;
camera input, date changes, markers and overlays invalidate the view. Reduced
motion keeps the home Moon static and cuts fly-to instantly, including live
preference changes. Disposal clears pending frames, poster timers and cached
sampling references.

Polish verification (serve the repository root on port 8765):

- `node --test viewer/tests/numerics.test.mjs viewer/tests/terrain-v8.test.mjs`
- `node viewer/tests/polish.mjs` — 375 px touch, zoom, idle/hidden rendering and tile failures.
- `node viewer/tests/landing-polish.mjs` — early poster, stats strip and shooting-star text masking.
- `node viewer/tests/integration.mjs` — real website, modes, picking, Home/state, console and HTTP errors.

Browser scripts accept `FHLS_PLAYWRIGHT` pointing to an installed Playwright
module; no test dependencies or external services are needed by the demo.

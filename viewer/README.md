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
`terrain` is `LOLA-overview-480m`, `LOLA-120m`,
`global-lower-precision`, `overview-only`, or `unavailable`.
`phase` includes `loading`, `loading-terrain`, `ready`, `error` and `context-lost`.
Keep the viewer's status visible so fallback/error information reaches users.

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
- `assets/plex-sans.woff2`, `assets/plex-mono.woff2`: local IBM Plex fonts;
  SIL Open Font License files accompany them.
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

T1 used OpenAI Codex to continue implementation, debug, document and test the
viewer. NASA imagery, LOLA elevations and T3's SPICE ephemeris are source data;
they were not generated by the assistant. Human/team review remains required
for mission interpretation and submission.

Validation: eleven numerical tests, the core SPICE-reference checks, the full
Chrome viewer suite, lighting/fallback tests, lifecycle/error tests and the
committed T2 app integration check passed on 14 November 2026. Desktop,
390 px mobile viewport, touch input and reduced-motion paths were exercised;
real-data demo and integration runs made no external network requests.

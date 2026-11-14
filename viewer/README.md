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
`ready` rejects on essential asset/WebGL failures. Await it before navigation.
Detailed API, limitations and final validation are being completed in V2–V6.

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
FHLS_PLAYWRIGHT=/absolute/path/to/playwright/index.mjs \
FHLS_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node viewer/tests/browser.mjs
```

Run the static server first. `FHLS_TEST_URL` overrides its default
`http://127.0.0.1:8765`. Screenshots go to `/private/tmp/fhls-viewer-tests/`.

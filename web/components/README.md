# web/components

Standalone pieces the rest of `web/` mounts. No astronomy inside: they take
numbers and draw them. Colours come from the `--sun`, `--earth`, `--terrain`,
`--line`, `--muted`, `--text` and `--surface` custom properties in scope, so
they follow `design/style.md` wherever they are used.

## horizon-panorama.js

The skyline around a site, with where the Sun and Earth travel across it.
Azimuth runs left to right over the full circle; elevation is the vertical axis.

```js
import { drawHorizonPanorama } from "./components/horizon-panorama.js";

const r = await core.analyze(lat, lon);           // core/fhls-core.js
drawHorizonPanorama(document.getElementById("panorama-canvas"), {
  horizon: r.horizon,                              // { values, az_step_deg }
  tracks: [
    { points: sunPoints,   tone: "sun" },          // [{ az, el }, …]
    { points: earthPoints, tone: "earth" },
  ],
  markers: [
    { az: r.sun_az[i],   el: r.sun_el[i],   tone: "sun" },
    { az: r.earth_az[i], el: r.earth_el[i], tone: "earth" },
  ],
  height: 220,                                     // optional, CSS pixels
});
```

Returns `false` and draws nothing if the canvas has no width yet — mount it in
a visible container, or call again once the container is shown. Redraw on
resize; it sizes itself to the parent and handles device pixel ratio.

`horizonAtAzimuth(values, azStep, az)` is exported too: the skyline elevation
at any azimuth, interpolated between bins and wrapping past 360°.

Reading it: where a coloured track sits **below** the silhouette, that body is
behind terrain at that moment — the picture of why a site with the Sun above
the horizon can still be dark.

## starfield.js

The ambient sky behind the whole app. One canvas, at most 150 stars, redrawn at
24fps, paused when the tab is hidden, painted once and left static under
`prefers-reduced-motion`.

```js
import { createStarfield } from "./components/starfield.js";
const sky = createStarfield(document.getElementById("sky"));
sky.setDensity("landing");     // landing | beginner | intermediate | advanced
sky.destroy();                 // removes its listeners
```

Density, twinkle rate, brightness and how often a shooting star appears change
per profile; hue never does. `landing` is the fullest sky and is used on the
home screen whatever mode is remembered, so the page does not read as empty
beside the viewer's own starfield inside the Moon canvas. Stars are drawn from `--text` and `--muted` at low alpha, with
about one in twelve in `--sun`.

## star-transition.js

The screen change, as a supernova: the star collapses, detonates across the
whole viewport with a shockwave, light spikes and an ember burst, and the next
screen is swapped in under the flash.

```js
import { createStarTransition } from "./components/star-transition.js";
const fx = createStarTransition(document.getElementById("transition"));
await fx.play(() => showNextScreen());
```

950 ms, with the swap at 380 ms. One canvas, drawn only while running and
cleared afterwards, so it costs nothing at rest. Only `--text` and `--sun` are
used: `--earth` and `--both` mean power and comms everywhere else in the app
and must not be spent on decoration. Under `prefers-reduced-motion` the swap
runs immediately and nothing is drawn. Needs the `.startx` rules in
`web/app.css`.

## time-player.js (S9, T3)
`createTimePlayer(mountEl, { getHour, setHour, lastHour, loop = true, speed = 12 })` adds Play/Pause and a speed choice (1 h/s, ½ day/s, 1 day/s, 1 week/s). It is mounted once, on the timeline. It moves the app's hour about 15 times a second, so the timeline marker, the 3D lighting, the Sun, Earth and the panorama all move together. It **cycles**: after the end of 2028 it carries on from 1 Jan 2027. It never starts by itself, and it stops when its panel is hidden.

## horizon-panorama.js additions (S9, T3)
These options are optional and backward compatible:
- `tracks[].fade`: a fading trail, with older points drawn fainter.
- `markers[].blocked`: the body is behind terrain, drawn at 35% with a dashed outline.
- `markers[].label`: small text beside the marker, as used in Beginner ("Sun · visible").

## heatmap.js · heatmap-control.js · heatmap.css (S10, T3)
- **heatmap.js** loads `data/heatmap/` and builds the coloured overlay canvas. Its `valueAt(lat, lon, layer, month)` returns the exact stored value.
- **heatmap-control.js** provides `mountHeatmapControl(stage, { mode })`, with `.attach(viewer)` and `.setMode(mode)`. It gives the per-mode "Map" control over the 3D view and uses `viewer.setOverlay` (P9).

## panorama-slider.js (S11, T3)
`createPanoramaSlider(mountEl, { lastHour, timeOf, getTimelineHour, onChange })` gives the horizon panorama its **own** time slider, independent of the main timeline.
- **What it moves:** only the panorama's Sun and Earth. The main hour, the 3D view and the results panel stay put.
- **Starting point:** when a site is chosen, it starts at the timeline's hour.
- **"Match timeline"** copies the timeline's hour into it, and is only shown when the two differ.
- **Keyboard:** the arrow keys step it one hour at a time.

## theme.js (M13)

`createThemeToggle(host)` mounts the fixed 44 px touch target with a 32 px face.
The inline theme bootstrap in `web/index.html` sets the initial tokens before
CSS paints. The system preference stays live until a manual choice is saved as
`fhls.theme`; storage failures are harmless. The component emits
`fhls:themebeforechange` / `fhls:themechange` so `app.js` can crossfade old chart
bitmaps and redraw using the new tokens without changing any data or allocating
new canvases. Space, the loading intro and logo credits retain their dark tokens.
The toggle avoids badge overlays, stays available in full screen, and the pin
layout reserves room for it on narrower screens.

## text-entrance.js (M14)

`createTextEntrances().enter(root, key)` animates text only on the first visible
entry of that root/key. The app uses a key per result mode so switching modes can
introduce their different wording, while hour changes and chart redraws remain
static. Six-pixel inward motion uses D5's easing; three 50 ms stagger groups keep
the whole entrance within 480 ms. Numeric table cells and 3D content are excluded.
Reduced motion skips/cancels effects and consumes the entry, avoiding a surprise
animation when the preference changes back.

## Pin synchronization (M8)

`app.js` assigns stable IDs to pins, then reconciles `addMarker`, `removeMarker`
and `setActiveMarker` with each new explorer. Removing a card renumbers the
remaining markers/cards without changing their IDs. The retained pin list restores
them after Home or a mode change. Clearing the current site preserves comparison
pins; clearing the pin list removes both cards and markers.

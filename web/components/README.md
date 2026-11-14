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

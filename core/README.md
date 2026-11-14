# core/fhls-core.js

The browser maths library for FHLS. It is an ES module with no dependencies. Never write your own astronomy; call this instead.

```js
import { loadCore } from "../core/fhls-core.js";
const core = await loadCore("../data");            // URL of the data/ folder
```

| Call | Returns |
|---|---|
| `core.at(lat, lon, t)` | `{ index, time, sun:{az,el}, earth:{az,el} }`. Angles only, no terrain. Synchronous. |
| `await core.analyze(lat, lon, {start, end})` | Per-hour typed arrays `sun_az, sun_el, earth_az, earth_el, sun_fraction, power, comms, both`, plus `summary`, `windows`, `precision` and `horizon`. The default range is all of 2027–2028. Takes about 10 ms. |
| `await core.getHorizon(lat, lon)` | `{ values (deg per azimuth bin), az_step_deg, precision, grid_id, point }`. Use this for the horizon panorama. |
| `core.sunDirection(t)` | A unit Sun vector in MOON_ME. Use it to light the globe. |
| `core.sunDirectionPolar(lat, lon, t)` | A unit Sun vector in the **terrain tile frame** (x, y = polar stereographic axes; z = up). Use it to light the terrain mesh. South tiles are used for lat < 0 and north tiles for lat ≥ 0. |
| `core.indexOf(t)` / `core.timeOf(i)` | Converts between a time and an hour index. `t` can be a `Date`, an ISO string, a millisecond value or an hour index. |
| `latLonToPolar(lat, lon, pole)`, `polarToLatLon(x, y, pole)` | Polar stereographic x and y in km. `pole` is `"south"` (the default) or `"north"`. This is the same projection as the `data/terrain` and `data/horizon` files. |

**What the results contain**
- `summary` has five fields: `{ pct_sunlit, pct_earth, pct_both, longest_dark_hours, longest_no_comms_hours }`.
- Each entry in `windows.power`, `windows.comms` and `windows.both` is `{ start, end, hours }`. `start` and `end` are hour offsets from `result.start_index`, and `end` is exclusive.
- `precision` is `"high"` when a south polar grid covers the click. It is `"low"` elsewhere, and the UI must then show the "lower precision" label. Near the poles, the 2 km polar grids are used (south_2km, north_2km), plus 250 m boxes around the Artemis sites. Everywhere else, the finest whole-Moon grid is used: `global_fine` (0.25°, about 7.5 km) when present, otherwise `global_coarse` (1°). If no horizon data can be loaded at all, the horizon is treated as flat.

**Definitions** (from DATA_CONTRACT §5)
- `power` means more than half of the Sun's disc is above the terrain.
- `comms` means the centre of Earth is above the terrain.
- Visibility does **not** guarantee power or a radio link, and UI text must not claim that it does.

The test is `node core/test.mjs`.

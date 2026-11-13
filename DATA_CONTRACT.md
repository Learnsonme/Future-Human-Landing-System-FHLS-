# Data contract (engine → core → web/viewer)
The shared language between agents. **Change only with team agreement (log it in LOG.md).**
All angles in degrees. Azimuth: 0 = north, clockwise. Elevation: above the **flat** local horizon.
Moon radius R = 1737.4 km. Frame: SPICE `MOON_ME`. Time: UTC.

## 1. `data/ephemeris.json` + `data/ephemeris.bin`: where the Sun and Earth are (whole Moon)
`ephemeris.json`:
```json
{ "start_utc": "2027-01-01T00:00:00Z", "step_hours": 1, "count": 17544,
  "frame": "MOON_ME", "units": "km", "abcorr": "LT+S",
  "layout": "float32 little-endian, per step: sun_x, sun_y, sun_z, earth_x, earth_y, earth_z",
  "synthetic": false }
```
- Vectors are **from the Moon's centre**, in km. The browser subtracts the site position itself (Earth parallax can reach ~0.3°, so this matters).
- Size: 17,544 × 6 × 4 bytes ≈ 0.4 MB.

## 2. `data/horizon/`: terrain skyline grids
`data/horizon/index.json`:
```json
{ "grids": [
  { "id": "south_2km", "projection": "polar_stereographic_south", "R_km": 1737.4,
    "x0_km": -180, "y0_km": -180, "spacing_km": 2, "nx": 181, "ny": 181,
    "n_az": 180, "az_step_deg": 2, "scale": 0.01, "nodata": -32768,
    "tile_size": 32, "tiles": "south_2km/{tx}_{ty}.bin" },
  { "id": "south_fine", "...": "same fields, spacing_km 0.25–0.5, only over Artemis candidate regions" },
  { "id": "global_coarse", "projection": "equirectangular", "lat0": -90, "lon0": -180,
    "step_deg": 1, "nx": 360, "ny": 181, "n_az": 72, "az_step_deg": 5, "scale": 0.01,
    "file": "global_coarse.bin", "precision": "low" }
]}
```
- Each `.bin`: **int16 little-endian**, layout `[point][azimuth]`, value × `scale` = horizon elevation in degrees (can be negative, e.g. looking into a crater from its rim).
- Points inside a tile are row-major (y then x).
- **Lookup rule:** use the finest grid that covers the click; take the nearest grid point.
- Polar stereographic (south): `rho = 2R·tan((90° + lat)/2)`, `x = rho·sin(lon)`, `y = rho·cos(lon)` (lat negative). Inverse is in `core/fhls-core.js`.

## 3. `data/terrain/`: 3D terrain for the viewer
- `data/terrain/index.json` lists tiles: `{ "id", "projection", "x0_km", "y0_km", "size_km", "px", "min_m", "max_m", "file" }`.
- Each tile: **16-bit grayscale PNG** heightmap; height_m = min_m + value/65535 × (max_m − min_m).
- South polar tiles at roughly 100–250 m/px for flying in. Whole-Moon relief comes from the CGI Moon Kit displacement map (viewer loads it directly).

## 4. `data/sites.json`: named places (labels and pins, NOT a limit)
```json
[ { "id": "shackleton_rim", "name": "Shackleton Rim", "lat": -89.45, "lon": -137.3,
    "type": "artemis_candidate_region", "source": "<url>" } ]
```

## 5. Results (computed in the browser by `core/fhls-core.js`)
For a clicked lat/lon and each hourly step:
- `sun.az, sun.el, earth.az, earth.el` from ephemeris minus site position, in the local east-north-up frame.
- `horizon_el(az)` from the grid (linear interpolation between azimuth bins).
- `sun_visible_fraction`: fraction of the solar disc (radius 0.265°) above `horizon_el(sun.az)`.
- `power = sun_visible_fraction > 0.5`. `comms = earth.el > horizon_el(earth.az)`.
- Summary over the selected range: `pct_sunlit`, `pct_earth`, `pct_both`, `longest_dark_hours`, `longest_no_comms_hours`.
- Every result carries `precision: "high" | "low"` from the grid used.

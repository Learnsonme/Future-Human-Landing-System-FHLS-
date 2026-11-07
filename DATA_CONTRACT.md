# Data contract (engine → web)
This file is the shared language between agents. **Change it only with team agreement (log it in LOG.md).**

## Files
- `data/sites.json`: list of sites
- `data/<site_id>.json`: hourly timeline for one site

## data/sites.json
```json
[
  { "id": "shackleton_rim", "name": "Shackleton Rim", "lat": -89.45, "lon": -137.3,
    "elevation_m": 1800, "synthetic": false }
]
```

## data/<site_id>.json
```json
{
  "site_id": "shackleton_rim",
  "start_utc": "2027-01-01T00:00:00Z",
  "step_hours": 1,
  "horizon": [ { "az": 0, "el": 1.2 }, { "az": 1, "el": 1.4 } ],
  "samples": [
    {
      "t": "2027-01-01T00:00:00Z",
      "sun":   { "az": 123.4, "el": 1.8, "visible_fraction": 0.6 },
      "earth": { "az": 2.1,   "el": 4.5, "visible": true },
      "power": true,
      "comms": true
    }
  ],
  "summary": { "pct_sunlit": 72.5, "pct_earth": 61.0, "pct_both": 48.3, "longest_dark_hours": 110 },
  "synthetic": false
}
```

## Definitions
- `az`: azimuth in degrees, 0 = north, clockwise. `el`: elevation in degrees above the **flat** horizon.
- `horizon`: terrain horizon elevation for each azimuth (360 entries, 1° steps).
- `sun.visible_fraction`: 0–1, how much of the solar disc is above the terrain horizon.
- `power`: `visible_fraction > 0.5`. `comms`: Earth centre above the terrain horizon.
- All times are UTC, ISO 8601.

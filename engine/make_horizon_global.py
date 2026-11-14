# Part of FHLS (NASA Space Apps 2026). Written with AI assistance (Claude, Codex); designed, reviewed and tested by Team FHLS.
"""E8 + E10 · Whole-Moon horizon grids (LOW precision label) → data/horizon/

Run:  cd engine && python3 make_horizon_global.py coarse   global_coarse.bin (1°, LDEM_16, ~4 s)
      cd engine && python3 make_horizon_global.py fine     global_fine/ tiles (0.25°, LDEM_64, a few min)
Needs engine/dem/ldem_16.img and/or ldem_64.img (LOLA GDR) from
https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/

Same idea as horizon.py (look out in every direction, keep the highest terrain angle), but the
rays walk along great circles in 3D because an equirectangular map is not flat near the poles.
Grid point (ix, iy) is at lat = lat0 + iy·step_deg, lon = lon0 + ix·step_deg. 72 azimuths (5°).
global_coarse: one file, point index = iy·nx + ix.
global_fine:   tiles of tile_size × tile_size points, "global_fine/{tx}_{ty}.bin", edge tiles cut
               short (not padded), points row-major (iy then ix) inside a tile — same rule as the
               polar grids. Loaded one tile (~230 KB) per click.
Azimuth convention identical to core/fhls-core.js enuAxes(): east = z × up, north = up × east.
"""
import json
import os
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np

MOON_RADIUS_KM = 1737.4
OBSERVER_HEIGHT_M = 2.0
ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / "data" / "horizon"

COMMON = {"projection": "equirectangular", "lat0": -90, "lon0": -180, "n_az": 72, "az_step_deg": 5,
          "scale": 0.01, "nodata": -32768, "precision": "low", "observer_height_m": OBSERVER_HEIGHT_M,
          "synthetic": False}
CONFIGS = {
    "coarse": {
        "grid": {"id": "global_coarse", **COMMON, "step_deg": 1, "nx": 360, "ny": 181,
                 "file": "global_coarse.bin", "detail_km": 30, "max_distance_km": 150,
                 "point_order": "index = iy*nx + ix, lat = lat0 + iy*step_deg, lon = lon0 + ix*step_deg",
                 "source": "LOLA LDEM_16 (16 px/deg, ~1.9 km)"},
        "dem": ("ldem_16.img", 16),
        "steps": np.concatenate([np.arange(0.5, 10, 0.5), 10 * 1.03 ** np.arange(0, 200)]),
    },
    "fine": {
        "grid": {"id": "global_fine", **COMMON, "step_deg": 0.25, "nx": 1440, "ny": 721,
                 "tile_size": 40, "tiles": "global_fine/{tx}_{ty}.bin", "detail_km": 7.5,
                 "max_distance_km": 150,
                 "edge_tiles": "cut short (not padded): width = min(tile_size, nx - tile_size*tx)",
                 "point_order": "row-major within tile: iy (lat increasing) then ix (lon increasing)",
                 "source": "LOLA LDEM_64 (64 px/deg, ~474 m)"},
        "dem": ("ldem_64.img", 64),
        "steps": np.concatenate([np.arange(0.25, 10, 0.25), 10 * 1.02 ** np.arange(0, 300)]),
    },
}

_cfg = None
_dem = None


def setup(name):
    global _cfg, _dem
    _cfg = CONFIGS[name]
    _cfg["steps"] = _cfg["steps"][_cfg["steps"] <= _cfg["grid"]["max_distance_km"]]
    file, ppd = _cfg["dem"]
    # rows: line 0 = 90°N; columns: sample 0 starts at lon 0°E
    _dem = np.memmap(ROOT / "dem" / file, "<i2", "r", shape=(180 * ppd, 360 * ppd))


def height_m(lat, lon):
    """Bilinear height (m) on the global map; longitude wraps around."""
    ppd = _cfg["dem"][1]
    row = np.clip((90 - lat) * ppd - 0.5, 0, _dem.shape[0] - 1.001)
    col = (lon % 360) * ppd - 0.5
    r0, c0 = np.floor(row).astype(int), np.floor(col).astype(int)
    fr, fc = row - r0, col - c0
    c0 %= _dem.shape[1]
    c1 = (c0 + 1) % _dem.shape[1]
    top = _dem[r0, c0] * (1 - fc) + _dem[r0, c1] * fc
    bottom = _dem[r0 + 1, c0] * (1 - fc) + _dem[r0 + 1, c1] * fc
    return 0.5 * (top * (1 - fr) + bottom * fr)


def unit_vector(lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    return np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])


def horizon_at(lat, lon, n_azimuths=72):
    up = unit_vector(lat, lon)
    east = np.cross([0, 0, 1], up)
    east = np.array([0.0, 1.0, 0.0]) if np.linalg.norm(east) < 1e-9 else east / np.linalg.norm(east)
    north = np.cross(up, east)

    azimuths = np.radians(np.arange(n_azimuths) * 360 / n_azimuths)
    headings = np.outer(np.cos(azimuths), north) + np.outer(np.sin(azimuths), east)   # (az, 3)
    central_angle = _cfg["steps"] / MOON_RADIUS_KM                                      # (step,)
    # point on the great circle: up·cos(angle) + heading·sin(angle)
    points = (up[None, None, :] * np.cos(central_angle)[None, :, None]
              + headings[:, None, :] * np.sin(central_angle)[None, :, None])           # (az, step, 3)
    sample_lat = np.degrees(np.arcsin(np.clip(points[..., 2], -1, 1)))
    sample_lon = np.degrees(np.arctan2(points[..., 1], points[..., 0]))

    r_observer = MOON_RADIUS_KM + (float(height_m(lat, lon)) + OBSERVER_HEIGHT_M) / 1000
    r_terrain = MOON_RADIUS_KM + height_m(sample_lat, sample_lon) / 1000
    tan_elevation = (r_terrain * np.cos(central_angle) - r_observer) / (r_terrain * np.sin(central_angle))
    return np.degrees(np.arctan(tan_elevation.max(axis=1)))


def encode(values, g):
    return np.clip(np.round(np.asarray(values) / g["scale"]), -32767, 32767).astype("<i2")


def run_row(iy):                       # coarse: one latitude row
    g = _cfg["grid"]
    lat = g["lat0"] + iy * g["step_deg"]
    return iy, [horizon_at(lat, g["lon0"] + ix * g["step_deg"], g["n_az"]) for ix in range(g["nx"])]


def run_tile(job):                     # fine: one tile, written directly
    tx, ty = job
    g = _cfg["grid"]
    ts = g["tile_size"]
    rows = [horizon_at(g["lat0"] + iy * g["step_deg"], g["lon0"] + ix * g["step_deg"], g["n_az"])
            for iy in range(ts * ty, min(ts * (ty + 1), g["ny"]))
            for ix in range(ts * tx, min(ts * (tx + 1), g["nx"]))]
    encode(rows, g).tofile(OUT / g["tiles"].format(tx=tx, ty=ty))
    return len(rows)


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "coarse"
    setup(name)
    g = _cfg["grid"]
    t0 = time.time()
    with Pool(os.cpu_count(), initializer=setup, initargs=(name,)) as pool:
        if "tiles" in g:
            (OUT / g["id"]).mkdir(parents=True, exist_ok=True)
            ts = g["tile_size"]
            jobs = [(tx, ty) for ty in range(-(-g["ny"] // ts)) for tx in range(-(-g["nx"] // ts))]
            for i, _ in enumerate(pool.imap_unordered(run_tile, jobs), 1):
                if i % 50 == 0 or i == len(jobs):
                    print(f"[{time.time() - t0:5.0f}s] {i}/{len(jobs)} tiles", flush=True)
        else:
            out = np.zeros((g["ny"], g["nx"], g["n_az"]), "<i2")
            for iy, rows in pool.imap_unordered(run_row, range(g["ny"])):
                out[iy] = encode(rows, g)
            out.tofile(OUT / g["file"])

    idx_path = OUT / "index.json"
    index = json.loads(idx_path.read_text()) if idx_path.exists() else {"grids": []}
    index["grids"] = [x for x in index["grids"] if x["id"] != g["id"]] + [g]
    idx_path.write_text(json.dumps(index, indent=1) + "\n")
    print(f"{g['id']} done in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()

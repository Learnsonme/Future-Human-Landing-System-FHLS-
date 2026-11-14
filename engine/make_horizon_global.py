"""E8 · global_coarse horizon grid (whole Moon, LOW precision) → data/horizon/global_coarse.bin

Run:  cd engine && python3 make_horizon_global.py          (~a few minutes, all cores)
Needs engine/dem/ldem_16.img (LOLA GDR, 16 px/deg ≈ 1.9 km/px), from
https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/

Same idea as horizon.py (look out in every direction, keep the highest terrain angle), but the
rays walk along great circles in 3D because an equirectangular map is not flat near the poles.
Grid: 1° steps, lat −90…90 (iy), lon −180…179 (ix); point index = iy·360 + ix; 72 azimuths (5°).
Azimuth convention identical to core/fhls-core.js enuAxes(): east = z × up, north = up × east.
"""
import json
import os
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np

MOON_RADIUS_KM = 1737.4
OBSERVER_HEIGHT_M = 2.0
MAX_KM = 150.0                     # 1.9 km/px data: beyond this curvature hides the terrain anyway
DEM_FILE = Path(__file__).resolve().parent / "dem" / "ldem_16.img"
PX_PER_DEG = 16
OUT = Path(__file__).resolve().parent.parent / "data" / "horizon"
GRID = {"id": "global_coarse", "projection": "equirectangular", "lat0": -90, "lon0": -180,
        "step_deg": 1, "nx": 360, "ny": 181, "n_az": 72, "az_step_deg": 5, "scale": 0.01,
        "nodata": -32768, "file": "global_coarse.bin", "precision": "low",
        "point_order": "index = iy*nx + ix, lat = lat0 + iy*step_deg, lon = lon0 + ix*step_deg",
        "observer_height_m": OBSERVER_HEIGHT_M, "max_distance_km": MAX_KM,
        "source": "LOLA LDEM_16 (16 px/deg, ~1.9 km)", "synthetic": False}

STEP_DISTANCES_KM = np.concatenate([np.arange(0.5, 10, 0.5),
                                    10 * 1.03 ** np.arange(0, 200)])
STEP_DISTANCES_KM = STEP_DISTANCES_KM[STEP_DISTANCES_KM <= MAX_KM]

_dem = None


def dem():
    global _dem
    if _dem is None:            # rows: line 0 = 90°N; columns: sample 0 starts at lon 0°E
        _dem = np.fromfile(DEM_FILE, "<i2").reshape(180 * PX_PER_DEG, 360 * PX_PER_DEG)
    return _dem


def height_m(lat, lon):
    """Bilinear height (m) on the global map; longitude wraps around."""
    d = dem()
    row = np.clip((90 - lat) * PX_PER_DEG - 0.5, 0, d.shape[0] - 1.001)
    col = (lon % 360) * PX_PER_DEG - 0.5
    r0, c0 = np.floor(row).astype(int), np.floor(col).astype(int)
    fr, fc = row - r0, col - c0
    c0 %= d.shape[1]
    c1 = (c0 + 1) % d.shape[1]
    top = d[r0, c0] * (1 - fc) + d[r0, c1] * fc
    bottom = d[r0 + 1, c0] * (1 - fc) + d[r0 + 1, c1] * fc
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
    central_angle = STEP_DISTANCES_KM / MOON_RADIUS_KM                                 # (step,)
    # point on the great circle: up·cos(angle) + heading·sin(angle)
    points = (up[None, None, :] * np.cos(central_angle)[None, :, None]
              + headings[:, None, :] * np.sin(central_angle)[None, :, None])           # (az, step, 3)
    sample_lat = np.degrees(np.arcsin(np.clip(points[..., 2], -1, 1)))
    sample_lon = np.degrees(np.arctan2(points[..., 1], points[..., 0]))

    r_observer = MOON_RADIUS_KM + (float(height_m(lat, lon)) + OBSERVER_HEIGHT_M) / 1000
    r_terrain = MOON_RADIUS_KM + height_m(sample_lat, sample_lon) / 1000
    tan_elevation = (r_terrain * np.cos(central_angle) - r_observer) / (r_terrain * np.sin(central_angle))
    return np.degrees(np.arctan(tan_elevation.max(axis=1)))


def run_row(iy):
    lat = GRID["lat0"] + iy * GRID["step_deg"]
    return iy, np.array([horizon_at(lat, GRID["lon0"] + ix * GRID["step_deg"], GRID["n_az"])
                         for ix in range(GRID["nx"])])


def main():
    out = np.zeros((GRID["ny"], GRID["nx"], GRID["n_az"]), "<i2")
    t0 = time.time()
    with Pool(os.cpu_count()) as pool:
        for i, (iy, rows) in enumerate(pool.imap_unordered(run_row, range(GRID["ny"])), 1):
            out[iy] = np.clip(np.round(rows / GRID["scale"]), -32767, 32767)
            if i % 20 == 0:
                print(f"[{time.time() - t0:5.0f}s] {i}/{GRID['ny']} rows", flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    out.tofile(OUT / GRID["file"])

    idx_path = OUT / "index.json"
    index = json.loads(idx_path.read_text()) if idx_path.exists() else {"grids": []}
    index["grids"] = [g for g in index["grids"] if g["id"] != GRID["id"]] + [GRID]
    idx_path.write_text(json.dumps(index, indent=1) + "\n")
    print(f"done in {time.time() - t0:.0f} s, {(OUT / GRID['file']).stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()

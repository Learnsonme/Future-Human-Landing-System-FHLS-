"""E4 · south_2km horizon grid → data/horizon/ (format: DATA_CONTRACT.md §2).

Run:  cd engine && python3 make_horizon.py            (all CPU cores; ~5 min on 10 cores)
Grid point (ix, iy) is at x = x0_km + ix·spacing_km, y = y0_km + iy·spacing_km (iy = 0 is min y).
Tile (tx, ty) holds ix ∈ [32·tx, 32·tx + w), iy ∈ [32·ty, 32·ty + h), with w, h = min(32, n − 32·t):
edge tiles are cut short, NOT padded (181 = 5·32 + 21). Points row-major (iy then ix), then azimuth.
"""
import json
import os
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np

GRID = {"id": "south_2km", "projection": "polar_stereographic_south", "R_km": 1737.4,
        "x0_km": -180, "y0_km": -180, "spacing_km": 2, "nx": 181, "ny": 181,
        "n_az": 180, "az_step_deg": 2, "scale": 0.01, "nodata": -32768,
        "tile_size": 32, "tiles": "south_2km/{tx}_{ty}.bin",
        "edge_tiles": "cut short (not padded): width = min(tile_size, nx - tile_size*tx)",
        "point_order": "row-major within tile: iy (y increasing) then ix (x increasing)",
        "observer_height_m": 2.0, "max_distance_km": 250, "precision": "high",
        "source": "LOLA LDEM_80S_40M (near 20 km) + LDEM_75S_240M (to 250 km)",
        "synthetic": False}
OUT = Path(__file__).resolve().parent.parent / "data" / "horizon"


def run_tile(args):
    import horizon as H              # imported in the worker (DEM memmaps per process)
    tx, ty = args
    g, ts = GRID, GRID["tile_size"]
    ixs = range(ts * tx, min(ts * (tx + 1), g["nx"]))
    iys = range(ts * ty, min(ts * (ty + 1), g["ny"]))
    rows = []
    for iy in iys:
        for ix in ixs:
            x = g["x0_km"] + ix * g["spacing_km"]
            y = g["y0_km"] + iy * g["spacing_km"]
            rows.append(H.horizon_at(x, y, g["n_az"]))
    v = np.round(np.array(rows) / g["scale"])
    v = np.clip(np.nan_to_num(v, nan=g["nodata"]), -32767, 32767).astype("<i2")
    v.tofile(OUT / g["tiles"].format(tx=tx, ty=ty))
    return tx, ty, len(rows)


def main():
    (OUT / "south_2km").mkdir(parents=True, exist_ok=True)
    nt = -(-GRID["nx"] // GRID["tile_size"])
    jobs = [(tx, ty) for ty in range(nt) for tx in range(nt)]
    if len(sys.argv) > 1 and sys.argv[1] == "--one":     # quick test: one tile
        jobs = jobs[:1]
    t0 = time.time()
    with Pool(os.cpu_count()) as pool:
        for i, (tx, ty, n) in enumerate(pool.imap_unordered(run_tile, jobs), 1):
            print(f"[{time.time() - t0:6.0f}s] tile {tx}_{ty} ({n} pts) · {i}/{len(jobs)}", flush=True)

    idx_path = OUT / "index.json"
    index = json.loads(idx_path.read_text()) if idx_path.exists() else {"grids": []}
    index["grids"] = [g for g in index["grids"] if g["id"] != GRID["id"]] + [GRID]
    idx_path.write_text(json.dumps(index, indent=1) + "\n")
    print("done", time.time() - t0, "s")


if __name__ == "__main__":
    main()

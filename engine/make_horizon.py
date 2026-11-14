"""E4 + E9 · Horizon grids → data/horizon/ (format: DATA_CONTRACT.md §2).

Run:  cd engine && python3 make_horizon.py              all grids (all CPU cores)
      cd engine && python3 make_horizon.py fine         only the fine (250 m) grids
      cd engine && python3 make_horizon.py south_2km    one grid by id

Grids:
  south_2km         2 km spacing over everything south of ~84°S.
  north_2km         the same for everything north of ~84°N (E11; north map: y = −rho·cos(lon)).
  fine_<site>       250 m spacing boxes around the sites in sites.py (E9). The 2 km grid can sit
                    ~1 km off a ridge top and badly underestimate sunlight there; these fix that.
fhls-core.js automatically uses the finest grid that covers a click.

Layout of every grid: point (ix, iy) is at x = x0_km + ix·spacing_km, y = y0_km + iy·spacing_km
(iy = 0 is min y). Tile (tx, ty) holds ix ∈ [32·tx, 32·tx + w), iy ∈ [32·ty, 32·ty + h) with
w, h = min(32, n − 32·t): edge tiles are cut short, NOT padded. Points row-major (iy then ix),
then 180 azimuths, int16 × 0.01°.
"""
import json
import os
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np

import dem as D
import sites

OUT = Path(__file__).resolve().parent.parent / "data" / "horizon"
TILE = 32
COMMON = {"projection": "polar_stereographic_south", "R_km": 1737.4, "n_az": 180, "az_step_deg": 2,
          "scale": 0.01, "nodata": -32768, "tile_size": TILE,
          "edge_tiles": "cut short (not padded): width = min(tile_size, nx - tile_size*tx)",
          "point_order": "row-major within tile: iy (y increasing) then ix (x increasing)",
          "observer_height_m": 2.0, "max_distance_km": 250, "precision": "high",
          "source": "LOLA LDEM_80S_40M (near 20 km) + LDEM_75S_240M (to 250 km)", "synthetic": False}


def all_grids():
    grids = [{"id": "south_2km", **COMMON, "x0_km": -180, "y0_km": -180, "spacing_km": 2,
              "nx": 181, "ny": 181, "tiles": "south_2km/{tx}_{ty}.bin"},
             {"id": "north_2km", **COMMON, "projection": "polar_stereographic_north",
              "source": "LOLA LDEM_80N_40M (near 20 km) + LDEM_75N_240M (to 250 km)",
              "x0_km": -180, "y0_km": -180, "spacing_km": 2,
              "nx": 181, "ny": 181, "tiles": "north_2km/{tx}_{ty}.bin"}]
    spacing = 0.25
    for site_id, lat, lon, box_km in sites.fine_boxes():
        cx, cy = D.latlon_to_xy(lat, lon)
        n = int(box_km / spacing) + 1
        gid = f"fine_{site_id}"
        grids.append({"id": gid, **COMMON, "x0_km": round(round((cx - box_km / 2) / spacing) * spacing, 3),
                      "y0_km": round(round((cy - box_km / 2) / spacing) * spacing, 3),
                      "spacing_km": spacing, "nx": n, "ny": n, "tiles": gid + "/{tx}_{ty}.bin",
                      "site": site_id})
    return grids


def run_tile(job):
    import horizon as H                # imported inside the worker process
    grid, tx, ty = job
    rows = []
    for iy in range(TILE * ty, min(TILE * (ty + 1), grid["ny"])):
        for ix in range(TILE * tx, min(TILE * (tx + 1), grid["nx"])):
            x = grid["x0_km"] + ix * grid["spacing_km"]
            y = grid["y0_km"] + iy * grid["spacing_km"]
            pole = "north" if grid["projection"] == "polar_stereographic_north" else "south"
            rows.append(H.horizon_at(x, y, grid["n_az"], pole=pole))
    values = np.round(np.array(rows) / grid["scale"])
    values = np.clip(np.nan_to_num(values, nan=grid["nodata"]), -32767, 32767).astype("<i2")
    values.tofile(OUT / grid["tiles"].format(tx=tx, ty=ty))
    return grid["id"], len(rows)


def main():
    wanted = sys.argv[1:]
    grids = [g for g in all_grids()
             if not wanted or g["id"] in wanted or ("fine" in wanted and g["id"].startswith("fine_"))]
    jobs = []
    for g in grids:
        (OUT / g["id"]).mkdir(parents=True, exist_ok=True)
        jobs += [(g, tx, ty) for ty in range(-(-g["ny"] // TILE)) for tx in range(-(-g["nx"] // TILE))]
    print(f"{len(grids)} grids, {len(jobs)} tiles, "
          f"{sum(g['nx'] * g['ny'] for g in grids)} points", flush=True)

    t0 = time.time()
    with Pool(os.cpu_count()) as pool:
        for i, (gid, n) in enumerate(pool.imap_unordered(run_tile, jobs), 1):
            if i % 10 == 0 or i == len(jobs):
                print(f"[{time.time() - t0:6.0f}s] {i}/{len(jobs)} tiles ({gid})", flush=True)

    # index.json: replace entries we rebuilt, keep the others, finest grids first
    idx_path = OUT / "index.json"
    index = json.loads(idx_path.read_text()) if idx_path.exists() else {"grids": []}
    rebuilt = {g["id"] for g in grids}
    index["grids"] = [g for g in index["grids"] if g["id"] not in rebuilt] + grids
    index["grids"].sort(key=lambda g: g.get("spacing_km", 1e9))
    idx_path.write_text(json.dumps(index, indent=1) + "\n")
    print(f"done in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()

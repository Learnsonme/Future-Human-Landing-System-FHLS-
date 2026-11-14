"""M9 + global terrain · detailed 3D terrain tiles for the viewer.

Run:  cd engine && python3 make_terrain_detail.py artemis   40 m tiles around the Artemis sites
      cd engine && python3 make_terrain_detail.py global    474 m tiles for the whole Moon (~5 min)

Same tile format as data/terrain/index.json (16-bit grayscale PNG, GRID-registered so neighbours
share their edge row/column, row 0 = top edge, height_m = min_m + value/65535 · (max_m − min_m)).

artemis → data/terrain/detail/<site>.png + data/terrain/index_detail.json
    polar_stereographic_south, 513 px at 40 m (20.48 km box) centred on each Artemis pin, lod 2.
    Pixel (i, j) at x = x0_km + i·spacing_km, y = y0_km + size_km − j·spacing_km.
    Each value = mean of the 2×2 LOLA 40 m pixels around that corner.

global → data/terrain/global/{tx}_{ty}.png + data/terrain/index_global.json
    equirectangular, 8° × 8° tiles at 1/64° (≈ 474 m at the equator), 513 px, lat −88…88°
    (the polar tiles cover the caps). Pixel (i, j) at lon = lon0 + i·spacing_deg,
    lat = lat0 + size_deg − j·spacing_deg. tx = 0 starts at lon −180°, ty = 0 at lat −88°.
    Heights are stored in 2 m steps (max_m = min_m + 65535 × 2, so the standard formula still
    applies) to keep the set ~240 MB; 2 m is far below what a 474 m pixel can show.
"""
import json
import os
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image

import dem as D
import sites

OUT = Path(__file__).resolve().parent.parent / "data" / "terrain"
TILE_PX = 513


def save_png(heights, path, step_m=None):
    lo = float(np.floor(heights.min()))
    if step_m:
        lo = float(np.floor(heights.min() / step_m) * step_m)    # shared lattice → identical seams
        v = np.floor((heights - lo) / step_m + 0.5)   # round half up (np.round ties-to-even breaks seams)
        assert v.max() <= 65535, v.max()
        hi = lo + 65535 * step_m
    else:
        hi = float(np.ceil(heights.max()))
        hi = hi if hi > lo else lo + 1
        v = np.round((heights - lo) / (hi - lo) * 65535)
    Image.fromarray(v.astype(np.uint16)).save(path, optimize=True)
    return lo, hi


# ───────────────────────── Artemis 40 m (M9) ─────────────────────────

def artemis():
    dem, scale, off = D.load("80s_40m")
    (OUT / "detail").mkdir(parents=True, exist_ok=True)
    tiles = []
    half_px = (TILE_PX - 1) // 2                                   # 256 intervals each side
    for site_id, lat, lon, _ in sites.fine_boxes():
        cx, cy = D.latlon_to_xy(lat, lon)
        # snap the centre to a DEM pixel edge so every corner sits between 4 pixels
        e_col = int(round(off + 0.5 + cx / scale))
        e_row = int(round(off + 0.5 - cy / scale))
        rows = np.arange(e_row - half_px, e_row + half_px + 1)
        cols = np.arange(e_col - half_px, e_col + half_px + 1)
        block = dem[rows[0] - 1: rows[-1] + 1, cols[0] - 1: cols[-1] + 1].astype(np.float64) * 0.5
        h = (block[:-1, :-1] + block[1:, :-1] + block[:-1, 1:] + block[1:, 1:]) / 4   # corner means
        assert h.shape == (TILE_PX, TILE_PX), h.shape
        x0 = (cols[0] - off - 0.5) * scale
        y_top = (off + 0.5 - rows[0]) * scale
        size = (TILE_PX - 1) * scale
        name = f"detail/{site_id}.png"
        lo, hi = save_png(h, OUT / name)
        tiles.append({"id": f"detail_{site_id}", "site": site_id, "projection": "polar_stereographic_south",
                      "lod": 2, "x0_km": round(x0, 3), "y0_km": round(y_top - size, 3),
                      "size_km": round(size, 3), "px": TILE_PX, "spacing_km": scale,
                      "min_m": lo, "max_m": hi, "file": name})
    index = {"R_km": D.R_KM, "height_reference": "metres above/below the 1737.4 km sphere",
             "registration": "grid: pixel (i=col, j=row) at x = x0_km + i*spacing_km, "
                             "y = y0_km + size_km - j*spacing_km (row 0 = max y)",
             "projection_formula": "rho = 2R tan((90+lat)/2), x = rho sin(lon), y = rho cos(lon)",
             "source": "LOLA LDEM_80S_40M (PDS), full 40 m resolution (2x2 corner mean)",
             "lod_note": "lod 2: use these instead of the 120 m lod 1 tiles when the camera is inside the box",
             "synthetic": False, "tiles": tiles}
    (OUT / "index_detail.json").write_text(json.dumps(index, indent=1) + "\n")
    total = sum((OUT / t["file"]).stat().st_size for t in tiles)
    print(f"{len(tiles)} Artemis tiles at 40 m, {total / 1e6:.1f} MB")


# ───────────────────────── whole Moon 474 m ─────────────────────────

PPD = 64
TILE_DEG = 8
LAT_MIN, LAT_MAX = -88, 88
_g = None


def gdem():
    global _g
    if _g is None:      # line 0 = 90°N, sample 0 starts at lon 0°E; pixel edges at multiples of 1/64°
        _g = np.memmap(Path(__file__).resolve().parent / "dem" / "ldem_64.img", "<i2", "r",
                       shape=(180 * PPD, 360 * PPD))
    return _g


def global_tile(job):
    tx, ty = job
    g = gdem()
    lon0 = -180 + TILE_DEG * tx
    lat0 = LAT_MIN + TILE_DEG * ty
    n = TILE_DEG * PPD                                             # 512 intervals
    top_edge_row = (90 - (lat0 + TILE_DEG)) * PPD                  # DEM row edge at the tile's top
    left_edge_col = ((lon0 % 360) * PPD) % (360 * PPD)
    rows = np.arange(top_edge_row - 1, top_edge_row + n + 1)       # n+2 pixel rows around n+1 corners
    cols = (np.arange(left_edge_col - 1, left_edge_col + n + 1)) % (360 * PPD)
    block = g[rows[0]: rows[-1] + 1][:, cols].astype(np.float64) * 0.5
    h = (block[:-1, :-1] + block[1:, :-1] + block[:-1, 1:] + block[1:, 1:]) / 4
    assert h.shape == (TILE_PX, TILE_PX), h.shape
    name = f"global/{tx}_{ty}.png"
    lo, hi = save_png(h, OUT / name, step_m=2)
    return {"id": f"global_{tx}_{ty}", "projection": "equirectangular", "lod": 1,
            "lon0": lon0, "lat0": lat0, "size_deg": TILE_DEG, "px": TILE_PX,
            "spacing_deg": 1 / PPD, "min_m": lo, "max_m": hi, "step_m": 2, "file": name}


def global_tiles():
    (OUT / "global").mkdir(parents=True, exist_ok=True)
    jobs = [(tx, ty) for ty in range((LAT_MAX - LAT_MIN) // TILE_DEG) for tx in range(360 // TILE_DEG)]
    t0 = time.time()
    with Pool(os.cpu_count()) as pool:
        tiles = []
        for i, t in enumerate(pool.imap_unordered(global_tile, jobs), 1):
            tiles.append(t)
            if i % 100 == 0 or i == len(jobs):
                print(f"[{time.time() - t0:4.0f}s] {i}/{len(jobs)} tiles", flush=True)
    tiles.sort(key=lambda t: (t["lat0"], t["lon0"]))
    index = {"R_km": D.R_KM, "projection": "equirectangular",
             "height_reference": "metres above/below the 1737.4 km sphere",
             "registration": "grid: pixel (i=col, j=row) at lon = lon0 + i*spacing_deg, "
                             "lat = lat0 + size_deg - j*spacing_deg (row 0 = north edge)",
             "tile_rule": "tx = (lon0 + 180) / 8, ty = (lat0 + 88) / 8; file global/{tx}_{ty}.png",
             "decode": "height_m = min_m + value/65535 * (max_m - min_m)  (= min_m + value*2)",
             "coverage": "lat -88..88 (polar caps: use index.json / index_north.json tiles)",
             "source": "LOLA LDEM_64 (PDS), 64 px/deg ≈ 474 m, 2x2 corner mean",
             "synthetic": False, "tiles": tiles}
    (OUT / "index_global.json").write_text(json.dumps(index, separators=(",", ":")) + "\n")
    total = sum((OUT / t["file"]).stat().st_size for t in tiles)
    print(f"{len(tiles)} global tiles at 474 m, {total / 1e6:.0f} MB, {time.time() - t0:.0f} s")


if __name__ == "__main__":
    {"artemis": artemis, "global": global_tiles}[sys.argv[1] if len(sys.argv) > 1 else "artemis"]()

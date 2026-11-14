# Part of FHLS (NASA Space Apps 2026). Written with AI assistance (Claude, Codex); designed, reviewed and tested by Team FHLS.
"""P10 · Whole-Moon heat-map layers → data/heatmap/global_*.png

Run:  cd engine && python3 make_heatmap_global.py        (a few minutes, all cores)
Same rules and encoding as make_heatmap.py (and core/fhls-core.js analyze()), on every point of the
`global_coarse` horizon grid (1°, equirectangular, LOLA LDEM_16, precision "low"):
    sunlit / earth / both: value = round(pct × 2.55);   dark: value = min(255, round(days))
Files (8-bit grayscale PNG):
    global_<layer>.png          whole 2027–2028, 360 × 181
    global_<layer>_months.png   24-month atlas, 6 columns × 4 rows of 360 × 181 (month k → column k % 6, row k // 6)
Image row 0 = latitude +90 (north), column 0 = longitude −180; pixel centres are the grid points,
so the image spans lat −90.5 … 90.5 and lon −180.5 … 179.5. Adds a "global" entry to index.json
without touching the south-pole entries.
"""
import json
import os
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image

import make_heatmap as H

ROOT = Path(__file__).resolve().parent
DATA = ROOT.parent / "data"
OUT = DATA / "heatmap"


def point_stats(args):
    lat, lon, horizon = args
    s_az, s_el = H.az_el(H._eph[:, :3], lat, lon)
    e_az, e_el = H.az_el(H._eph[:, 3:], lat, lon)
    sun = s_el > H.horizon_lookup(horizon, s_az)
    earth = e_el > H.horizon_lookup(horizon, e_az)
    both = sun & earth
    out = np.zeros((len(H.MONTHS) + 1, 4), np.float32)
    for k, (a, b) in enumerate([(0, len(sun))] + H.MONTHS):
        out[k] = (sun[a:b].mean() * 100, earth[a:b].mean() * 100, both[a:b].mean() * 100,
                  H.longest_false_run(sun[a:b]))
    return out


def main():
    grids = json.loads((DATA / "horizon" / "index.json").read_text())["grids"]
    g = next(g for g in grids if g["id"] == "global_coarse")
    nx, ny, n_az = g["nx"], g["ny"], g["n_az"]
    raw = np.fromfile(DATA / "horizon" / g["file"], "<i2").reshape(ny * nx, n_az)
    hz = np.where(raw == g["nodata"], 0, raw).astype(np.float64) * g["scale"]
    # image order: row 0 = north (iy = ny − 1), columns = increasing longitude
    pts = [(g["lat0"] + iy * g["step_deg"], g["lon0"] + ix * g["step_deg"], hz[iy * nx + ix])
           for iy in range(ny - 1, -1, -1) for ix in range(nx)]
    eph = np.fromfile(DATA / "ephemeris.bin", "<f4").reshape(-1, 6).astype(np.float64)
    with Pool(os.cpu_count(), initializer=H.init, initargs=(eph,)) as pool:
        stats = np.array(pool.map(point_stats, pts, chunksize=128)).reshape(ny, nx, len(H.MONTHS) + 1, 4)

    files = {}
    for li, layer in enumerate(H.LAYERS):
        name = f"global_{layer}.png"
        Image.fromarray(H.encode(stats[:, :, 0, li], layer)).save(OUT / name, optimize=True)
        files[layer] = name
        atlas = np.zeros((4 * ny, 6 * nx), np.uint8)
        for k in range(len(H.MONTHS)):
            r, c = divmod(k, 6)
            atlas[r * ny:(r + 1) * ny, c * nx:(c + 1) * nx] = H.encode(stats[:, :, k + 1, li], layer)
        mname = f"global_{layer}_months.png"
        Image.fromarray(atlas).save(OUT / mname, optimize=True)
        files[layer + "_months"] = mname

    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text())
    step = g["step_deg"]
    index["global"] = {"id": "global_coarse", "projection": "equirectangular", "px": [nx, ny], "step_deg": step,
                       "lat_min": g["lat0"] - step / 2, "lat_max": g["lat0"] + (ny - 1) * step + step / 2,
                       "lon_min": g["lon0"] - step / 2, "lon_max": g["lon0"] + (nx - 1) * step + step / 2,
                       "row0": "north", "precision": "low", "source": g["source"], "files": files}
    index_path.write_text(json.dumps(index, indent=1) + "\n")

    # sanity checks (row = 90 − lat, column = lon + 180)
    def at(lat, lon, li):
        return stats[90 - lat, lon + 180, 0, li]
    print(f"near side equator (0N 0E): sunlit {at(0, 0, 0):.1f} %, earth {at(0, 0, 1):.1f} %")
    print(f"far side (0N 179E):        sunlit {at(0, 179, 0):.1f} %, earth {at(0, 179, 1):.1f} %")
    print(f"limb (0N 90E):             earth {at(0, 90, 1):.1f} %")
    print(f"85S 0E:                    sunlit {at(-85, 0, 0):.1f} %, earth {at(-85, 0, 1):.1f} %")
    total = sum((OUT / f).stat().st_size for f in files.values())
    print(f"{len(files)} images, {total / 1e6:.2f} MB")


if __name__ == "__main__":
    main()

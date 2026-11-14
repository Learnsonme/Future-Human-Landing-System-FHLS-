"""E13 · South-pole heat-map layers → data/heatmap/

Run:  cd engine && python3 make_heatmap.py          (~1–2 min, all cores)
For every point of the south polar horizon grids (south_2km and the 250 m fine_* boxes) and every
hour of 2027–2028, apply exactly the rules of core/fhls-core.js analyze():
    sunlit = more than half the solar disc above the terrain (Sun centre above the horizon)
    earth  = centre of Earth above the terrain
and summarise:
    sunlit   % of hours sunlit           both  % of hours with Sun AND Earth
    earth    % of hours Earth in view    dark  longest run of hours without sunlight
Layers are 8-bit grayscale PNGs (small, decoded natively by browsers):
    percentages: value = round(pct × 2.55)            (0 … 255 ↔ 0 … 100 %)
    dark:        value = min(255, round(hours / 24))  (days; 255 = 255 days or more)
Files:
    south_2km_<layer>.png          whole 2027–2028, 181 × 181
    south_2km_<layer>_months.png   atlas of the 24 months, 6 columns × 4 rows of 181 × 181
                                   (month k = 0 … 23 → column k % 6, row k // 6; k = 0 is Jan 2027)
    fine_<site>_<layer>.png        whole 2027–2028 for each 250 m Artemis box
Image row 0 = max y (north edge of a south polar map); pixel centres are the grid points, so the
image covers x0 − spacing/2 … x0 + (n − ½)·spacing. index.json gives image_x0_km / image_size_km.
"""
import json
import os
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image

import dem as D

ROOT = Path(__file__).resolve().parent
DATA = ROOT.parent / "data"
OUT = DATA / "heatmap"
LAYERS = ["sunlit", "earth", "both", "dark"]

_eph = None


def init(eph):
    global _eph
    _eph = eph


def month_bounds():
    """Hour index ranges of the 24 calendar months (start of each month, 2027-01 … 2028-12)."""
    days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] + [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    edges = np.concatenate([[0], np.cumsum(days) * 24])
    return [(int(a), int(b)) for a, b in zip(edges[:-1], edges[1:])]


MONTHS = month_bounds()


def longest_false_run(flags):
    """Longest run of False in a boolean array (hours)."""
    if flags.all():
        return 0
    padded = np.concatenate([[True], flags, [True]])
    idx = np.flatnonzero(padded)
    return int(np.max(np.diff(idx)) - 1)


def az_el(vectors, lat, lon):
    """Same frame as core/fhls-core.js enuAxes()/azEl() (site on the 1737.4 km sphere)."""
    la, lo = np.radians(lat), np.radians(lon)
    up = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    east = np.cross([0, 0, 1], up)
    east = np.array([0.0, 1.0, 0.0]) if np.linalg.norm(east) < 1e-9 else east / np.linalg.norm(east)
    north = np.cross(up, east)
    look = vectors - D.R_KM * up
    look /= np.linalg.norm(look, axis=1)[:, None]
    return (np.degrees(np.arctan2(look @ east, look @ north)) % 360,
            np.degrees(np.arcsin(np.clip(look @ up, -1, 1))))


def horizon_lookup(values, az):
    n = len(values)
    return np.interp(az, np.arange(n + 1) * 360 / n, np.append(values, values[0]))


def point_stats(args):
    x, y, horizon = args
    lat, lon = D.xy_to_latlon(x, y)
    s_az, s_el = az_el(_eph[:, :3], lat, lon)
    e_az, e_el = az_el(_eph[:, 3:], lat, lon)
    sun = s_el > horizon_lookup(horizon, s_az)
    earth = e_el > horizon_lookup(horizon, e_az)
    both = sun & earth
    out = np.zeros((len(MONTHS) + 1, 4), np.float32)      # row 0 = whole period, rows 1… = months
    for k, (a, b) in enumerate([(0, len(sun))] + MONTHS):
        out[k] = (sun[a:b].mean() * 100, earth[a:b].mean() * 100, both[a:b].mean() * 100,
                  longest_false_run(sun[a:b]))
    return out


def grid_points(g):
    """[(x, y, horizon values)] in image order: row 0 = max y, columns increasing x."""
    ts = g["tile_size"]
    pts = []
    for iy in range(g["ny"] - 1, -1, -1):
        ty = iy // ts
        for ix in range(g["nx"]):
            tx = ix // ts
            w = min(ts, g["nx"] - ts * tx)
            pts.append((iy, ix, tx, ty, w))
    tiles = {}
    out = []
    for iy, ix, tx, ty, w in pts:
        key = (tx, ty)
        if key not in tiles:
            tiles[key] = np.fromfile(DATA / "horizon" / g["tiles"].format(tx=tx, ty=ty), "<i2").reshape(-1, g["n_az"])
        k = (iy - ts * ty) * w + (ix - ts * tx)
        out.append((g["x0_km"] + ix * g["spacing_km"], g["y0_km"] + iy * g["spacing_km"],
                    tiles[key][k].astype(np.float64) * g["scale"]))
    return out


def encode(values, layer):
    if layer == "dark":
        return np.clip(np.round(values / 24), 0, 255).astype(np.uint8)
    return np.clip(np.round(values * 2.55), 0, 255).astype(np.uint8)


def main():
    grids = json.loads((DATA / "horizon" / "index.json").read_text())["grids"]
    polar = [g for g in grids if g["projection"] == "polar_stereographic_south"]
    eph = np.fromfile(DATA / "ephemeris.bin", "<f4").reshape(-1, 6).astype(np.float64)
    OUT.mkdir(parents=True, exist_ok=True)
    index = {"layers": {
                "sunlit": {"label": "Sunlight", "unit": "%", "decode": "pct = value / 2.55", "fill": "--sun-fill"},
                "earth": {"label": "Earth contact", "unit": "%", "decode": "pct = value / 2.55", "fill": "--earth-fill"},
                "both": {"label": "Sun and Earth", "unit": "%", "decode": "pct = value / 2.55", "fill": "--both-fill"},
                "dark": {"label": "Longest blackout", "unit": "days", "decode": "days = value (255 = 255 days or more)",
                         "fill": "--sun-fill", "reverse": True}},
             "rules": "same as core analyze(): sunlit = Sun centre above terrain (>50 % of disc); earth = Earth centre above terrain",
             "months": [f"{2027 + k // 12}-{k % 12 + 1:02d}" for k in range(24)],
             "month_atlas": {"columns": 6, "rows": 4, "order": "month k at column k % 6, row k // 6"},
             "projection": "polar_stereographic_south", "region_note": "south pole only", "grids": []}
    with Pool(os.cpu_count(), initializer=init, initargs=(eph,)) as pool:
        for g in sorted(polar, key=lambda g: -g["spacing_km"]):          # south_2km first
            pts = grid_points(g)
            stats = np.array(pool.map(point_stats, pts, chunksize=64))   # (n, 25, 4)
            n_y, n_x = g["ny"], g["nx"]
            stats = stats.reshape(n_y, n_x, len(MONTHS) + 1, 4)
            files = {}
            for li, layer in enumerate(LAYERS):
                name = f"{g['id']}_{layer}.png"
                Image.fromarray(encode(stats[:, :, 0, li], layer)).save(OUT / name, optimize=True)
                files[layer] = name
                if g["id"] == "south_2km":                               # per-month atlas for the base grid
                    atlas = np.zeros((4 * n_y, 6 * n_x), np.uint8)
                    for k in range(len(MONTHS)):
                        r, c = divmod(k, 6)
                        atlas[r * n_y:(r + 1) * n_y, c * n_x:(c + 1) * n_x] = encode(stats[:, :, k + 1, li], layer)
                    mname = f"{g['id']}_{layer}_months.png"
                    Image.fromarray(atlas).save(OUT / mname, optimize=True)
                    files[layer + "_months"] = mname
            sp = g["spacing_km"]
            index["grids"].append({"id": g["id"], "site": g.get("site"), "px": [n_x, n_y], "spacing_km": sp,
                                   "image_x0_km": round(g["x0_km"] - sp / 2, 4), "image_y0_km": round(g["y0_km"] - sp / 2, 4),
                                   "image_size_km": [round(n_x * sp, 4), round(n_y * sp, 4)], "files": files})
            print(f"{g['id']:28s} {n_x}×{n_y} points · sunlit median {np.median(stats[:, :, 0, 0]):.0f} %", flush=True)
    (OUT / "index.json").write_text(json.dumps(index, indent=1) + "\n")
    total = sum(f.stat().st_size for f in OUT.glob("*.png"))
    print(f"{len(list(OUT.glob('*.png')))} images, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()

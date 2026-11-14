# Part of FHLS (NASA Space Apps 2026). Written with AI assistance (Claude, Codex); designed, reviewed and tested by Team FHLS.
"""E7 · Validate our sunlight numbers against NASA's published south pole illumination map.

Run:  cd engine && python3 validate.py          (writes engine/validation_results.csv, prints stats)
Reference: AVGVISIB_85S_060M_201608 (Mazarico et al. 2011, Icarus 211, 1066–1081), PGDA product 69:
    http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/AVGVISIB_85S_060M_201608.IMG (+ .LBL)
    → put in engine/dem/validation/. Value = fraction of hourly steps over 18.6 years in which ANY
    part of the solar disc is visible, observer on the surface (height not stated; 0 m implied).

To compare like with like we recompute OUR model with NASA's definition and time span:
    any part of the disc visible, 18.6 years hourly (Sun from SPICE), observer 0 m and 2 m.
We also report what the APP shows (nearest grid point, > half the disc, 2027–2028 only).
"""
import csv
import json
import os
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import spiceypy as sp

import dem as D

ROOT = Path(__file__).resolve().parent
NASA_FILE = ROOT / "dem" / "validation" / "AVGVISIB_85S_060M_201608.IMG"
NASA_SIZE, NASA_SCALE_KM, NASA_OFFSET_PX, NASA_DN_SCALE = 5058, 0.060, 2528.5, 0.00004
SUN_RADIUS_DEG = 0.265
N_RANDOM = 400
MAX_RHO_KM = 150.0                       # NASA 85S map edge is ~151.7 km from the pole

_sun_long = None
_sun_app = None


def nasa_value(x, y):
    m = np.memmap(NASA_FILE, "<i2", "r", shape=(NASA_SIZE, NASA_SIZE))
    line = int(round(NASA_OFFSET_PX - y / NASA_SCALE_KM))
    samp = int(round(NASA_OFFSET_PX + x / NASA_SCALE_KM))
    return float(m[line, samp]) * NASA_DN_SCALE


def sun_vectors_long():
    """Sun from the Moon's centre, MOON_ME, hourly for one full 18.6-year nodal cycle."""
    sp.furnsh(str(ROOT / "kernels.tm"))
    et0 = sp.str2et("2009-07-01T00:00:00")
    ets = et0 + 3600.0 * np.arange(int(18.6 * 365.25 * 24))
    vecs, _ = sp.spkpos("SUN", ets, "MOON_ME", "LT+S", "MOON")
    return np.asarray(vecs)


def sun_az_el(vectors, lat, lon):
    """Same maths as core/fhls-core.js azEl()/enuAxes()."""
    la, lo = np.radians(lat), np.radians(lon)
    up = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    east = np.cross([0, 0, 1], up)
    east = np.array([0.0, 1.0, 0.0]) if np.linalg.norm(east) < 1e-9 else east / np.linalg.norm(east)
    north = np.cross(up, east)
    look = vectors - D.R_KM * up
    look /= np.linalg.norm(look, axis=1)[:, None]
    el = np.degrees(np.arcsin(np.clip(look @ up, -1, 1)))
    az = np.degrees(np.arctan2(look @ east, look @ north)) % 360
    return az, el


def horizon_lookup(values, az):
    n = len(values)
    return np.interp(az, np.arange(n + 1) * 360 / n, np.append(values, values[0]))


def fraction_sunlit(horizon, az, el, rule):
    hz = horizon_lookup(horizon, az)
    if rule == "any":                        # NASA: any part of the disc above the terrain
        return float(np.mean(el + SUN_RADIUS_DEG > hz))
    return float(np.mean(el > hz))           # app: > half the disc (centre above terrain)


def app_horizon(x, y):
    """The horizon the app would use: nearest point of the finest covering grid (like fhls-core)."""
    grids = json.loads((ROOT.parent / "data/horizon/index.json").read_text())["grids"]
    polar = sorted((g for g in grids if g["projection"] == "polar_stereographic_south"),
                   key=lambda g: g["spacing_km"])
    for g in polar:
        ix = round((x - g["x0_km"]) / g["spacing_km"])
        iy = round((y - g["y0_km"]) / g["spacing_km"])
        if 0 <= ix < g["nx"] and 0 <= iy < g["ny"]:
            ts = g["tile_size"]
            tx, ty = ix // ts, iy // ts
            w = min(ts, g["nx"] - ts * tx)
            tile = np.fromfile(ROOT.parent / "data/horizon" / g["tiles"].format(tx=tx, ty=ty), "<i2")
            k = ((iy - ts * ty) * w + (ix - ts * tx)) * g["n_az"]
            return tile[k:k + g["n_az"]] * g["scale"], g["id"]
    raise ValueError("no grid")


def init_worker(long_vecs, app_vecs):
    global _sun_long, _sun_app
    _sun_long, _sun_app = long_vecs, app_vecs


def evaluate(point):
    import horizon as H
    name, x, y = point
    lat, lon = D.xy_to_latlon(x, y)
    az_l, el_l = sun_az_el(_sun_long, lat, lon)
    az_a, el_a = sun_az_el(_sun_app, lat, lon)
    hz0 = H.horizon_at(x, y, observer_height_m=0.0)
    hz2 = H.horizon_at(x, y, observer_height_m=2.0)
    app_hz, grid_id = app_horizon(x, y)
    return {
        "name": name, "lat": round(float(lat), 5), "lon": round(float(lon), 5),
        "nasa": round(nasa_value(x, y), 4),
        "ours_0m": round(fraction_sunlit(hz0, az_l, el_l, "any"), 4),
        "ours_2m": round(fraction_sunlit(hz2, az_l, el_l, "any"), 4),
        "exact_2m_2027_28": round(fraction_sunlit(hz2, az_a, el_a, "half"), 4),
        "app_2027_28": round(fraction_sunlit(app_hz, az_a, el_a, "half"), 4),
        "app_grid": grid_id,
    }


def stats(label, a, b):
    d = np.asarray(a) - np.asarray(b)
    return (f"{label:44s} n={len(d):3d}  bias {d.mean() * 100:+5.1f} pts  MAE {np.abs(d).mean() * 100:4.1f} pts  "
            f"RMSE {np.sqrt((d ** 2).mean()) * 100:4.1f} pts  r={np.corrcoef(a, b)[0, 1]:.3f}  "
            f"within 10 pts: {np.mean(np.abs(d) <= 0.10):.0%}")


def main():
    rng = np.random.default_rng(2026)
    rho = MAX_RHO_KM * np.sqrt(rng.uniform(0, 1, N_RANDOM))      # uniform over the disc
    ang = rng.uniform(0, 2 * np.pi, N_RANDOM)
    points = [(f"random_{i}", r * np.sin(a), r * np.cos(a)) for i, (r, a) in enumerate(zip(rho, ang))]
    for s in json.loads((ROOT.parent / "data/sites.json").read_text()):
        x, y = D.latlon_to_xy(s["lat"], s["lon"])
        if np.hypot(x, y) < MAX_RHO_KM:
            points.append((s["id"], x, y))

    eph = np.fromfile(ROOT.parent / "data/ephemeris.bin", "<f4").reshape(-1, 6).astype(float)
    long_vecs = sun_vectors_long()
    with Pool(os.cpu_count(), initializer=init_worker, initargs=(long_vecs, eph[:, :3])) as pool:
        rows = pool.map(evaluate, points)

    out = ROOT / "validation_results.csv"
    with out.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    rnd = [r for r in rows if r["name"].startswith("random_")]
    lit = [r for r in rnd if r["nasa"] >= 0.2]
    col = lambda rs, k: [r[k] for r in rs]
    print(f"{len(long_vecs)} hourly Sun steps over 18.6 years; {len(rows)} points → {out.name}\n")
    print("Algorithm vs NASA (same definition: any part of the disc, 18.6 years):")
    print(stats("  ours 0 m vs NASA, random points", col(rnd, "ours_0m"), col(rnd, "nasa")))
    print(stats("  ours 2 m vs NASA, random points", col(rnd, "ours_2m"), col(rnd, "nasa")))
    print(stats("  ours 0 m vs NASA, sunlit areas (NASA ≥ 20 %)", col(lit, "ours_0m"), col(lit, "nasa")))
    shadow = [r for r in rnd if r["nasa"] == 0]
    print(f"  permanent shadow: NASA says {len(shadow)} points are never lit; "
          f"we agree on {sum(r['ours_0m'] < 0.01 for r in shadow)}")
    print("\nWhat the app shows (> half the disc, 2027–2028, nearest grid point) vs the exact point:")
    print(stats("  app vs exact point, random points", col(rnd, "app_2027_28"), col(rnd, "exact_2m_2027_28")))
    print("\nNamed sites (NASA | ours 0 m | ours 2 m | app 2027–28):")
    for r in rows:
        if not r["name"].startswith("random_"):
            print(f"  {r['name']:24s} {r['nasa']:6.1%} | {r['ours_0m']:6.1%} | {r['ours_2m']:6.1%} | "
                  f"{r['app_2027_28']:6.1%}  ({r['app_grid']})")


if __name__ == "__main__":
    main()

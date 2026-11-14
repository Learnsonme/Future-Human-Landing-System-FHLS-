# Part of FHLS (NASA Space Apps 2026). Written with AI assistance (Claude, Codex); designed, reviewed and tested by Team FHLS.
"""E12 · 120 m ("south-pole quality") terrain for chosen regions → data/terrain/regions/ + index_regions.json

Run:  cd engine && python3 make_terrain_regions.py
Source: LOLA LDEM_256 (256 px/deg ≈ 118 m), PDS Geosciences. NASA only publishes it as four
2.1 GB quarter-Moon files, so we fetch just the rows/columns each region needs with HTTP range
requests (~25 MB per region instead of 8.5 GB) and cache them in engine/dem/regions/.

Quarter files: ldem_256_{00n_90n|90s_00s}_{000_180|180_360}.img, 23040 rows × 46080 columns,
int16 × 0.5 m; row 0 = 90°N (north files) or 0° (south files); column 0 = lon 0° or 180°E.
Pixel edges sit on multiples of 1/256°.

Each region is a 12° × 12° box (snapped to the 2° grid) around its centre, split into 2° × 2°
equirectangular tiles of 513 × 513 samples (spacing 1/256°), grid-registered so neighbours share
edges exactly; each sample = mean of the 2 × 2 LOLA pixels around that corner. Same PNG format and
decode formula as index_global.json (heights in 2 m steps on a shared lattice), lod 2.
"""
import json
import re
import urllib.request
from pathlib import Path

import numpy as np

from make_terrain_detail import save_png

PPD = 256
TILE_DEG = 2
BOX_DEG = 12
BASE = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/"
QROWS, QCOLS = 23040, 46080
CACHE = Path(__file__).resolve().parent / "dem" / "regions"
OUT = Path(__file__).resolve().parent.parent / "data" / "terrain"

WIKI = "https://en.wikipedia.org/wiki/"
GAZ = "https://planetarynames.wr.usgs.gov/Feature/"
# id, name, lat, lon (east-positive), type, source
REGIONS = [
    ("apollo_11", "Apollo 11 · Tranquility Base", 0.67416, 23.47314, "apollo_site", WIKI + "Apollo_11"),
    ("apollo_12", "Apollo 12 · Ocean of Storms", -3.01239, -23.42157, "apollo_site", WIKI + "Apollo_12"),
    ("apollo_14", "Apollo 14 · Fra Mauro", -3.64530, -17.47136, "apollo_site", WIKI + "Apollo_14"),
    ("apollo_15", "Apollo 15 · Hadley–Apennine", 26.1322, 3.6339, "apollo_site", WIKI + "Apollo_15"),
    ("apollo_16", "Apollo 16 · Descartes Highlands", -8.97301, 15.50019, "apollo_site", WIKI + "Apollo_16"),
    ("apollo_17", "Apollo 17 · Taurus–Littrow", 20.1908, 30.7717, "apollo_site", WIKI + "Apollo_17"),
    ("tycho", "Tycho crater", -43.31, -11.36, "crater", GAZ + "6163"),
    ("copernicus", "Copernicus crater", 9.62, -20.08, "crater", GAZ + "1296"),
    ("aristarchus", "Aristarchus crater", 23.70, -47.40, "crater", GAZ + "380"),
]


def quarter(global_row, lon_col):
    """(file, row, col) for a global pixel row (0 = 90°N) and a 0…360° column index."""
    ns = "00n_90n" if global_row < QROWS else "90s_00s"
    ew = "000_180" if lon_col < QCOLS else "180_360"
    return f"ldem_256_{ns}_{ew}.img", global_row % QROWS, lon_col % QCOLS


def fetch_segments(url, segments, batch=200):
    """segments: [(byte_start, byte_end_inclusive)] → {byte_start: bytes} via multipart range requests."""
    out = {}
    for i in range(0, len(segments), batch):
        part = segments[i:i + batch]
        req = urllib.request.Request(url, headers={"Range": "bytes=" + ",".join(f"{a}-{b}" for a, b in part),
                                                   "User-Agent": "fhls-engine"})
        with urllib.request.urlopen(req, timeout=120) as r:
            body, ctype = r.read(), r.headers.get("Content-Type", "")
        if len(part) == 1 and "multipart" not in ctype:
            out[part[0][0]] = body
            continue
        boundary = re.search(r"boundary=(.+)$", ctype).group(1).strip().strip('"').encode()
        for chunk in body.split(b"--" + boundary)[1:]:
            if chunk.startswith(b"--"):
                break
            head, _, data = chunk.partition(b"\r\n\r\n")
            m = re.search(rb"Content-Range:\s*bytes (\d+)-(\d+)/", head, re.I)
            a, b = int(m.group(1)), int(m.group(2))
            out[a] = data[: b - a + 1]
    return out


def read_window(row0, row1, col0, col1):
    """Pixels [row0, row1) × [col0, col1) of the whole-Moon 256 px/deg grid (cols may be < 0 or
    ≥ 92160: longitude wraps), assembled from range requests to the quarter files."""
    win = np.zeros((row1 - row0, col1 - col0), np.int16)
    plan = {}                                   # file → list of (win_row, win_col0, q_row, q_col0, n)
    for wr, g in enumerate(range(row0, row1)):
        c = col0
        while c < col1:
            lc = c % (2 * QCOLS)
            n = min(col1 - c, (QCOLS - lc % QCOLS))               # stay inside one quarter file
            f, qr, qc = quarter(g, lc)
            plan.setdefault(f, []).append((wr, c - col0, qr, qc, n))
            c += n
    for f, items in plan.items():
        segs = [((qr * QCOLS + qc) * 2, (qr * QCOLS + qc + n) * 2 - 1) for _, _, qr, qc, n in items]
        got = fetch_segments(BASE + f, segs)
        for (wr, wc, qr, qc, n), (a, b) in zip(items, segs):
            win[wr, wc:wc + n] = np.frombuffer(got[a], "<i2", count=n)
    return win


def region_box(lat, lon):
    lat0 = int(np.clip(round((lat - BOX_DEG / 2) / TILE_DEG) * TILE_DEG, -80, 80 - BOX_DEG))
    lon0 = int(round((lon - BOX_DEG / 2) / TILE_DEG) * TILE_DEG)
    return lat0, lon0


def build(region):
    rid, name, lat, lon, kind, source = region
    lat0, lon0 = region_box(lat, lon)
    n = BOX_DEG * PPD                                           # 3072 intervals
    top_edge = (90 - (lat0 + BOX_DEG)) * PPD                    # global pixel-edge row of the box top
    left_edge = (lon0 % 360) * PPD                              # global pixel-edge column (0…360°)
    if left_edge + n + 1 > 4 * QCOLS:
        left_edge -= 2 * QCOLS                                  # keep the window contiguous
    cache = CACHE / f"{rid}.npy"
    if cache.exists():
        win = np.load(cache)
    else:
        win = read_window(top_edge - 1, top_edge + n + 1, left_edge - 1, left_edge + n + 1)
        CACHE.mkdir(parents=True, exist_ok=True)
        np.save(cache, win)
    px = win.astype(np.float64) * 0.5
    corners = (px[:-1, :-1] + px[1:, :-1] + px[:-1, 1:] + px[1:, 1:]) / 4        # (n+1)²
    (OUT / "regions").mkdir(parents=True, exist_ok=True)
    tiles, per = [], TILE_DEG * PPD
    for ty in range(BOX_DEG // TILE_DEG):                     # ty = 0 is the southern row of tiles
        for tx in range(BOX_DEG // TILE_DEG):
            r0 = (BOX_DEG // TILE_DEG - 1 - ty) * per
            h = corners[r0:r0 + per + 1, tx * per: tx * per + per + 1]
            t_lon0 = ((lon0 + tx * TILE_DEG + 180) % 360) - 180
            t_lat0 = lat0 + ty * TILE_DEG
            fname = f"regions/{rid}_{tx}_{ty}.png"
            lo, hi = save_png(h, OUT / fname, step_m=2)
            tiles.append({"id": f"region_{rid}_{tx}_{ty}", "region": rid, "projection": "equirectangular",
                          "lod": 2, "lon0": t_lon0, "lat0": t_lat0, "size_deg": TILE_DEG, "px": per + 1,
                          "spacing_deg": 1 / PPD, "min_m": lo, "max_m": hi, "step_m": 2, "file": fname})
    return {"id": rid, "name": name, "lat": lat, "lon": lon, "type": kind, "source": source,
            "box": {"lat0": lat0, "lon0": ((lon0 + 180) % 360) - 180, "size_deg": BOX_DEG}}, tiles


def main():
    regions, tiles = [], []
    for r in REGIONS:
        info, t = build(r)
        regions.append(info); tiles += t
        size = sum((OUT / x["file"]).stat().st_size for x in t)
        print(f"{r[0]:12s} box lat {info['box']['lat0']}…{info['box']['lat0'] + BOX_DEG}, "
              f"lon {info['box']['lon0']}…{info['box']['lon0'] + BOX_DEG}: {len(t)} tiles, {size / 1e6:.1f} MB", flush=True)
    index = {"R_km": 1737.4, "projection": "equirectangular", "synthetic": False,
             "height_reference": "metres above/below the 1737.4 km sphere",
             "registration": "grid: pixel (i=col, j=row) at lon = lon0 + i*spacing_deg, "
                             "lat = lat0 + size_deg - j*spacing_deg (row 0 = north edge)",
             "decode": "height_m = min_m + value/65535 * (max_m - min_m)  (= min_m + value*2)",
             "source": "LOLA LDEM_256 (PDS), 256 px/deg ≈ 118 m, 2x2 corner mean, fetched by HTTP range",
             "lod_note": "lod 2: use instead of the 474 m index_global.json tiles inside a region box",
             "regions": regions, "tiles": tiles}
    (OUT / "index_regions.json").write_text(json.dumps(index, separators=(",", ":")) + "\n")
    total = sum((OUT / t["file"]).stat().st_size for t in tiles)
    print(f"{len(regions)} regions, {len(tiles)} tiles, {total / 1e6:.0f} MB")


if __name__ == "__main__":
    main()

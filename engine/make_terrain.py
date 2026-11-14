"""E5 · South polar terrain heightmap tiles for the viewer → data/terrain/.

Run:  cd engine && python3 make_terrain.py [south|north]   (north → data/terrain/north/ + index_north.json)
Source: LOLA LDEM_80S_40M (40 m/px), averaged to a 120 m grid.

Tiles are GRID-REGISTERED so neighbours share their edge row/column (no seams in a mesh):
    pixel (i = column, j = row) sits at  x = x0_km + i·spacing_km,  y = y0_km + size_km − j·spacing_km
    i.e. row 0 is the max-y edge (top of a standard south polar map, 0° longitude up).
    height_m = min_m + value/65535 · (max_m − min_m), relative to the 1737.4 km sphere.
LODs: lod 0 = one overview tile (480 m spacing); lod 1 = 6×6 tiles (120 m spacing).
Coverage: x, y ∈ [−184.32, 184.32] km ⊃ everything south of 84°S (rho 182.1 km).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

import dem as D

SPACING = 0.12            # km, = 3 DEM pixels
TILE_PX = 513             # 512 intervals + shared edge
N_TILES = 6
N = N_TILES * (TILE_PX - 1) + 1          # 3073 grid points per axis
HALF = (N - 1) * SPACING / 2             # 184.32 km
OUT = Path(__file__).resolve().parent.parent / "data" / "terrain"


POLES = {   # folder, index file, projection, formula, source
    "south": ("south", "index.json", "polar_stereographic_south",
              "rho = 2R tan((90+lat)/2), x = rho sin(lon), y = rho cos(lon)", "LOLA LDEM_80S_40M"),
    "north": ("north", "index_north.json", "polar_stereographic_north",
              "rho = 2R tan((90-lat)/2), x = rho sin(lon), y = -rho cos(lon)", "LOLA LDEM_80N_40M"),
}


def build_grid(pole="south"):
    """Heights (m) on the 120 m corner grid, row 0 = max y. Each value = mean of the 4×4
    DEM pixels around that corner (160 m footprint, light anti-aliasing)."""
    dem, scale, off = D.load(D.FINE[pole])
    edge0 = int(round(off + 0.5 - HALF / scale))       # DEM pixel edge index at x = −HALF
    assert edge0 == 2992, edge0
    g = np.zeros((N, N), np.float64)
    for dr in range(-2, 2):
        rows = dem[edge0 + dr: edge0 + dr + 3 * N: 3][:N]
        for dc in range(-2, 2):
            g += rows[:, edge0 + dc: edge0 + dc + 3 * N: 3][:, :N]
    return g * (0.5 / 16)


def write_tile(h, name, x0, y0, size, spacing, lod, projection="polar_stereographic_south"):
    lo, hi = float(np.floor(h.min())), float(np.ceil(h.max()))
    v = np.round((h - lo) / (hi - lo) * 65535).astype(np.uint16)
    Image.fromarray(v).save(OUT / name, optimize=True)
    return {"id": name[:-4].replace("/", "_"), "projection": projection,
            "lod": lod, "x0_km": round(x0, 3), "y0_km": round(y0, 3), "size_km": round(size, 3),
            "px": h.shape[0], "spacing_km": spacing, "min_m": lo, "max_m": hi, "file": name}


def main():
    pole = sys.argv[1] if len(sys.argv) > 1 else "south"
    folder, index_name, projection, formula, source = POLES[pole]
    g = build_grid(pole)
    (OUT / folder).mkdir(parents=True, exist_ok=True)
    tiles = [write_tile(g[::4, ::4], f"{folder}/overview.png", -HALF, -HALF, 2 * HALF, 4 * SPACING, 0,
                        projection)]
    step = TILE_PX - 1
    for ty in range(N_TILES):            # ty = 0 is the min-y (bottom) row of tiles
        for tx in range(N_TILES):        # tx = 0 is the min-x (left) column
            r0 = (N_TILES - 1 - ty) * step
            c0 = tx * step
            h = g[r0:r0 + TILE_PX, c0:c0 + TILE_PX]
            size = step * SPACING
            tiles.append(write_tile(h, f"{folder}/{tx}_{ty}.png",
                                    -HALF + tx * size, -HALF + ty * size, size, SPACING, 1, projection))
    index = {
        "R_km": D.R_KM,
        "height_reference": "metres above/below the 1737.4 km sphere",
        "registration": "grid: pixel (i=col, j=row) at x = x0_km + i*spacing_km, "
                        "y = y0_km + size_km - j*spacing_km (row 0 = max y)",
        "projection_formula": formula,
        "source": f"{source} (PDS), 4x4 mean to 120 m",
        "synthetic": False,
        "tiles": tiles,
    }
    (OUT / index_name).write_text(json.dumps(index, indent=1) + "\n")
    total = sum((OUT / t["file"]).stat().st_size for t in tiles)
    print(f"{len(tiles)} tiles, {total / 1e6:.1f} MB, heights {g.min():.0f} … {g.max():.0f} m")


if __name__ == "__main__":
    main()

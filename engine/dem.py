# Part of FHLS (NASA Space Apps 2026). Written with AI assistance (Claude, Codex); designed, reviewed and tested by Team FHLS.
"""Shared LOLA polar DEM helpers (used by terrain tiles and horizon grids).

Projection, south (verified against Shoemaker, Haworth, Faustini, de Gerlache, Shackleton):
    rho = 2R·tan((90° + lat)/2),  x = rho·sin(lon),  y = rho·cos(lon)      [km, lat < 0]
Projection, north (verified against north polar craters, see E11 in LOG.md):
    rho = 2R·tan((90° − lat)/2),  x = rho·sin(lon),  y = −rho·cos(lon)     [km, lat > 0]
Both:  sample = SOFF + x/scale,  line = LOFF − y/scale                     [0-based pixel centres]
Every function takes pole="south" (default, unchanged behaviour) or pole="north".
Heights are metres relative to the 1737.4 km sphere (DN × 0.5).
"""
from pathlib import Path

import numpy as np

R_KM = 1737.4
DEM_DIR = Path(__file__).resolve().parent / "dem"

# name: (file, size px, scale km/px, projection offset px)
DEMS = {
    "80s_40m": ("ldem_80s_40m.img", 15200, 0.040, 7599.5),
    "75s_240m": ("ldem_75s_240m.img", 3812, 0.240, 1905.5),
    "80n_40m": ("ldem_80n_40m.img", 15200, 0.040, 7599.5),
    "75n_240m": ("ldem_75n_240m.img", 3812, 0.240, 1905.5),
}
FINE = {"south": "80s_40m", "north": "80n_40m"}
COARSE = {"south": "75s_240m", "north": "75n_240m"}


def load(name):
    """Return (memmap int16 [line, sample], scale_km, offset_px). Height m = DN * 0.5."""
    f, n, scale, off = DEMS[name]
    return np.memmap(DEM_DIR / f, "<i2", "r", shape=(n, n)), scale, off


def latlon_to_xy(lat, lon, pole="south"):
    if pole == "north":
        rho = 2 * R_KM * np.tan(np.radians(90 - np.asarray(lat)) / 2)
        lon = np.radians(lon)
        return rho * np.sin(lon), -rho * np.cos(lon)
    rho = 2 * R_KM * np.tan(np.radians(90 + np.asarray(lat)) / 2)
    lon = np.radians(lon)
    return rho * np.sin(lon), rho * np.cos(lon)


def xy_to_latlon(x, y, pole="south"):
    rho = np.hypot(x, y)
    colat = 2 * np.degrees(np.arctan(rho / (2 * R_KM)))
    if pole == "north":
        return 90 - colat, np.degrees(np.arctan2(x, -np.asarray(y)))
    return colat - 90, np.degrees(np.arctan2(x, y))


def xy_to_pixel(x, y, scale, off):
    """Fractional (line, sample) for x, y in km."""
    return off - np.asarray(y) / scale, off + np.asarray(x) / scale


def sample_bilinear(dem, scale, off, x, y):
    """Height in metres at x, y (km), bilinear. Arrays welcome."""
    line, samp = xy_to_pixel(x, y, scale, off)
    l0 = np.clip(np.floor(line).astype(int), 0, dem.shape[0] - 2)
    s0 = np.clip(np.floor(samp).astype(int), 0, dem.shape[1] - 2)
    fl, fs = line - l0, samp - s0
    a = dem[l0, s0] * (1 - fs) + dem[l0, s0 + 1] * fs
    b = dem[l0 + 1, s0] * (1 - fs) + dem[l0 + 1, s0 + 1] * fs
    return 0.5 * (a * (1 - fl) + b * fl)

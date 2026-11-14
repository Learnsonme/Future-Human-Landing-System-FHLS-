"""E3 · Terrain horizon (skyline) elevation per azimuth, south polar region.

For an observer at polar-stereographic (x, y), cast a ray per azimuth across the DEM and keep the
highest terrain elevation angle. Geometry is exact on the sphere (curvature included):
    el = atan2(r_T·cosθ − r_S, r_T·sinθ)
where θ is the central angle observer→terrain sample, r = 1737.4 km + height.
Near field (< NEAR_KM) uses the 40 m DEM, far field the 240 m DEM, out to MAX_KM.
Azimuth: 0 = north (away from the pole), clockwise, matching DATA_CONTRACT / fhls-core.js.
"""
import numpy as np

import dem as D

R = D.R_KM
OBSERVER_M = 2.0          # eye/panel height above the surface
NEAR_KM = 20.0
MAX_KM = 250.0
FINE = D.load("80s_40m")
COARSE = D.load("75s_240m")
FINE_RHO = FINE[0].shape[0] / 2 * FINE[1] - 1        # ~303 km: inside fine DEM
COARSE_RHO = COARSE[0].shape[0] / 2 * COARSE[1] - 1  # ~456 km


def ray_distances():
    """Sample distances along a ray (km): 30 m steps to 5 km, then +0.6 % per step."""
    near = np.arange(0.03, 5.0, 0.03)
    far = 5.0 * 1.006 ** np.arange(1, 2000)
    return np.concatenate([near, far[far <= MAX_KM]])


DIST = ray_distances()


def unit_vec(x, y):
    """Polar stereographic (km) → unit vector in MOON_ME (x_me = lon 0, y_me = lon 90°E)."""
    t2 = (x * x + y * y) / (2 * R) ** 2
    k = 1.0 / (1.0 + t2)
    return y / R * k, x / R * k, -(1.0 - t2) * k


def local_axes(x, y):
    """Unit north / east directions in the projection plane at (x, y)."""
    rho = np.hypot(x, y)
    if rho < 1e-9:                      # pole: treat as lon 0 → north = +y, east = +x
        return np.array([0.0, 1.0]), np.array([1.0, 0.0])
    n = np.array([x, y]) / rho          # north points away from the south pole
    e = np.array([y, -x]) / rho
    return n, e


def horizon_at(x, y, n_az=180):
    """Horizon elevation (deg) for n_az azimuths starting at 0°, for one observer at (x, y) km."""
    az = np.radians(np.arange(n_az) * 360.0 / n_az)
    n, e = local_axes(x, y)
    dirs = np.outer(np.cos(az), n) + np.outer(np.sin(az), e)       # (n_az, 2)
    px = x + dirs[:, :1] * DIST                                      # (n_az, n_d)
    py = y + dirs[:, 1:] * DIST

    h = np.empty_like(px)
    near = DIST < NEAR_KM
    h[:, near] = D.sample_bilinear(*FINE, px[:, near], py[:, near])
    h[:, ~near] = D.sample_bilinear(*COARSE, px[:, ~near], py[:, ~near])
    rho = np.hypot(px, py)
    outside = np.where(near, rho > FINE_RHO, rho > COARSE_RHO)

    ox, oy, oz = unit_vec(x, y)
    tx, ty, tz = unit_vec(px, py)
    cos_t = np.clip(ox * tx + oy * ty + oz * tz, -1, 1)
    sin_t = np.sqrt(1 - cos_t ** 2)
    r_s = R + (float(D.sample_bilinear(*FINE, x, y)) + OBSERVER_M) / 1000
    r_t = R + h / 1000
    ratio = (r_t * cos_t - r_s) / (r_t * sin_t)                      # tan(elevation)
    ratio[outside] = -np.inf
    return np.degrees(np.arctan(ratio.max(axis=1)))

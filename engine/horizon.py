# Part of FHLS (NASA Space Apps 2026). Written with AI assistance (Claude, Codex); designed, reviewed and tested by Team FHLS.
"""E3 · Terrain horizon (skyline) elevation per azimuth, south polar region.

Idea: stand at a point, look out in 180 directions (every 2°). Along each direction walk outward
across the elevation map and, at every step, ask "how many degrees above level is that terrain,
seen from here?" The highest answer in that direction is the horizon there. If the Sun is lower
than that number, a hill or crater wall is blocking it.

Curvature is included exactly: far-away terrain sinks below you because the Moon is round.
For an observer at radius r_observer and terrain at radius r_terrain, separated by the angle
`central_angle` measured at the Moon's centre:
    elevation = atan2(r_terrain·cos(central_angle) − r_observer,  r_terrain·sin(central_angle))

Near terrain (< NEAR_KM) comes from the 40 m DEM; far terrain from the 240 m DEM, out to MAX_KM.
Azimuth: 0 = north (away from the pole), clockwise, matching DATA_CONTRACT / fhls-core.js.
Positions are polar stereographic x, y in km (see dem.py).
"""
import numpy as np

import dem as D

MOON_RADIUS_KM = D.R_KM
OBSERVER_HEIGHT_M = 2.0      # eye / solar-panel height above the ground
NEAR_KM = 20.0               # use the fine DEM closer than this
MAX_KM = 250.0               # beyond this, terrain is hidden by curvature anyway

FINE_DEM = D.load("80s_40m")       # (heights, km per pixel, centre pixel)
COARSE_DEM = D.load("75s_240m")
FINE_DEM_EDGE_KM = FINE_DEM[0].shape[0] / 2 * FINE_DEM[1] - 1        # ~303 km from the pole
COARSE_DEM_EDGE_KM = COARSE_DEM[0].shape[0] / 2 * COARSE_DEM[1] - 1  # ~456 km from the pole
_DEMS = {"south": (FINE_DEM, COARSE_DEM)}


def dems(pole):
    """(fine, coarse) DEMs for a pole; the north ones are loaded on first use."""
    if pole not in _DEMS:
        _DEMS[pole] = (D.load(D.FINE[pole]), D.load(D.COARSE[pole]))
    return _DEMS[pole]


def step_distances_km():
    """How far out each sample along a ray is: every 30 m up to 5 km, then each step 0.6 %
    longer than the last (far terrain needs less detail)."""
    close = np.arange(0.03, 5.0, 0.03)
    far = 5.0 * 1.006 ** np.arange(1, 2000)
    return np.concatenate([close, far[far <= MAX_KM]])


STEP_DISTANCES_KM = step_distances_km()


def direction_from_moon_centre(x, y, pole="south"):
    """Map position (km) → unit vector from the Moon's centre (MOON_ME axes:
    first axis points to lon 0°, second to lon 90°E, third to the north pole)."""
    t_squared = (x * x + y * y) / (2 * MOON_RADIUS_KM) ** 2
    k = 1.0 / (1.0 + t_squared)
    if pole == "north":       # x = rho·sin(lon), y = −rho·cos(lon)
        return -y / MOON_RADIUS_KM * k, x / MOON_RADIUS_KM * k, (1.0 - t_squared) * k
    return y / MOON_RADIUS_KM * k, x / MOON_RADIUS_KM * k, -(1.0 - t_squared) * k


def north_and_east_on_map(x, y, pole="south"):
    """Unit 'north' and 'east' arrows on the flat map at (x, y). On a south polar map north
    points straight away from the pole; on a north polar map straight toward it.
    At the exact poles we match core/fhls-core.js enuAxes(): east = toward lon 90°E."""
    distance_from_pole = np.hypot(x, y)
    if pole == "north":
        if distance_from_pole < 1e-9:   # north pole: east = lon 90° (+x), north = toward lon 180° (+y)
            return np.array([0.0, 1.0]), np.array([1.0, 0.0])
        north = -np.array([x, y]) / distance_from_pole
        east = np.array([-y, x]) / distance_from_pole
        return north, east
    if distance_from_pole < 1e-9:       # south pole: north = toward lon 0
        return np.array([0.0, 1.0]), np.array([1.0, 0.0])
    north = np.array([x, y]) / distance_from_pole
    east = np.array([y, -x]) / distance_from_pole
    return north, east


def horizon_at(x, y, n_azimuths=180, observer_height_m=OBSERVER_HEIGHT_M, pole="south"):
    """Horizon elevation in degrees for n_azimuths directions (0°, 2°, 4°, …) seen from (x, y) km
    on the south (default) or north polar map."""
    fine_dem, coarse_dem = dems(pole)
    azimuths = np.radians(np.arange(n_azimuths) * 360.0 / n_azimuths)
    north, east = north_and_east_on_map(x, y, pole)
    ray_directions = np.outer(np.cos(azimuths), north) + np.outer(np.sin(azimuths), east)

    # Every sample point on every ray: arrays shaped (direction, step along the ray)
    sample_x = x + ray_directions[:, :1] * STEP_DISTANCES_KM
    sample_y = y + ray_directions[:, 1:] * STEP_DISTANCES_KM

    terrain_height_m = np.empty_like(sample_x)
    is_near = STEP_DISTANCES_KM < NEAR_KM
    terrain_height_m[:, is_near] = D.sample_bilinear(*fine_dem, sample_x[:, is_near], sample_y[:, is_near])
    terrain_height_m[:, ~is_near] = D.sample_bilinear(*coarse_dem, sample_x[:, ~is_near], sample_y[:, ~is_near])
    sample_distance_from_pole = np.hypot(sample_x, sample_y)
    off_the_map = np.where(is_near, sample_distance_from_pole > FINE_DEM_EDGE_KM,
                           sample_distance_from_pole > COARSE_DEM_EDGE_KM)

    # Angle at the Moon's centre between observer and each sample
    obs_x, obs_y, obs_z = direction_from_moon_centre(x, y, pole)
    smp_x, smp_y, smp_z = direction_from_moon_centre(sample_x, sample_y, pole)
    cos_central = np.clip(obs_x * smp_x + obs_y * smp_y + obs_z * smp_z, -1, 1)
    sin_central = np.sqrt(1 - cos_central ** 2)

    ground_height_m = float(D.sample_bilinear(*fine_dem, x, y))
    r_observer = MOON_RADIUS_KM + (ground_height_m + observer_height_m) / 1000
    r_terrain = MOON_RADIUS_KM + terrain_height_m / 1000

    # tan(elevation angle) of each sample; the biggest per direction is the horizon
    tan_elevation = (r_terrain * cos_central - r_observer) / (r_terrain * sin_central)
    tan_elevation[off_the_map] = -np.inf
    return np.degrees(np.arctan(tan_elevation.max(axis=1)))

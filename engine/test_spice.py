"""Quick check that SPICE works. Run:  cd engine && python3 test_spice.py"""
import numpy as np
import spiceypy as sp

sp.furnsh("kernels.tm")
et = sp.str2et("2027-01-15T12:00:00")

R = 1737.4                                   # Moon radius, km
lat, lon = np.radians(-89.45), np.radians(-137.3)   # Shackleton rim (approx.)
site = sp.latrec(R, lon, lat)

def az_el(target):
    vec, _ = sp.spkpos(target, et, "MOON_ME", "LT+S", "MOON")
    up = site / np.linalg.norm(site)                 # local "up"
    east = np.cross([0, 0, 1], up); east /= np.linalg.norm(east)
    north = np.cross(up, east)
    look = vec - site; look /= np.linalg.norm(look)
    el = np.degrees(np.arcsin(np.dot(look, up)))
    az = np.degrees(np.arctan2(np.dot(look, east), np.dot(look, north))) % 360
    return az, el

for body in ("SUN", "EARTH"):
    az, el = az_el(body)
    print(f"{body:5s}  azimuth {az:6.1f}°   elevation {el:5.2f}°")
print("SPICE works ✔")

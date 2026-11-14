# Part of FHLS (NASA Space Apps 2026). Written with AI assistance (Claude, Codex); designed, reviewed and tested by Team FHLS.
"""E1 · Hourly Sun + Earth position table for 2027-01-01 → 2028-12-31 23:00 UTC.

Run:  cd engine && python3 make_ephemeris.py
Writes ../data/ephemeris.bin and ../data/ephemeris.json (format: DATA_CONTRACT.md §1).

Vectors are from the Moon's centre in MOON_ME, km, abcorr LT+S.
The browser subtracts the site position itself (Earth parallax up to ~0.3°).
"""
import json
from pathlib import Path

import numpy as np
import spiceypy as sp

START = "2027-01-01T00:00:00"
COUNT = 17544                     # 731 days × 24 h (2028 is a leap year)
STEP_S = 3600.0
FRAME, ABCORR = "MOON_ME", "LT+S"
OUT = Path(__file__).resolve().parent.parent / "data"


def main():
    sp.furnsh("kernels.tm")
    et0 = sp.str2et(START)  # ISO strings are UTC in SPICE
    ets = et0 + STEP_S * np.arange(COUNT)

    # sanity: last step must be 2028-12-31T23:00:00
    last = sp.et2utc(ets[-1], "ISOC", 0)
    assert last == "2028-12-31T23:00:00", last

    sun, _ = sp.spkpos("SUN", ets, FRAME, ABCORR, "MOON")
    earth, _ = sp.spkpos("EARTH", ets, FRAME, ABCORR, "MOON")
    table = np.hstack([np.asarray(sun), np.asarray(earth)]).astype("<f4")
    assert table.shape == (COUNT, 6)

    OUT.mkdir(exist_ok=True)
    table.tofile(OUT / "ephemeris.bin")
    meta = {
        "start_utc": START + "Z", "step_hours": 1, "count": COUNT,
        "frame": FRAME, "units": "km", "abcorr": ABCORR,
        "layout": "float32 little-endian, per step: sun_x, sun_y, sun_z, earth_x, earth_y, earth_z",
        "synthetic": False,
        "source": "JPL NAIF SPICE: de440s.bsp, moon_pa_de440_200625.bpc, moon_de440_250416.tf",
    }
    (OUT / "ephemeris.json").write_text(json.dumps(meta, indent=2) + "\n")

    # float32 precision check: Sun at ~1.5e8 km → ~8 km rounding ≈ 3e-6°; Earth ~0.02 km. Fine.
    err = np.abs(table.astype(np.float64) - np.hstack([sun, earth])).max()
    print(f"wrote {COUNT} steps, {(OUT / 'ephemeris.bin').stat().st_size} bytes, "
          f"max float32 error {err:.3f} km, last step {last}")


if __name__ == "__main__":
    main()

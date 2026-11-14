# engine/: builds everything in data/ (T3)

Run every script from this folder (`cd engine`). You need Python 3, numpy, spiceypy and Pillow.

**Big inputs.** These are git-ignored, so get them from the team Drive or the source listed:

| Path | Source |
|---|---|
| `kernels/` (5 SPICE files) | https://naif.jpl.nasa.gov/naif/data_generic.html (listed in `kernels.tm`) |
| `dem/ldem_80s_40m.img`, `dem/ldem_75s_240m.img` | LOLA polar GDR, PDS Geosciences |
| `dem/ldem_80n_40m.img`, `dem/ldem_75n_240m.img` | LOLA polar GDR (north), same folder as the south ones |
| `dem/ldem_64.img` (530 MB) | https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ |
| `dem/ldem_16.img` | https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ |
| `dem/validation/AVGVISIB_85S_060M_201608.IMG` | http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/ (validation only) |

| Step | Command | Time | Output |
|---|---|---|---|
| Ephemeris (E1) | `python3 make_ephemeris.py` | 1 s | `data/ephemeris.*` |
| Terrain tiles (E5, E11) | `python3 make_terrain.py` then `python3 make_terrain.py north` | 2 s each | `data/terrain/` |
| Detailed terrain (M9 + whole Moon) | `python3 make_terrain_detail.py artemis`, then `global` | 1 s / 7 s | `data/terrain/detail/`, `data/terrain/global/` |
| 120 m regions (E12) | `python3 make_terrain_regions.py` | about 10 min (downloads ~200 MB by range requests, cached in `dem/regions/`) | `data/terrain/regions/` |
| Sites (E6) | `python3 sites.py` | instant | `data/sites*.json` |
| Polar horizons (E4, E9, E11) | `python3 make_horizon.py` (or `fine`, or a grid id such as `north_2km`) | about 3 min on 10 cores | `data/horizon/` |
| Whole-Moon horizons (E8, E10) | `python3 make_horizon_global.py coarse`, then `fine` | 4 s / a few min | `data/horizon/global_coarse.bin`, `global_fine/` |
| Validation (E7) | `python3 validate.py` | 3 s | `validation_results.csv` and the numbers in `ACCURACY.md` |

**Shared modules**
- `dem.py` loads the LOLA polar maps. Its projection is checked against five known craters.
- `horizon.py` holds the skyline algorithm, explained at the top of the file.

**SI acknowledgement:** this code was written with Claude (Anthropic) under Teammate 3's direction. See `data/README.md`.

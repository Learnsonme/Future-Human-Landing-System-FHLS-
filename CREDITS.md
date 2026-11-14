# Credits

Every external dataset, library and asset used by FHLS, with its source and licence.
NASA data and imagery are public domain; their use does not imply NASA endorsement.

## NASA data
| What | Used for | Source | Licence |
|---|---|---|---|
| JPL NAIF SPICE kernels: `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `pck00011.tpc`, `naif0012.tls` | Hourly Sun and Earth positions in the Moon's ME frame (`data/ephemeris.*`) | https://naif.jpl.nasa.gov/naif/data_generic.html | Public domain (NASA/JPL) |
| LRO LOLA polar gridded DEMs, 40 m and 240 m (80°S/80°N, 75°S/75°N) | Polar horizons and terrain tiles | https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/ | Public domain (NASA PDS) |
| LRO LOLA global DEMs LDEM_16, LDEM_64, LDEM_256 (regions) | Whole-Moon horizons, 474 m and 120 m terrain | https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ | Public domain (NASA PDS) |
| LRO LOLA LDEM_4 | Globe displacement (`viewer/assets/moon-displacement.tiff`) | https://pds-geosciences.wustl.edu/lro/lro-l-lola-4-gdr-v1/lrolol_1001/data/ldem_4/ | Public domain (NASA PDS) |
| LOLA south polar illumination map `AVGVISIB_85S_060M` (Mazarico et al. 2011, NASA PGDA) | Validation only (`engine/ACCURACY.md`) | https://pgda.gsfc.nasa.gov/products/69 | Public domain (NASA GSFC) |
| NASA SVS CGI Moon Kit (LROC colour `lroc_color_2k.jpg`) | Globe colour (`viewer/assets/moon-color-2k.jpg`, `moon-poster.webp`) | https://svs.gsfc.nasa.gov/4720 | Public domain (NASA SVS) |
| Apollo 11 photograph AS11-40-5903 (Buzz Aldrin, photo by Neil Armstrong) | Landing page "Why we built FHLS" | https://images.nasa.gov/details/as11-40-5903 | Public domain (NASA) |

## Libraries and fonts
| What | Used for | Source | Licence |
|---|---|---|---|
| three.js r170 and OrbitControls (`viewer/vendor/`) | 3D Moon and terrain | https://threejs.org | MIT (`viewer/vendor/THREE-LICENSE.txt`) |
| Open Sans variable font (`viewer/assets/open-sans.woff2`) | All text | https://fonts.google.com/specimen/Open+Sans | SIL Open Font License 1.1 (`viewer/assets/OFL-open-sans.txt`) |
| SpiceyPy | Engine: SPICE in Python | https://github.com/AndrewAnnex/SpiceyPy | MIT |
| NumPy | Engine: numerics | https://numpy.org | BSD-3-Clause |
| Pillow | Engine: PNG/WebP output | https://python-pillow.org | MIT-CMU (HPND) |

## Logos
| What | Used for | Source | Terms |
|---|---|---|---|
| FHLS logo and mark (`design/logo/fhls-*`) | Our team logo | Team FHLS | Ours |
| NASA Space Apps Challenge logo (`design/logo/app_logo*.png`) | Participation credit only, unmodified | https://www.spaceappschallenge.org/brand/ | Space Apps brand guidelines |

The NASA insignia ("meatball") and logotype ("worm") are not used.

## AI assistance
The code and much of the documentation were written with AI coding agents (Claude via Claude Code, and OpenAI Codex), directed, reviewed and tested by Team FHLS. See README.md, "Use of AI".

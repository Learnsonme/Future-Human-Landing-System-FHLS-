# FHLS accuracy notes (E7)

These notes say how far you can trust FHLS's sunlight numbers. They are written for the team, the pitch and the project page. The numbers come from `engine/validate.py`, and the per-point results are in `engine/validation_results.csv`.

## The check
We compared our model with **NASA's published south polar illumination map**: LOLA `AVGVISIB_85S_060M`, from Mazarico et al. 2011 (*Icarus* 211, 1066–1081), distributed as NASA PGDA product 69. It covers 60 m pixels from 85°S to the pole.

NASA's map defines "sunlit" as any part of the Sun's disc being visible, averaged hourly over **18.6 years** (one full lunar wobble cycle). For a fair test, we re-ran our model with the same definition and the same 18.6-year span, taking the Sun's position hourly from SPICE.

We used **400 random points** spread evenly over the region, plus our named sites.

## Results
| Comparison | Mean error | Typical error (RMSE) | Correlation | Within 10 points |
|---|---|---|---|---|
| Our model, observer at 0 m, vs NASA | **0.8 pts** | 2.0 pts | **0.990** | 99% |
| Our model, observer at 2 m, vs NASA | 0.8 pts | 1.9 pts | 0.992 | 99% |
| Sunlit areas only (NASA ≥ 20%), 0 m | 0.9 pts | 2.2 pts | 0.959 | 99% |

- **Permanent shadow:** NASA marks 37 of the random points as never lit, and we agree on all 37.
- **Bias:** essentially none (−0.3 to +0.7 points).

**In one sentence for the pitch:** across 400 random south polar points, our sunlight percentages are within about 1 percentage point of NASA's published LOLA illumination map on average (correlation 0.99), and we identify the same permanently shadowed ground.

## What the app shows vs the exact point
The app doesn't run this calculation live. It looks up the nearest precomputed grid point: every 250 m around the Artemis sites, and every 2 km elsewhere south of 84°S. Compared with computing the exact clicked spot, the app's value is off by:
- **3.8 points on average**
- within 10 points for 88% of clicks
- correlation 0.88

The largest errors are on narrow ridges, outside the 250 m boxes.

## Limits we state honestly
1. **Sunlight is very local near the pole.** On the Shackleton connecting ridge it ranges from 46% to 81% within 250 m. NASA's own 60 m pixels there vary from 0% to 86%. A result applies to the grid point we name, not to a whole area.
2. **Observer height matters on ridge tops.** At 0 m vs 2 m, Connecting Ridge goes from 42% to 59% and the Shackleton ridge test point from 55% to 86%. Over typical ground the difference is under 1 point. We use 2 m, roughly the height of a solar panel or antenna.
3. **The time window matters.** The app reports 2027–2028 only, while NASA averages 18.6 years. Individual months differ a lot from the long-term average, which is why the date range is shown.
4. **NASA's map has artifacts.** For example, there's a single 0% pixel on the lit ridge at 89.45°S, 137.3°W. NASA's README warns about these, so disagreements at single pixels are not automatically our error.
5. **Outside the south pole the precision is low.** There the terrain comes from a 1.9 km global map on a 1° grid (about 30 km). The angles are exact, but the terrain blocking is approximate, so the UI shows "lower precision".
6. **Earth visibility has not been validated** against an external map. It uses the same terrain code as the Sun.
7. **Visibility is not power or communications.** Seeing the Sun or Earth does not guarantee power generation or a radio link.

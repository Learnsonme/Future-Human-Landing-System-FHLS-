# Demo video (D3): 30-second script

**Hard rules from the Space Apps 2026 guide:**
- **30 seconds or less.** Over that, the project is not eligible for global judging.
- **Public link** with no login.
- **English subtitles** (burn them in).
- **No people under 18** in the video.
- **No SI-generated video or voice** unless it carries a visible watermark. Plan: a real screen recording plus a team member's own voice.
- **No NASA logo.** Credit NASA *data* in words only.

**Story in one line:** at the lunar south pole the Sun skims the horizon, so a few hundred metres decide whether a lander has power. FHLS shows you, for any spot and any hour.

## Script (about 70 words, spoken calmly)
| Time | Screen (record from the real app) | Voice-over = subtitle |
|---|---|---|
| 0:00–0:03 | Landing screen: slowly spinning Moon, FHLS title | "We're team FHLS: Future Human Landing System." |
| 0:03–0:08 | Drag the globe so the south pole tilts into view | "Artemis astronauts will land near the Moon's south pole, where the Sun barely rises." |
| 0:08–0:12 | Hover over the pole, then click the Connecting Ridge pin | "FHLS shows, for any spot and any hour, if the Sun and Earth are in view." |
| 0:12–0:20 | Fly-down onto the lit ridge. Drag the date slider so shadows sweep across the terrain. Beginner panel: **"About half the time · Sunlit about 6 hours in every 10"** | "On this ridge: sunlight six hours in ten. Slide the date and watch the shadows move." |
| 0:20–0:24 | Click the Shackleton crater floor. Panel: **"No"**, and the cold-trap sentence | "Next door, Shackleton's floor never sees the Sun." |
| 0:24–0:30 | Pull back to the globe. Bottom-left caption: "NASA LOLA + JPL SPICE data · within 1 point of NASA's LOLA illumination map (r = 0.99)" | "Built on NASA data, checked against NASA's own sunlight map. Choose where, and when, to land." |

**Word count:** 70 words in 30 s, about 2.3 words a second, which is calm. If a take runs long, cut "Slide the date and watch the shadows move" and keep the slider on screen.

**Check every number against the live app on the day.** If the data changes, these values change too.
- Connecting Ridge (−89.534°, −150.052°): sunlight 56% → "6 hours in every 10".
- Shackleton floor: 0%.
- Accuracy figures: `engine/ACCURACY.md`.

## Recording checklist
1. Use the deployed app (or `web/` locally) at 1920×1080 in a clean browser window with no bookmarks bar, at 100% zoom.
2. **Beginner mode:** it has the biggest, most readable text on video.
3. Pick a date where the ridge is lit at the start of the slider drag. **15 Jan 2027, 12:00 UTC** works: at the Connecting Ridge pin the Sun is 0.48° up and fully visible, and Earth is in view. It falls inside a 165-hour Sun + Earth window that starts 11 Jan 03:00 UTC.
4. Record each shot separately, with a few seconds of slack at both ends. Cut them together and trim to **≤ 30.0 s**. Check the exported file's length.
5. Subtitles: burn them in, white Open Sans on a semi-transparent `#141414` bar.
6. Optional music: royalty-free only, and list it in the project references.
7. Upload to YouTube (unlisted is fine) or Drive (anyone with the link). Test the link in a private window. Paste it into the project page.

## Fallback: 7-slide deck (if the video can't be made)
1. **Title:** FHLS, team name, member names, and the challenge name `[TEAM: exact challenge title]`.
2. **The problem:** a south pole photo. "The Sun skims the horizon; metres decide power and contact."
3. **What FHLS does:** a screenshot of a click → fly-down → results panel.
4. **Three modes:** Beginner / Intermediate / Advanced screenshots side by side.
5. **How it works:** SPICE ephemeris + LOLA skylines → browser maths in 10 ms, offline.
6. **Can you trust it:** a scatter plot of ours vs NASA (from `engine/validation_results.csv`), 0.8 pts mean error, r = 0.99.
7. **What's next:** finer grids, rover routes, more years. Plus the links.

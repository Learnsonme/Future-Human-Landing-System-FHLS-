# D6: anti-generic-AI review of the site (T3, 14 Nov 2026)

**What I reviewed:** current `main` served locally, plus the deployed site at https://futurehumanlandingsystem.netlify.app/web/. Both were checked at 1440 × 900 and 390 × 844, in all three modes, with Connecting Ridge selected. Screenshots came from `design/review/walkthrough.mjs`. There were no console errors or warnings.

## Verdict
**It passes**, with one blocking change (F1).

The app reads like a mission tool, not a template:
- one real NASA Moon on the first screen, with real numbers under it
- specific labels ("2027-01-15 12:00 UTC · hour 348")
- colour that always means something (Sun, Earth, both)
- monospace data, thin rules and left-aligned text
- honesty notes ("rendered shadows are illustrative", "computed for a point 50 m from your click")

T2 was right to refuse the purple, pink and cyan glow treatment. The palette is intact.

## Findings
| # | Severity | Owner | Where | Finding | Fix |
|---|---|---|---|---|---|
| F1 | **Blocking** | T2 | `web/components/star-transition.js`, `show()` | The full-screen "supernova" (rings, embers and spikes over 92–97% of the viewport at near-full opacity, on every screen change) breaks D5. It is the "glowing blob" look in motion and a photosensitivity risk, and it costs about 1 s on every mode switch. | Follow D5: a small star only on the first Start (≤ 15% of the viewport, ≤ 60% opacity, ≤ 800 ms), and a plain 400–700 ms crossfade everywhere else. |
| F2 | Must fix | T2 | `web/app.js:627` | The Advanced panel still says "Hour-by-hour table and CSV download arrive with W6", directly above the working table. | Delete the line. |
| F3 | Should fix | T2 | `web/app.css` (starfield `position: fixed; z-index: 0`, transparent panels) | Stars show through behind the hour table, the timeline and the terrain caption, so dots appear between the numbers. | Give the explorer's content column an opaque `--bg`, and panels `--surface`. Stars only in the margins (D5). |
| F4 | Should fix | T2 / repo owner | Whole site | The **"Powered by Netlify"** badge sits over the bottom-right corner on every screen. It isn't ours and it covers content. | Remove it in the Netlify site settings, or by claiming the site if it was deployed without an account. If it can't be removed, keep content clear of that corner. |
| F5 | Should fix | T1 | Landing viewer | The first-screen Moon is mostly in **night**: it's lit by the real Sun for 2027-01-15 and seen from the dark side. The first impression is a dim crescent. | Keep the real lighting, but point the landing camera at the sunlit hemisphere for that date (for example, place the camera near the sub-solar direction, offset about 30°). |
| F6 | Should fix | T2 | `web/app.js:16-17`, `web/index.html:52` | The landing "Live check · Shackleton 89.90°S" uses (−89.90, 0). The code comment calls it the point T3 validated against, but that point is **−89.45, −137.3**. | Use `{ lat: -89.45, lon: -137.3 }` and label it "Shackleton ridge 89.45°S". The strip will then show the SPICE-verified Sun +0.34°, Earth +5.24°. |
| F7 | Nice | T2 | `.sites .site-list { max-height: 220px }` | The candidate list scrolls after 5 of 17 sites, with no visible scroll cue, while the column below is empty. | Raise the max-height to fill the column, or show all 17. |
| F8 | Nice | T2 | App bar and timebar at 390 px | "2027 – 2028" wraps onto two lines, and "DATE" sits apart from its field. | Use `white-space: nowrap` on the range label, and put the date label above the field on phones. |
| F9 | Nice | T2 | Landing data strip | "South polar horizon grid, 181 × 181 points × 180 azimuths" runs into the column divider at 1440 px. | Allow a wrap or shorten the line, e.g. "181² grid · 180 directions". |

**Checked and fine:**
- palette and tokens
- type sizes (no more than 3 per screen)
- no emoji
- no marketing copy
- reduced motion: T2 verified this, and I didn't re-test the transition
- the date slider moves the shadows
- the Beginner wording comes from `design/beginner.js`
- the honesty line is always shown

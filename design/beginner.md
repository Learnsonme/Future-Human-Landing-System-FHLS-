# Beginner mode: wording and icons (D1)

The wording logic is in `design/beginner.js`. Call it rather than writing your own text, so the wording stays the same everywhere. The icons are in `design/icons/*.svg`, and the same SVG strings are exported as `ICONS`.

## Using it (T2)
```js
import { beginnerSummary, beginnerNow, ICONS, toneColor, WHY } from "../design/beginner.js";

const r = await core.analyze(lat, lon, { start, end });
const b = beginnerSummary(r, { placeName: site?.name, clickLat: lat, clickLon: lon });
// b.answers[i]: { icon, tone, question, answer, detail }  → one row each for Sun and Earth
// b.sentence: the one sentence under the two rows
// b.notes[i]: { icon | null, text }  → small print (precision, computed-for point, honesty line)
const now = beginnerNow(r, k);   // k = slider hour within the range → { sun, earth, tone }
```
- **Icon colour:** wrap the icon in an element with `style="color: ${toneColor(a.tone)}"`. The SVGs use `currentColor`.
- **Layout:** one row per answer, with the icon (24 px), the question in muted text, and the answer in body text. Put `detail` beneath in 12 px muted text.
- **Notes are required.** Always show the honesty line in `b.notes`, and show the lower-precision note whenever it is present.
- **WHY texts:** `WHY.sun_moves`, `WHY.seasons`, `WHY.earth_bobs` and `WHY.shadow` are optional "Why?" explainers.

## Rules the wording follows
1. **Only claim what we computed: visibility.** Use "Sunlight for solar panels?" and "Earth in view for direct contact?". Never say "has power" or "can talk to Earth".
2. **Plain fractions instead of percentages:** "about 7 hours in every 10". Durations are rounded to hours, days or months.
3. **Lead with a yes/no answer, then give one sentence.** The sentence names the spot when we know it.
4. **No hype words.** No "perfect", "ideal" or "revolutionary". A good spot is called "a strong spot", and nothing stronger.
5. **Say when the answer is approximate.** Show "Lower precision" off the south pole, and "Worked out for a point N m from your click" whenever the grid point is 20 m or more away.

## Thresholds (percent of hours in the selected range)
| Answer | Sunlight | Earth in view |
|---|---|---|
| Yes, all the time | – | ≥ 95% |
| Yes, most of the time | ≥ 70% | ≥ 60% |
| About half the time | 40–70% | 40–60% |
| Part of the time | 15–40% | 5–40% |
| Rarely | 1–15% | – |
| No | < 1% | < 5% |

## Sentence cases
| Case | Example |
|---|---|
| Normal lunar day (away from the poles) | "Apollo 11 site has the normal lunar day: about two weeks of sunlight, then about two weeks of night. Earth is always in view." |
| Never sunlit, no Earth | "Shackleton crater stays in shadow and out of Earth's view: a cold trap where ice may survive, but hard to work in." |
| Sunlit but no Earth | "… never sees Earth, so messages would need a relay satellite." |
| Both in view ≥ 50% | "… is a strong spot: Sun and Earth are both in view about 6 hours in every 10." |
| Both in view 20–50% | "… has Sun and Earth together about 3 hours in every 10, so a mission would plan around the gaps." |
| Both in view < 20% | "… rarely has Sun and Earth at the same time, so batteries and a relay would be needed." |

When the longest dark spell is 10 days or more, the sentence adds "Expect dark spells of about N days".

## Icons
24 × 24 viewbox, 1.5 px round line, no fill, `currentColor`, matching the thin-line rule in `style.md`. There are no emoji.

| Icon | Meaning | Tone |
|---|---|---|
| `sun` | sunlight | `--sun` |
| `earth` | Earth in view | `--earth` |
| `both` | Sun and Earth together | `--both` |
| `dark` | no sunlight | `--muted` / `--none` |
| `terrain` | terrain / computed-for point | `--terrain` |
| `approx` | lower precision | `--muted` |

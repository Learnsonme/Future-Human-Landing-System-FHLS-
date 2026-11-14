# Prompt · S20 Best landing dates (small, client-side, before the 11:00 freeze)

Paste everything below the line into your AI.

---

Go to ~/Documents/nasa_space_app and run `git pull --rebase origin main`. Read AGENTS.md, design/style.md, and the analyze() / windows() functions in core/fhls-core.js. Add to TASKS.md and claim: `- [~] S20 · T1 · Best landing dates for the selected site (claimed by T1, HH:MM)` (update the existing S20 line), commit, push, then build.

## Goal
The challenge asks users to "compare landing sites **and dates** quickly". Today the timeline shows windows but gives no one-glance answer. Add a **"Best landing dates"** card to the results panel that answers: *when should a lander arrive at this spot?*

## Definition (use exactly this, and say it in the UI)
- A **good window** = a continuous run of hours with **both** sunlight (power flag) **and** Earth in view (comms flag), from `analyze().windows.both` over 2027-01-01 → 2028-12-31.
- **Best dates** = the **3 longest good windows**, sorted by length (ties: earlier first). Show start date, end date, length in days (1 decimal).
- Also show the **longest blackout** (longest run with no sunlight: `summary.longest_dark_hours`) with its dates, so users see the risk too.
- If the site has **no Earth contact at all** (e.g. far side): say "No direct line to Earth from here in 2027–2028", then rank the 3 longest **sunlight-only** windows instead and label them "Best sunlight windows (no Earth contact)".
- If there are no windows at all (permanent shadow): "This spot never gets sunlight in 2027–2028."

## UI
- New card at the top of the results panel, under the site name: title "Best landing dates".
- **Beginner:** one sentence: "Best time to land here: 3 Mar – 17 Mar 2028, 14.2 days of sunlight and Earth contact." Plus the blackout as a second short sentence.
- **Intermediate:** the top 3 windows as a small list (dates + days) and the longest blackout.
- **Advanced:** same list with exact UTC start/end hours, plus a "Copy" or CSV row for the windows.
- **Click a window → jump the date slider/timeline to its start** (and the panorama to that hour), using the existing time-setting function in web/app.js.
- In the **compare view**, add one row "Best window" per pinned site (dates + days), so sites can be compared on dates at a glance.
- Use style.md tokens only (`--both` for good windows, `--muted` for blackout text). Respect light/dark mode. Works at 375 px.

## Rules
- **Client-side only.** No new data files, no engine changes, no change to core/fhls-core.js logic. You may add a small pure helper (e.g. `bestWindows(result, n)`) in web/ or a new file web/components/best-dates.js, with 2–3 tests in the style of core/test.mjs if quick.
- Dates in the UI: "3 Mar 2028" style (UTC), never ambiguous 03/04.
- Keep the honesty line in small text: "Sunlight and Earth in view; not a guarantee of power, radio link or a safe landing."

## Test
- Shackleton-area Artemis site: should show sensible windows (days long, not hours).
- An equator near-side spot: Earth always in view, windows ≈ the lunar day (~14 days).
- A far-side spot: the "no Earth contact" message + sunlight windows.
- A permanently shadowed crater floor: the "never sunlit" message.
- Zero console errors; `node core/test.mjs` all "ok"; check laptop + phone, light + dark.

## Deadline
Merged and pushed by **Sunday 10:00 (Bahrain)**. If it isn't solid by then, revert it (`git revert`) so the 11:00 freeze ships a clean site. Then tick S20 and log it.

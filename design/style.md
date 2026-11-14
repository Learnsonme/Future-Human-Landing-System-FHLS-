# FHLS style guide (read before building any UI)
Goal: look like a **mission tool built by people who care**, not a generic AI template.

## Colours (from our logo)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#141414` | Page background (near-black, not pure black) |
| `--surface` | `#1E1E1E` | Panels, cards |
| `--line` | `#2E2E2E` | Borders, grid lines |
| `--text` | `#ECE9E2` | Main text (warm off-white like the logo) |
| `--muted` | `#9A978F` | Labels, captions |
| `--sun` | `#F2B33D` | Sunlight / power |
| `--earth` | `#4C9BE8` | Earth / comms |
| `--both` | `#5BC08A` | Power + comms |
| `--none` | `#3A3A3A` | Neither (dark) |
| `--terrain` | `#6B6760` | Horizon / terrain silhouette |

Only use these colours. The Sun/Earth/both/none colours mean the same thing on every screen.

## Light mode (D7, for M13)
Feel: **a technical drawing on warm paper**, not a white app. Same structure, same meanings, only the tokens change.
Apply under `:root[data-theme="light"]`. Dark stays the default when the system has no preference.

| Token | Dark | Light | Light contrast on `--bg` |
|---|---|---|---|
| `--bg` | `#141414` | `#F4F2ED` (warm paper) | – |
| `--surface` | `#1E1E1E` | `#FBFAF7` | – |
| `--line` | `#2E2E2E` | `#D9D5CC` | decorative only |
| `--text` | `#ECE9E2` | `#1C1B19` | 15.4 : 1 |
| `--muted` | `#9A978F` | `#635F57` | 5.7 : 1 |
| `--sun` | `#F2B33D` | `#8A5A00` | 5.3 : 1 |
| `--earth` | `#4C9BE8` | `#1C64A8` | 5.5 : 1 |
| `--both` | `#5BC08A` | `#22774A` | 4.9 : 1 |
| `--none` | `#3A3A3A` | `#CFCBC2` | fill only |
| `--terrain` | `#6B6760` | `#8C877D` | fill/stroke only |

**Fill tokens (new, same value in both modes)** for timeline bands, chart areas and status chips, where colour sits behind or beside a text label, never as the text itself:
`--sun-fill: #F2B33D` · `--earth-fill: #4C9BE8` · `--both-fill: #5BC08A`.
In light mode, text and thin strokes use `--sun` / `--earth` / `--both`; areas use the `-fill` versions. In dark mode both look the same, so nothing changes there.

**Rules**
- **Space stays dark in both modes:** the 3D Moon, terrain view, starfield and landing sky keep the dark palette. Only panels, text, cards, tables and charts switch. Where a light panel meets the dark space view, use a 1 px `--line` edge, no shadow.
- **Stars and shooting stars:** only on dark areas. None on light panels.
- **No pure white (`#FFFFFF`) or pure black anywhere.**
- **Switching:** colours cross-fade in 300 ms with `--ease`; no layout movement. Reduced motion → instant switch.
- **The toggle (M13):** 32 px round button, bottom-right, 16 px from the edges, `--surface` background, 1 px `--line` border, icon in `--muted` (`--text` on hover). Icon shows the mode you will switch **to** (moon in light mode, sun in dark mode). `aria-label` "Switch to light mode" / "Switch to dark mode". Shared focus ring.
- **Check:** every screen in both modes on laptop and phone; no text below 4.5 : 1.

## Type
- Logo font: **Sugo Display**, used in the Canva logo. Don't embed it as a web font, because its web licence is unconfirmed and the app must stay offline with self-hosted fonts. Where the wordmark is needed, use the logo image `design/logo/fhls-logo-transparent.png`. Other titles use Open Sans SemiBold, UPPERCASE, used sparingly.
- Body, labels, numbers and data: **Open Sans** (S14, user decision: Plex read as blocky). Self-hosted variable font `viewer/assets/open-sans.woff2` (SIL OFL, weights 300–800), so the app stays offline. Data columns use `font-variant-numeric: tabular-nums` so numbers line up. The `--mono` token now also points at Open Sans; small uppercase labels keep their letter-spacing.
- Sizes: 14px body, 12px labels, 32–48px page titles. No more than 3 sizes per screen.

## Rules to avoid the "AI-generated" look
- ❌ No purple/blue gradients, glowing blobs, glassmorphism cards, or emoji as icons.
- ❌ No marketing filler ("Revolutionize lunar exploration!"). Use plain, specific sentences.
- ❌ No identical rows of 3 feature cards with icons.
- ✅ Real NASA imagery and our real data on the first screen.
- ✅ Specific labels: "Shackleton Rim · 15 Jan 2027 · Sun 0.34° above horizon".
- ✅ Thin lines, generous spacing, left-aligned text, a clear grid (like a technical drawing).
- ✅ Every element must answer a question a user has. If it doesn't, remove it.

## Motion (D5)
**Principle:** motion explains something (where you are going, what changed, how light moves over terrain) or it does not happen. The data never moves for decoration.

### Allowed, with limits
| What | Duration | Easing | Notes |
|---|---|---|---|
| Home Moon rotation | about 1 turn per minute | linear | Landing screen only. |
| Camera fly-to a site | 1.2–2.5 s | `--ease` (`cubic-bezier(.4,0,.2,1)`) | Spatial motion may exceed the 1.2 s cap. It must be cancellable (Home, a new click). |
| Shadows moving with the date slider | live | n/a | This is the product. Never smooth it artificially. |
| Screen change (any screen to any screen) | 400–700 ms | `--ease` | Crossfade, with an optional ≤ 8 px rise. |
| **Start** (landing → mode picker), first time per visit | ≤ 800 ms | `--ease` | The single "moment" the app gets. See the transition rules below. |
| Hover / press feedback | ≤ 150 ms | `--ease` | Colour, opacity, or ≤ 2 px translate. |
| Section reveal on scroll (S1) | ≤ 500 ms, **once** | `--ease` | Opacity plus ≤ 8 px rise. |
| Text entrance, inwards (M14) | 400–500 ms total, **once per screen/panel** | `--ease` | Opacity plus ≤ 8 px inward slide; lines staggered 40–60 ms. Never on live value updates. |
| "Best figure" marker pulse | once, ≤ 600 ms | `--ease` | Never loop it. |

### Not allowed
- **Full-screen flashes.** Never light more than about 25% of the viewport at once, never above 60% opacity, and never more than one flash per transition. This is a photosensitivity rule (WCAG 2.3.1), not just a taste rule.
- **No shockwave rings, particle or ember bursts, light spikes, bloom or glow halos.** These are the "glowing blob" look in motion.
- **No looping animation inside a data area.** That means panels, the timeline, the panorama, tables and the pin cards.
- **No animated gradients, parallax, bounce or elastic easing, typewriter text, or numbers counting up.** A figure must be readable the moment it appears.
- **Never use `--earth` or `--both` for decoration.** They mean comms and power everywhere else.

### Transitions (ruling on the W9 "supernova")
The full-screen supernova goes beyond these limits: it lights 92–97% of the viewport at near-full opacity, uses rings and embers, and plays on *every* screen change. Replace it with:
- **Start, first time per visit:** one small star (`--text`, with a `--sun` core) brightens at the Start button. It covers at most about 15% of the viewport and peaks at 60% opacity. The screens crossfade under it, ≤ 800 ms end to end. No rings, no particles.
- **Every other screen change:** a plain 400–700 ms crossfade. Mission planners switch modes often, and a 1-second effect each time slows them down.

### Starfield
| Screen | Stars per megapixel | Twinkle | Shooting stars |
|---|---|---|---|
| Landing and mode picker | up to 230 | gentle | at most one every ~15 s |
| Explorer, Beginner | 150 | as built (0.55) | none |
| Explorer, Intermediate | 95 | 0.35 | none |
| Explorer, Advanced | 55 | 0.18 | none |
- **Colours:** stars use `--text` and `--muted` at low alpha, with about one in twelve in `--sun`. No other hues.
- **On the explorer, stars may only show in the page margins,** never behind panels, the timeline, the terrain view or tables. Give those areas an opaque `--bg` or `--surface` background.
- **Decorative canvases** run at ≤ 24 fps, pause while the tab is hidden, cap the device pixel ratio at 2, and use `pointer-events: none`.

### Reduced motion (`prefers-reduced-motion: reduce`)
- **Moon:** static, lit view with no rotation.
- **Fly-to:** an instant cut, or a ≤ 150 ms opacity fade.
- **Screen changes:** an instant swap. The Start star does not play.
- **Starfield:** painted once. No twinkle, no shooting stars.
- **Hover:** colour change only.
- **Live setting:** listen for changes to the setting while the page is open, not just on load.
- The date slider still moves the shadows. That is content, not decoration.

### Round 2 additions (M11)
These extend D5 for the round-2 tasks. Where they conflict with D5 above, these win.

**Title + Moon entrance (M5)**
- **When:** on first page load, once per visit.
- **What moves:** the title block and the Moon enter as **one composition**. The title slides in from the left and the Moon from the right, each at most 48 px, converging into place.
- **Timing:** about 700 ms with `--ease`, opacity 0 → 1. The Moon may also scale 0.96 → 1. The Moon may lag the title by up to 120 ms.
- **Not allowed:** rotation, bounce, blur above 4 px, and letter-by-letter or typewriter text.
- **After the entrance, text stays still** while it is being read.
- **Never block input:** Start must be clickable within 300 ms of load.
- **Reduced motion:** everything simply appears.

**Background depth (M6), landing screen only**
- **Star layers:** up to 3 layers (far, mid, near) with rising density and size, drifting slowly in one fixed direction at about 2, 4 and 8 px/s.
- **Optional pointer parallax:** the near layer at most 12 px, the Moon at most 6 px, the title 0 px.
- **Shooting stars:** at most one every ~15 s (as in D5).
- **Colours:** palette tokens only. No nebula clouds, colour gradients or glow blobs.
- **Reduced motion:** static layers, no parallax.

**Space → terrain handover (M1)**
- **One continuous camera path:** the globe and the terrain detail **crossfade over 400–600 ms of the flight**, with no pop, jump or flash.
- **The same Sun vector** lights both, so shadows don't flip at the handover.
- **The whole fly-to** stays 1.2–2.5 s.
- **Reduced motion:** an instant cut.

**Landing Moon blend (M2)**
- **No box:** the canvas background is transparent (or exactly `--bg`). No visible rectangle, border or vignette edge.
- **Stars:** the page's stars continue behind the Moon's surroundings, but not over the disc.
- **Brightness:** the lit limb must not be brighter than `--text`.
- **Halo:** none.

**First Moon on load (M3)**
- **Speed:** a Moon is visible within about 1 s.
- **First frame:** a poster image with the same framing and lighting.
- **Swap:** a ≤ 300 ms crossfade to the live globe.
- **No spinner.**

**Pin markers (M4, M8)**
- **Ring:** a 1.5 px `--text` ring, 12 px across, constant on screen at every zoom.
- **Label:** the pin number (1–3) in Open Sans 11 px.
- **The active pin** uses `--sun`. Never use `--earth` or `--both`.
- **Animation:** one 600 ms pulse on placement is allowed. Never loop it.

**Logos (M7)**
- **FHLS logo:** the wordmark may be the landing **title** (as built in M5/M7), up to 440 px wide. Any secondary placement is at most 160 px wide, in `fhls-logo-transparent.png` or the square mark.
- **Footer credit:** the NASA Space Apps logo (`app_logo.png`) and the team logo, 24–32 px tall at 80% opacity.
- **Usage:** follow `design/logo/README.md`. Never use the NASA "meatball" or NASA insignia.

## Navigation: Home (H3)
**What Home means:** go back to the landing screen (the spinning Moon). Nothing is lost: mode, selected site, date, hour and pins all stay, and Start → mode → explorer resumes where you were.

**Placement**
- **Explorer app bar:** the first item on the left, before the `FHLS` brand.
  - Layout: `HOME · FHLS [MODE] CHANGE ……… DATE [field]`.
  - Use the existing quiet button style (`.btn--quiet`: 12 px, `--muted`, `--text` on hover), with a 1 px `--line` divider between HOME and FHLS.
- **Mode picker:** top-left, above "STEP 1 OF 2", in the same quiet style.
  - The existing **Back** at the bottom stays, and returns to whichever screen opened the picker: the landing screen or the explorer.
- **Phone (≤ 600 px):** HOME stays in the first row of the app bar and is never wrapped or hidden. Its touch target is at least 44 × 44 px; pad it, don't enlarge the text.

**Wording**
- Visible label: **HOME** (uppercase, like the other quiet buttons). No icon, and no emoji.
- Accessible name: `aria-label="Home: back to the start screen"`.
- No confirmation dialog, because nothing is lost.
- **Optional:** after a return with a site selected, the landing's secondary link may read **"BACK TO CONNECTING RIDGE"** (the site name) instead of "CHOOSE A MODE".

**Keyboard and focus**
- **Tab order:** HOME is the first focusable element in the app bar and in the mode picker. Enter and Space activate it.
- **Focus ring:** the shared `outline: 2px solid var(--sun); outline-offset: 2px`.
- **After any screen change,** move focus to the new screen's heading (give it `tabindex="-1"`, with no visible ring on programmatic focus) so screen readers announce where you are.
  - Returning to the explorer puts focus back on the control that left it: CHANGE, or HOME then Start.
- Don't bind Escape or single-letter shortcuts, because the date field and screen readers use them.

**Behaviour**
- **During a fly-to,** Home cancels the flight immediately (H1). Nothing keeps running in the background.
- **Repeated Home → Start round trips** must not create a second canvas, a second viewer or a second starfield.
- **Motion** follows D5: a plain crossfade, and an instant swap with reduced motion. The Start star only plays the first time per visit.

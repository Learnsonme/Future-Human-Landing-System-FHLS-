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

## Type
- Logo font: **Sugo Display**, used in the Canva logo. Don't embed it as a web font, because its web licence is unconfirmed and the app must stay offline with self-hosted fonts. Where the wordmark is needed, use the logo image `design/logo/fhls-logo-transparent.png`. Other titles use IBM Plex Sans SemiBold, UPPERCASE, used sparingly.
- Body: **IBM Plex Sans**. Numbers and data: **IBM Plex Mono** (gives a real mission-control feel).
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
| Section reveal on scroll | ≤ 400 ms, **once** | `--ease` | Opacity only. |
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

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
- Titles: the same bold condensed font as the logo (T3 to confirm the font name), UPPERCASE, used sparingly.
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

## Motion
- The Moon rotates slowly (about 1 turn per minute). Transitions take 0.6–1.2 s with ease-in-out.
- Respect `prefers-reduced-motion`.

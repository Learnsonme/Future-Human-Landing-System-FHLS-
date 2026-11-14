# FHLS logo assets (D2)

All of these are generated from `fhls-logo-original.png` by `python3 design/make_logo_assets.py`.

| File | Size | Use |
|---|---|---|
| `fhls-logo-original.png` | 2000², dark background | Source, as provided by the team |
| `fhls-logo-transparent.png` | 1127×909, transparent | Full logo on dark screens (landing page, slides, video title) |
| `fhls-mark-512.png` | 512², transparent | Square mark (Moon + lander) for app headers and social cards |
| `fhls-mark-512-bg.png` | 512², on `#141414` | The mark where transparency isn't supported |
| `icon-192.png` | 192², transparent | PWA / manifest icon |
| `apple-touch-icon-180.png` | 180², on `#141414` | iOS home screen |
| `favicon-32.png` | 32², transparent | Browser tab |
| `fhls-logo-320w.png` | 320×258, transparent | **M7:** the landing-screen logo, shown at 160 px wide (2× for sharp screens) |
| `fhls-logo-ink.png` | 1127×909, transparent | **Light mode:** the same logo with the lettering in ink `#1C1B19`; Moon and lander unchanged. Made by `python3 design/make_logo_ink.py`. The page swaps to it when `data-theme="light"` |
| `app_logo.png` | 1527×600, transparent | **NASA Space Apps Challenge logo**, the official "Color and White" version, downloaded unmodified from assets.spaceappschallenge.org (Space Apps brand page) |
| `app_logo-64h.png` | 163×64, transparent | **M7:** the Space Apps logo for the footer credit, shown at 32 px tall |

**Rules**
- **`fhls-logo-transparent.png` on dark backgrounds only** (off-white lettering); on light backgrounds use `fhls-logo-ink.png`.
- **Don't recolour, stretch or add effects.**
- **The transparent logo keeps the Moon and lander solid,** so stars don't show through them. Only the soft glow is see-through.
- **The square mark's lowest sliver of the Moon is filled in.** In the original it's hidden behind the title, so the script fills it with the Moon's own texture.

**NASA Space Apps logo rules.** We follow them conservatively, because the brand page's rule text wasn't machine-readable.
- Use it **unmodified**: no recolouring, cropping or effects. It is white with a red "NASA", made for dark backgrounds, and suits ours.
- Use it **as a credit only** ("Made for the NASA Space Apps Challenge 2026"), small in the footer. Never let it look like Space Apps or NASA made or endorse FHLS.
- **Never** use the NASA "meatball" insignia or the NASA worm. Those are not ours to use.

**Team logo.** The FHLS logo (`fhls-logo-*`) is our team's logo. If the team has a separate team badge, add it here as `team_logo.png` and give it the same footer treatment.

**HTML for T2 (M7)**
```html
<!-- landing -->
<img src="../design/logo/fhls-logo-320w.png" width="160" alt="FHLS: Future Human Landing System">
<!-- footer credit -->
<footer class="credit">
  <img src="../design/logo/app_logo-64h.png" height="32" alt="NASA Space Apps Challenge">
  <span>Made for the NASA Space Apps Challenge 2026 · data: NASA LRO LOLA, JPL SPICE</span>
</footer>
```

**HTML for T2 (favicons)**
```html
<link rel="icon" type="image/png" sizes="32x32" href="../design/logo/favicon-32.png">
<link rel="apple-touch-icon" href="../design/logo/apple-touch-icon-180.png">
```

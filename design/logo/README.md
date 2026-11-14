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

**Rules**
- **Dark backgrounds only.** The lettering is off-white, so the logo disappears on white.
- **Don't recolour, stretch or add effects.**
- **The transparent logo keeps the Moon and lander solid,** so stars don't show through them. Only the soft glow is see-through.
- **The square mark's lowest sliver of the Moon is filled in.** In the original it's hidden behind the title, so the script fills it with the Moon's own texture.

**HTML for T2**
```html
<link rel="icon" type="image/png" sizes="32x32" href="../design/logo/favicon-32.png">
<link rel="apple-touch-icon" href="../design/logo/apple-touch-icon-180.png">
```

"""D2 · Logo assets from design/logo/fhls-logo-original.png (2000×2000, flat dark background).

Run:  python3 design/make_logo_assets.py
Outputs in design/logo/:
  fhls-logo-transparent.png   full logo, background removed, trimmed + padded
  fhls-mark-512.png           square mark (Moon + lander), transparent
  fhls-mark-512-bg.png        same on the app background #141414 (for places without transparency)
  favicon-32.png, apple-touch-icon-180.png, icon-192.png
Background removal = "colour to alpha" against the flat background colour, which keeps the Moon's
soft glow instead of leaving a dark fringe.
"""
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent / "logo"
APP_BG = (0x14, 0x14, 0x14)


def colour_to_alpha(rgb, bg):
    """Make `bg` transparent; pixels are un-blended so they look identical on that background."""
    p = rgb.astype(np.float64)
    b = np.array(bg, np.float64)
    # how far each channel is from bg, relative to the furthest it could go in that direction
    room = np.where(p >= b, 255.0 - b, b)
    alpha = np.max(np.abs(p - b) / np.maximum(room, 1e-6), axis=2)
    alpha = np.clip(alpha, 0, 1)
    with np.errstate(invalid="ignore", divide="ignore"):
        colour = b + (p - b) / alpha[..., None]
    colour = np.nan_to_num(np.clip(colour, 0, 255))
    return np.dstack([colour, alpha * 255]).round().astype(np.uint8)


def trim(rgba, pad_frac=0.06, threshold=8):
    a = rgba[..., 3]
    ys, xs = np.where(a > threshold)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    pad = int(pad_frac * max(y1 - y0, x1 - x0))
    out = np.zeros((y1 - y0 + 2 * pad, x1 - x0 + 2 * pad, 4), np.uint8)
    out[pad:pad + y1 - y0, pad:pad + x1 - x0] = rgba[y0:y1, x0:x1]
    return out


def square(rgba):
    h, w = rgba.shape[:2]
    s = max(h, w)
    out = np.zeros((s, s, 4), np.uint8)
    out[(s - h) // 2:(s - h) // 2 + h, (s - w) // 2:(s - w) // 2 + w] = rgba
    return out


def on_bg(rgba, bg):
    a = rgba[..., 3:4] / 255.0
    rgb = rgba[..., :3] * a + np.array(bg) * (1 - a)
    return Image.fromarray(rgb.round().astype(np.uint8))


def fit_moon_circle(lum, title_top, threshold=110):
    """Fit a circle to the Moon's limb: left/right edges per row + top edge per column."""
    on = lum > threshold
    rows_with = np.where(on.sum(axis=1) > 50)[0]
    top = rows_with[(rows_with > 0)].min()
    pts = []
    for r in range(top + 30, title_top - 90, 4):                  # below the lander, above text
        xs = np.where(on[r])[0]
        if len(xs):
            pts += [(xs.min(), r), (xs.max(), r)]
    x, y = np.array(pts, float).T
    A = np.c_[2 * x, 2 * y, np.ones(len(x))]
    (cx, cy, c), *_ = np.linalg.lstsq(A, x ** 2 + y ** 2, rcond=None)
    return cx, cy, float(np.sqrt(c + cx ** 2 + cy ** 2))


def main():
    src = np.asarray(Image.open(HERE / "fhls-logo-original.png").convert("RGB"))
    bg = tuple(int(v) for v in np.median(src[:20, :20].reshape(-1, 3), axis=0))
    rgba = colour_to_alpha(src, bg)
    pure_alpha = rgba[..., 3].copy()          # before forcing solids (used for the lander cut-out)
    # Solid artwork stays opaque (otherwise stars would show through the Moon's dark patches);
    # only the faint outer glow keeps partial transparency.
    solid = rgba[..., 3] > 0.25 * 255
    rgba[solid, :3] = src[solid]
    rgba[solid, 3] = 255

    Image.fromarray(trim(rgba)).save(HERE / "fhls-logo-transparent.png", optimize=True)

    # Mark: Moon + glow + lander only (no title, no "FHLS"/"2026").
    alpha = rgba[..., 3]
    rows = np.where((alpha > 200).sum(axis=1) > 600)[0]      # wide solid rows = title lettering
    title_top = rows.min()
    # Moon disc: least-squares circle through its limb (brightness > 110, glow is dimmer).
    # Measured on the original: centre (1007.4, 929.7), r 219.2, edge error ~1 px.
    cx, cy, radius = fit_moon_circle(src.mean(axis=2), title_top)
    # Keep only the Moon disc (this excludes "FHLS"/"2026") and the lander above it.
    # The title hides the disc's lowest sliver: fill it with texture rotated in from the right-hand
    # highlands (bottom → right, 90°), then draw a fresh soft glow around the disc.
    cut = title_top - 6
    h, w = alpha.shape
    yy, xx = np.mgrid[:h, :w]
    dx, dy = xx - cx, yy - cy
    in_disc = np.hypot(dx, dy) < radius - 1
    in_lander = (yy < cy - radius + 0.06 * radius) & (np.abs(dx) < 0.35 * radius) & ~in_disc \
        & (pure_alpha > 0.45 * 255)                     # solid lander parts, not the glow
    mark = np.zeros_like(rgba)
    keep = (in_disc & (yy < cut)) | in_lander
    mark[keep] = rgba[keep]
    mark[in_lander, 3] = 255
    hidden = in_disc & (yy >= cut)
    src_y = np.round(cy - dx[hidden]).astype(int)
    src_x = np.round(cx + dy[hidden]).astype(int)
    mark[hidden] = rgba[src_y, src_x]
    mark[in_disc, 3] = 255
    # soft glow: blurred disc in the logo's off-white, under the artwork
    from PIL import ImageFilter
    disc_img = Image.fromarray((in_disc * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius * 0.06))
    glow_a = (np.asarray(disc_img) / 255.0 * 0.55 * 255).astype(np.float64)
    glow = np.zeros_like(mark, dtype=np.float64)
    glow[..., :3] = (236, 233, 226)
    glow[..., 3] = glow_a
    a_top = mark[..., 3:4] / 255.0
    a_bot = glow[..., 3:4] / 255.0
    a_out = a_top + a_bot * (1 - a_top)
    rgb_out = (mark[..., :3] * a_top + glow[..., :3] * a_bot * (1 - a_top)) / np.maximum(a_out, 1e-6)
    mark = np.dstack([rgb_out, a_out * 255]).round().astype(np.uint8)
    mark = square(trim(mark, pad_frac=0.06))
    mark_img = Image.fromarray(mark).resize((512, 512), Image.LANCZOS)
    mark_img.save(HERE / "fhls-mark-512.png", optimize=True)
    on_bg(np.asarray(mark_img), APP_BG).save(HERE / "fhls-mark-512-bg.png", optimize=True)

    for size, name in ((32, "favicon-32.png"), (180, "apple-touch-icon-180.png"), (192, "icon-192.png")):
        img = mark_img.resize((size, size), Image.LANCZOS)
        (on_bg(np.asarray(img), APP_BG) if size == 180 else img).save(HERE / name, optimize=True)
    print("background", bg, "· title starts at row", title_top, "· wrote", sorted(p.name for p in HERE.glob("*.png")))


if __name__ == "__main__":
    main()

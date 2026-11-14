"""Light-mode variant of the FHLS logo: the cream lettering becomes ink (#1C1B19); the Moon and lander stay.

Run: python3 design/make_logo_ink.py   → design/logo/fhls-logo-ink.png (same size and placement as
fhls-logo-transparent.png, so the page can swap one for the other).
Lettering = pixels close to the lettering's cream colour that lie outside the Moon disc, or below the
disc's lowest grey rows where the title overlaps it. Alpha is kept, so the anti-aliased edges stay smooth.
"""
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent / "logo"
src = np.asarray(Image.open(HERE / "fhls-logo-transparent.png").convert("RGBA")).astype(np.float32)
h, w = src.shape[:2]
rgb, a = src[..., :3], src[..., 3]

# Moon disc, measured once from the opaque rows of fhls-logo-transparent.png (row 367 spans x 347…794)
yy, xx = np.mgrid[0:h, 0:w]
cx, cy, r = 570.5, 366.0, 224.0
cream = np.array([228, 226, 221], np.float32)
dist = np.abs(rgb - cream).max(axis=2)
outside = np.hypot(xx - cx, yy - cy) > r + 1.5
# Outside the disc every cream-ish pixel is lettering; on the disc (where the title overlaps its lower
# edge) only pixels very close to the lettering colour, so the Moon's light greys stay.
letters = (a > 0) & (((dist < 40) & outside) | ((dist < 12) & (yy > cy + r * 0.8)))
out = src.copy()
out[letters, 0], out[letters, 1], out[letters, 2] = 28, 27, 25
Image.fromarray(out.astype(np.uint8)).save(HERE / "fhls-logo-ink.png", optimize=True)
print(f"recoloured {letters.sum()} px")

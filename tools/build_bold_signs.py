"""Build the bold hand-sign drawings the web app shows in its sequence cards.

Run:  python tools/build_bold_signs.py

Reads gesture_references/_sources/signs/*.png (thin black line art, 960 px wide; Schlum, Wikimedia
Commons, CC BY-SA 4.0) and writes gesture_references/_sources/signs_bold/ (same names, same size,
transparent background). The originals are not changed.

Every stroke is widened in proportion to its own width, around its own centre line, so the main
outlines stay heavier than the finger creases and the hands keep exactly their shape and position;
the finest lines get a minimum width so they stay visible, and the ink is near-black. Per drawing the
factor is chosen so the outlines come out about TARGET_PX wide ON SCREEN in the sequence tiles: a
drawing shown smaller (a tall one in a wide tile) gets proportionally heavier lines, so all of them
look equally bold side by side. The grey nail fills are kept (slightly darker).
"""

import sys
from pathlib import Path

import cv2
import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "gesture_references" / "_sources" / "signs"
OUT = ROOT / "gesture_references" / "_sources" / "signs_bold"

TARGET_PX = 1.6          # outline width on screen in the sequence tiles (CSS px)
CREASE_SHARE = 0.38      # the thinnest lines are at least this share of the outline width
UP = 3                   # work at 3x for smooth, anti-aliased edges
INK = (16, 20, 26)       # BGR: near-black #1a1410
NAIL = (190, 190, 190)   # nail fill (the source has 219)
# where the drawings are shown (CSS px): the drawing box of a tile on the Live page (2 x 2) and on
# Home / Practice (4 in a row); the scale used is the geometric mean of the two
BOXES = [(137, 65), (165, 121)]

CREDITS = """Bold hand-seal line art in this folder (used by the web app's sequence cards)
=====================================================================

Adapted from the drawings in ../signs (Schlum, Wikimedia Commons, "Naruto Mudra" series, vectorized
from photographs), CC BY-SA 4.0  https://creativecommons.org/licenses/by-sa/4.0/
See ../signs/CREDITS.txt for the original files and their sources.

Changes: lines thickened in proportion to their width and darkened to near-black, nail fill
darkened, white background made transparent (tools/build_bold_signs.py). The shapes and positions
of the hands are unchanged. These adapted drawings are CC BY-SA 4.0 as well.

rasengan_palm.png is SHINOBI AI's own drawing (see ../signs/CREDITS.txt), thickened the same way.
"""


def stroke_width(gray):
    """Median width (px) of the dark strokes: twice the distance-map value on their centre lines."""
    g = cv2.resize(gray, None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC)
    ink = (g < 128).astype(np.uint8)
    dt = cv2.distanceTransform(ink, cv2.DIST_L2, 5)
    ridge = (dt > 0) & (dt >= ndimage.maximum_filter(dt, size=3) - 1e-6)
    return float(np.median(2 * dt[ridge] / UP))


def display_scale(w, h):
    """How much a w x h drawing is scaled down in the tiles (object-fit: contain)."""
    return float(np.exp(np.mean([np.log(min(bw / w, bh / h)) for bw, bh in BOXES])))


def bolden(gray, factor, min_width):
    """Each ink pixel becomes a disc of radius factor x its distance to the edge (at least
    min_width / 2): the union is every stroke widened around its centre line."""
    h, w = gray.shape
    g = cv2.resize(gray, None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC).astype(np.float32)
    ink = (g < 175).astype(np.uint8)                    # the thin creases are dark grey, not black
    nail = ((g >= 200) & (g < 235)).astype(np.uint8)    # flat grey fills (the anti-aliased rims of
    nail = cv2.morphologyEx(nail, cv2.MORPH_OPEN,       # the lines are thinner and are removed)
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3 * UP + 1, 3 * UP + 1)))
    dt = cv2.distanceTransform(ink, cv2.DIST_L2, 5)
    radius = np.where(ink > 0, np.maximum(dt * factor, min_width * UP / 2), 0)
    out = ink.copy()
    for r in range(1, int(np.ceil(radius.max())) + 1):
        centres = (radius >= r).astype(np.uint8)
        if not centres.any():
            break
        out |= cv2.dilate(centres, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
    a_ink = cv2.resize(out.astype(np.float32), (w, h), interpolation=cv2.INTER_AREA)
    a_nail = cv2.resize(nail.astype(np.float32), (w, h), interpolation=cv2.INTER_AREA) * (1 - a_ink)
    alpha = a_ink + a_nail
    rgb = (np.array(INK, np.float32) * a_ink[..., None] + np.array(NAIL, np.float32) * a_nail[..., None]) \
        / np.maximum(alpha, 1e-6)[..., None]
    return np.dstack([np.clip(rgb, 0, 255), np.clip(alpha * 255, 0, 255)]).round().astype(np.uint8)


def main():
    OUT.mkdir(exist_ok=True)
    for path in sorted(SRC.glob("*.png")):
        gray = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        h, w = gray.shape
        width = TARGET_PX / display_scale(w, h)         # outline width wanted, in source pixels
        factor = width / stroke_width(gray)
        cv2.imwrite(str(OUT / path.name), bolden(gray, factor, CREASE_SHARE * width))
        print(f"{path.name}: {w}x{h}, outlines x{factor:.2f} -> {width:.1f} px")
    (OUT / "CREDITS.txt").write_text(CREDITS, encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())

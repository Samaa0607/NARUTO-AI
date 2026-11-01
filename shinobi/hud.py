"""On-screen debug information: FPS, timings, live gesture probabilities, sequence, active effect."""

from functools import lru_cache

import cv2
import numpy as np

FONT = cv2.FONT_HERSHEY_SIMPLEX


@lru_cache(maxsize=512)
def _rendered(msg, scale, thick):
    """Masks for one string: (text, keep = 0 under text + outline, pad, text height), 3-channel uint8.

    Cached because most HUD strings repeat frame after frame.
    """
    (w, h), base = cv2.getTextSize(msg, FONT, scale, thick)
    r = 2 if scale < 1.0 else 3                               # outline width in pixels
    pad = r + 2
    mask = np.zeros((h + base + 2 * pad, w + 2 * pad), np.uint8)
    cv2.putText(mask, msg, (pad, pad + h), FONT, scale, 255, thick, cv2.LINE_AA)
    grown = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
    return cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR), cv2.cvtColor(255 - grown, cv2.COLOR_GRAY2BGR), pad, h


def text(frame, msg, org, scale=0.55, color=(255, 255, 255), thick=1):
    """Text with a dark outline (the text's own mask grown by a few pixels).

    In OpenCV 5 putText's thickness only picks regular (1) or bold (2+) letters, it no longer
    widens the stroke, so the old "same text, thicker, in black underneath" made no outline.
    """
    fill, keep, pad, h = _rendered(msg, float(scale), int(thick))
    x0, y0 = org[0] - pad, org[1] - h - pad
    H, W = frame.shape[:2]
    cx0, cy0 = max(x0, 0), max(y0, 0)
    cx1, cy1 = min(x0 + fill.shape[1], W), min(y0 + fill.shape[0], H)
    if cx0 >= cx1 or cy0 >= cy1:
        return
    part = (slice(cy0 - y0, cy1 - y0), slice(cx0 - x0, cx1 - x0))         # clipped at the frame border
    roi = frame[cy0:cy1, cx0:cx1]
    paint = np.empty_like(roi)
    paint[:] = color
    # 8-bit blends: darken under text + outline, then add the anti-aliased text colour
    roi[:] = cv2.add(cv2.multiply(roi, keep[part], scale=1 / 255), cv2.multiply(paint, fill[part], scale=1 / 255))


def draw_hud(frame, fps, timings, labels=None, probs=None, candidate=None, latched=None,
             hold=0.0, history=(), effect=None, cooldown=0.0, message=None):
    h, w = frame.shape[:2]
    text(frame, f"FPS {fps:4.1f}", (10, 25), 0.7, (0, 255, 0), 2)
    detail = "  ".join(f"{k} {v:4.1f}ms" for k, v in timings.items())
    text(frame, detail, (10, 50), 0.45)

    if labels is not None and probs is not None:
        y = 80
        for i, (name, p) in enumerate(zip(labels, probs)):
            color = (0, 255, 255) if i == latched else (0, 200, 0) if i == candidate else (200, 200, 200)
            cv2.rectangle(frame, (110, y - 12), (110 + int(150 * p), y), color, -1)
            cv2.rectangle(frame, (110, y - 12), (260, y), (90, 90, 90), 1)
            text(frame, name, (10, y), 0.45, color)
            text(frame, f"{p:.2f}", (268, y), 0.45, color)
            y += 20
        if hold > 0:
            cv2.rectangle(frame, (10, y), (10 + int(250 * hold), y + 6), (0, 200, 255), -1)

    if history:
        text(frame, "seals: " + " > ".join(history), (10, h - 45), 0.6, (0, 220, 255), 2)
    if effect:
        text(frame, effect.upper().replace("_", " "), (w // 2 - 110, 45), 1.1, (0, 220, 255), 3)
    if cooldown > 0:
        text(frame, f"cooldown {cooldown:.1f}s", (w - 190, 25), 0.55, (0, 140, 255))
    if message:
        text(frame, message, (10, h - 75), 0.6, (0, 200, 255), 2)
    text(frame, "1-4 effects  0 stop  L landmarks  H hud  F fullscreen  Q quit", (10, h - 15), 0.45)
    return frame

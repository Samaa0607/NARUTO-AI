"""After a recording: six frames of it, so the user keeps it or records it again.

Used by tools/record_training_session.py and tools/record_test_session.py. Nothing is saved before
the user answers: ENTER (or K) keeps the recording, R records it again, Q / Esc stops (the
recording on screen is not kept). The frames show the hands MediaPipe found, not what the AI
thinks the sign is: the choice must not depend on the model being tested.
"""

import cv2
import numpy as np

from shinobi.hands import CONNECTIONS
from shinobi.hud import text

SHOTS = 6
KEEP_KEYS = {13, 10, ord("k"), ord("K")}
REDO_KEYS = {ord("r"), ord("R")}
QUIT_KEYS = {ord("q"), ord("Q"), 27}
HAND_COLORS = [(0, 255, 0), (255, 0, 255)]


def pick(n_video, shots=SHOTS):
    """Indices of `shots` video frames spread over the recording (5% .. 95% of it)."""
    if n_video <= 0:
        return []
    return sorted({int(round(x)) for x in np.linspace(0.05 * (n_video - 1), 0.95 * (n_video - 1), shots)})


def thumbnail(frame, image_lm, present, width):
    """One video frame, smaller, with the hands found in it drawn on top."""
    h, w = frame.shape[:2]
    out = cv2.resize(frame, (width, int(round(width * h / w))), interpolation=cv2.INTER_AREA)
    th, tw = out.shape[:2]
    for slot in range(len(present)):
        if present[slot]:
            pts = np.round(image_lm[slot][:, :2] * [tw, th]).astype(int)
            for a, b in CONNECTIONS:
                cv2.line(out, tuple(pts[a]), tuple(pts[b]), HAND_COLORS[slot % 2], 2, cv2.LINE_AA)
    return out


def sheet(video_frames, video_idx, frames, title, lines=(), picture=None, size=(1280, 720)):
    """The review screen: title and notes on top (reference picture on the right), six frames below.

    video_frames: the saved video frames; video_idx[j]: the landmark frame recorded with video frame j;
    frames: [(image_lm, world_lm, present, t)] as the recorders store them.
    """
    width, height = size
    view = np.full((height, width, 3), 24, np.uint8)
    top = 150
    text(view, title, (24, 44), 1.0, (0, 255, 255), 2)
    for i, line in enumerate(lines):
        text(view, line, (24, 82 + 30 * i), 0.62, (255, 255, 255), 1)
    if picture is not None:
        scale = min((top - 20) / picture.shape[0], 260 / picture.shape[1])
        pic = cv2.resize(picture, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        ph, pw = pic.shape[:2]
        x, y = width - pw - 24, 10
        cv2.rectangle(view, (x - 4, y - 4), (x + pw + 4, y + ph + 4), (255, 255, 255), -1)
        view[y:y + ph, x:x + pw] = pic
    pad, cols = 16, 3
    tw = (width - pad * (cols + 1)) // cols
    picks = pick(min(len(video_frames), len(video_idx)))
    for n, j in enumerate(picks):
        i = video_idx[j]
        image_lm, _, present, t = frames[i]
        tile = thumbnail(video_frames[j], image_lm, present, tw)
        th = tile.shape[0]
        x, y = pad + (n % cols) * (tw + pad), top + pad + (n // cols) * (th + pad)
        if y + th > height - 40:
            break
        view[y:y + th, x:x + tw] = tile
        text(view, f"{t:4.1f} s", (x + 8, y + 26), 0.6, (255, 255, 255), 1)
    text(view, "ENTER = keep it      R = record it again      Q = stop (this one is not kept)",
         (24, height - 14), 0.7, (0, 200, 255), 2)
    return view


def ask(window, screen):
    """Show the review screen until the user answers -> 'keep', 'redo' or 'quit'."""
    cv2.imshow(window, screen)
    while True:
        key = cv2.waitKey(50) & 0xFF
        if key in KEEP_KEYS:
            return "keep"
        if key in REDO_KEYS:
            return "redo"
        if key in QUIT_KEYS:
            return "quit"
        if cv2.getWindowProperty(window, cv2.WND_PROP_VISIBLE) < 1:      # window closed: stop, keep nothing
            return "quit"

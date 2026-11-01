"""Record gesture sessions from the webcam.

Run:   python collect_data.py --person sara --lighting day
Keys:  0-9 choose gesture   SPACE record one session   Q quit

Each session is saved as raw landmarks (not features), so features can be
recomputed later if features.py changes, plus a small video for reference.
"""

import argparse
import json
import time
from datetime import datetime

import cv2
import numpy as np

from shinobi import config
from shinobi.camera import Camera
from shinobi.features import hands_to_arrays
from shinobi.hands import HandTracker, draw_hands
from shinobi.hud import text


def count_sessions():
    counts = {}
    for label in config.GESTURES:
        names = [label] + [old for old, new in config.LEGACY_LABELS.items() if new == label]
        counts[label] = sum(len(list((config.LANDMARKS_DIR / n).glob("*.npz"))) for n in names)
    return counts


def load_sign_pictures(height=220):
    """Reference drawing of every sign (gesture_references/_sources/signs), scaled for the corner of the screen."""
    pictures = {}
    for label in config.GESTURES:
        path = config.REFERENCES_DIR / "_sources" / "signs" / f"{label}.png"
        img = cv2.imread(str(path)) if path.exists() else None          # "idle" has no picture
        if img is not None:
            scale = min(height / img.shape[0], 300 / img.shape[1])
            pictures[label] = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return pictures


def paste_picture(view, picture):
    """Top-right corner, on a white card with a thin border."""
    h, w = picture.shape[:2]
    x, y = view.shape[1] - w - 20, 20
    cv2.rectangle(view, (x - 8, y - 8), (x + w + 8, y + h + 8), (255, 255, 255), -1)
    cv2.rectangle(view, (x - 8, y - 8), (x + w + 8, y + h + 8), (90, 90, 90), 2)
    view[y:y + h, x:x + w] = picture


def save_session(label, args, frames, video_frames, aspect):
    session_id = f"{args.person}_{args.lighting}_{datetime.now():%Y%m%d_%H%M%S}"
    out_dir = config.LANDMARKS_DIR / label
    out_dir.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        out_dir / f"{session_id}.npz",
        image_lm=np.stack([f[0] for f in frames]),
        world_lm=np.stack([f[1] for f in frames]),
        present=np.stack([f[2] for f in frames]),
        timestamps=np.array([f[3] for f in frames]),
        meta=json.dumps({"label": label, "session": session_id, "person": args.person,
                         "lighting": args.lighting, "aspect": aspect}),
    )
    if video_frames:
        video_dir = config.VIDEOS_DIR / label
        video_dir.mkdir(parents=True, exist_ok=True)
        h, w = video_frames[0].shape[:2]
        writer = cv2.VideoWriter(str(video_dir / f"{session_id}.mp4"),
                                 cv2.VideoWriter_fourcc(*"mp4v"), 15, (w, h))
        for f in video_frames:
            writer.write(f)
        writer.release()
    with_hands = sum(1 for f in frames if f[2].any())
    print(f"saved {label}/{session_id}: {len(frames)} frames, {with_hands} with hands")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--person", default="me", help="who is recording (used to split train/test)")
    parser.add_argument("--lighting", default="normal", help="e.g. day, night, lamp")
    parser.add_argument("--seconds", type=float, default=config.RECORD_SECONDS)
    parser.add_argument("--no-video", action="store_true", help="do not save the reference video")
    args = parser.parse_args()

    camera = Camera()
    tracker = HandTracker()
    pictures = load_sign_pictures()
    label_idx = 0
    phase, phase_start = "idle", 0.0        # idle -> countdown -> recording
    frames, video_frames = [], []
    counts = count_sessions()
    last_id, last_video = -1, 0.0

    try:
        while True:
            # keyboard first, on every pass: keys pressed while waiting for a frame are not lost
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            if phase == "idle" and ord("0") <= key < ord("0") + len(config.GESTURES):
                label_idx = key - ord("0")
            elif phase == "idle" and key == ord(" "):
                phase, phase_start = "countdown", time.perf_counter()

            frame_id, frame = camera.read()
            if frame is None or frame_id == last_id:
                continue
            last_id = frame_id
            now = time.perf_counter()
            h, w = frame.shape[:2]
            hands = tracker.detect(frame)
            label = config.GESTURES[label_idx]

            if phase == "countdown" and now - phase_start >= config.COUNTDOWN_SECONDS:
                phase, phase_start, frames, video_frames = "recording", now, [], []
            if phase == "recording":
                frames.append((*hands_to_arrays(hands), now - phase_start))
                if not args.no_video and now - last_video >= 1 / 15:      # 15 fps, 480p is plenty
                    video_frames.append(cv2.resize(frame, (int(480 * w / h), 480)))
                    last_video = now
                if now - phase_start >= args.seconds:
                    save_session(label, args, frames, video_frames, w / h)
                    counts = count_sessions()
                    phase = "idle"

            view = draw_hands(frame.copy(), hands)
            for i, name in enumerate(config.GESTURES):
                color = (0, 255, 255) if i == label_idx else (200, 200, 200)
                text(view, f"[{i}] {name}: {counts[name]} sessions", (10, 30 + 24 * i), 0.6, color, 2)
            text(view, config.GESTURE_HINTS[label], (10, h - 50), 0.6, (0, 255, 255), 2)
            if label in pictures:
                paste_picture(view, pictures[label])
            if phase == "countdown":
                left = config.COUNTDOWN_SECONDS - (now - phase_start)
                text(view, f"{left:.0f}", (w // 2 - 30, h // 2), 3, (0, 200, 255), 6)
            elif phase == "recording":
                left = args.seconds - (now - phase_start)
                cv2.circle(view, (w - 40, 40), 15, (0, 0, 255), -1)
                text(view, f"REC {label}  {left:4.1f}s  - move, rotate, change distance",
                     (w // 2 - 300, 40), 0.7, (0, 0, 255), 2)
            else:
                text(view, "SPACE = record   0-9 = choose gesture   Q = quit", (10, h - 20), 0.6)
            cv2.imshow("SHINOBI AI - data collection", view)
    finally:
        camera.release()
        tracker.close()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()

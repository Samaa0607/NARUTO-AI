"""Builds fake-camera files for the browser end-to-end tests from the user's REAL sign recordings.

    .venv/Scripts/python.exe frontend/e2e/make_fixtures.py --out <scratch dir>

The files contain the user's face: write them OUTSIDE the repository (the scratchpad), never into it.

Each fixture is a .y4m (raw I420, explicit frame rate in the header = the recordings' rate) at
1280x720 that Edge/Chromium plays as its fake camera (--use-file-for-fake-video-capture) and loops.
It is a series of segments, e.g. Fire Style = idle, monkey, boar, horse, tiger, idle.

The recordings in data/videos/<sign>/ were saved already mirrored (selfie view) and the server
mirrors every incoming frame, so each frame is un-mirrored here (cv2.flip(frame, 1)): the server
then sees exactly the recorded picture. For every sign the script picks the window of its recording
where the YOLOX seal detector (the backend's own model) finds that sign most reliably, so the
fixture is a fair test of the pipeline, not of a bad clip. Nothing is labelled or faked: the
backend still has to recognise every sign itself.
"""

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from shinobi import config  # noqa: E402

W, H = 1280, 720

FIXTURES = {
    # name: [(sign or "idle", seconds), ...]
    "fire_style": [("idle", 1.0), ("monkey", 2.4), ("boar", 2.4), ("horse", 2.4), ("tiger", 2.4), ("idle", 3.0)],
    "chidori": [("idle", 1.0), ("snake", 2.4), ("dog", 2.4), ("tiger", 2.4), ("monkey", 2.4), ("idle", 3.0)],
    # Fire Style started, then the wrong third sign: the backend must report "expected horse, got dog"
    "wrong_order": [("idle", 1.0), ("monkey", 2.4), ("boar", 2.4), ("dog", 2.4), ("idle", 4.5)],
    "idle": [("idle", 6.0)],
    # Practice (no time limit, a wrong sign keeps the steps done): 2 right signs, 3 wrong attempts at
    # step 3 (dog, snake, dog), then the right one and the last one
    "practice_retry": [("idle", 1.0), ("monkey", 2.4), ("boar", 2.4), ("dog", 2.4), ("snake", 2.4),
                       ("dog", 2.4), ("horse", 2.4), ("tiger", 2.4), ("idle", 3.0)],
    # Practice: a 32 s pause after step 2 must not reset anything
    "practice_wait": [("idle", 1.0), ("monkey", 2.4), ("boar", 2.4), ("idle", 32.0), ("horse", 2.4),
                      ("tiger", 2.4), ("idle", 3.0)],
    # Live: a pause longer than the 7 s limit after step 2 resets the sequence (timeout)
    "live_timeout": [("idle", 1.0), ("monkey", 2.4), ("boar", 2.4), ("idle", 8.5), ("horse", 2.4),
                     ("tiger", 2.4), ("idle", 3.0)],
    # Live: 2 right signs, 2 wrong attempts (dog, snake: snake also starts Chidori), the right third
    # one within 7 s of the second, then the last one
    "live_retry": [("idle", 1.0), ("monkey", 2.4), ("boar", 2.4), ("dog", 1.6), ("snake", 1.6),
                   ("horse", 2.4), ("tiger", 2.4), ("idle", 3.0)],
    # Live: Rasengan step 1, then a wrong sign that starts Fire Style (a tie): the card must stay on
    # Rasengan, its clock must keep running, and it times out 7 s after its step
    "live_tie": [("idle", 1.0), ("clone_seal", 2.4), ("monkey", 2.4), ("idle", 7.5)],
    # Live: boar shown again after a pause (a repeat) must not restart the 7 s
    "live_repeat": [("idle", 1.0), ("monkey", 2.4), ("boar", 2.4), ("idle", 1.2), ("boar", 2.4),
                    ("idle", 6.0)],
    # Live: a wrong sign keeps the progress; the right one next still completes Fire Style
    "live_wrong_keep": [("idle", 1.0), ("monkey", 2.4), ("boar", 2.4), ("dog", 2.4), ("horse", 2.4),
                        ("tiger", 2.4), ("idle", 3.0)],
    # Live: 2 right signs, then wrong attempts (dog, ram: ram also starts Shadow Clone) that take more
    # than 7 s after boar in total but never 7 s without a new sign, then the right horse and tiger
    "live_retry_slow": [("idle", 1.0), ("monkey", 2.4), ("boar", 2.4), ("dog", 2.4), ("idle", 2.0),
                        ("ram", 2.4), ("idle", 2.0), ("horse", 2.4), ("tiger", 2.4), ("idle", 3.0)],
}


def recording(sign):
    files = sorted((config.VIDEOS_DIR / sign).glob("me_night_*.mp4"))
    if not files:
        raise SystemExit(f"no recording for {sign} in {config.VIDEOS_DIR / sign}")
    return files[0]


def read_frames(path):
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 15.0
    frames = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frames.append(frame)
    cap.release()
    return frames, fps


def best_window(frames, sign, length, detector):
    """Start index of the `length`-frame window where YOLOX sees `sign` with score >= SEAL_MIN_SCORE
    in the most frames (as saved, i.e. as the server will see them after its mirror)."""
    if detector is None or sign == "idle" or len(frames) <= length:
        return max(0, (len(frames) - length) // 2), None
    hits = np.zeros(len(frames))
    for i, frame in enumerate(frames):
        dets = detector.detect(frame)
        hits[i] = max((d.score for d in dets if d.sign == sign), default=0.0) >= config.SEAL_MIN_SCORE
    sums = np.convolve(hits, np.ones(length), mode="valid")
    start = int(np.argmax(sums))
    return start, float(sums[start] / length)


def to_i420(frame):
    frame = cv2.resize(cv2.flip(frame, 1), (W, H), interpolation=cv2.INTER_CUBIC)
    return cv2.cvtColor(frame, cv2.COLOR_BGR2YUV_I420).tobytes()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, type=Path, help="output folder (outside the repository!)")
    parser.add_argument("--only", nargs="*", help="fixture names (default: all)")
    args = parser.parse_args()
    out = args.out.resolve()
    if ROOT in out.parents or out == ROOT:
        raise SystemExit("refusing to write fixtures (they show the user's face) inside the repository")
    out.mkdir(parents=True, exist_ok=True)

    try:
        from shinobi.seal_detector import SealDetector
        detector = SealDetector()
    except Exception as e:  # the fixtures still work, just without the window search
        print("YOLOX not available, using the middle of each recording:", e)
        detector = None

    cache = {}
    names = args.only or list(FIXTURES)
    for name in names:
        segments = FIXTURES[name]
        fps_all = set()
        chunks = []
        for sign, seconds in segments:
            if sign not in cache:
                cache[sign] = read_frames(recording(sign))
            frames, fps = cache[sign]
            fps_all.add(round(fps))
            n = int(round(seconds * fps))
            start, quality = best_window(frames, sign, n, detector)
            clip = frames[start:start + n]
            while len(clip) < n:                 # short recording: hold the last frame
                clip.append(clip[-1])
            chunks.append(clip)
            q = "" if quality is None else f", YOLOX hit rate {quality:.0%}"
            print(f"  {name}: {sign:7s} {seconds:.1f}s frames {start}..{start + n - 1}{q}")
        if len(fps_all) != 1:
            raise SystemExit(f"recordings of {name} have different frame rates: {fps_all}")
        fps = fps_all.pop()
        path = out / f"{name}.y4m"
        with open(path, "wb") as f:
            f.write(f"YUV4MPEG2 W{W} H{H} F{fps}:1 Ip A1:1 C420jpeg\n".encode())
            for clip in chunks:
                for frame in clip:
                    f.write(b"FRAME\n")
                    f.write(to_i420(frame))
        total = sum(len(c) for c in chunks)
        print(f"wrote {path} ({total} frames, {total / fps:.1f} s at {fps} fps)")


if __name__ == "__main__":
    main()

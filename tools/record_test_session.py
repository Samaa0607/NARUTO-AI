"""Guided recording of an INDEPENDENT test session: the user only performs the gestures.

Run:  python tools/record_test_session.py --person me --lighting day

The window shows the next gesture (name, drawing, hint) with a countdown, then records it for
RECORD_SECONDS (20 s, like collect_data.py): every sign twice and four different "idle" sessions
(things that must NOT count as a sign). No key is needed: the countdown before a recording runs only
while the user's hands are seen (except the first idle, hands down), so it never runs ahead of her.
Q / Esc stops early (what was saved stays), SPACE pauses before a recording starts. After each
recording six frames of it are shown (tools/recording_review.py): ENTER keeps it, R records it
again, Q stops; nothing is saved before the answer.

Recordings are saved exactly like collect_data.py (same folders data/landmarks/<label>/ and
data/videos/<label>/, same file contents and names <person>_<lighting>_<YYYYMMDD_HHMMSS>), but a
file is created only if no file of that name exists (never overwrites). A sign recording in which
hands were seen in under its minimum share of the frames is NEVER saved: it waits for the hands
again and records it again. --resume LOG continues a stopped session (same log, same start time):
steps already saved with enough hands are skipped, a saved recording without enough hands is marked
"rejected" in the log (tools/make_test_set.py --exclude leaves it out).
Nothing assigns the new recordings to a set: train.py ignores them until
tools/make_test_set.py puts them in the test set. The session start time and the saved ids go to
reports/test_sessions/<start>.json.
"""

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import recording_review as review  # noqa: E402
from collect_data import load_sign_pictures, paste_picture  # noqa: E402
from shinobi import config  # noqa: E402
from shinobi.camera import Camera  # noqa: E402
from shinobi.features import hands_to_arrays  # noqa: E402
from shinobi.hands import HandTracker, draw_hands  # noqa: E402
from shinobi.hud import text  # noqa: E402

PREP_SECONDS = 6          # countdown before a recording; it runs only while the hands are seen
START_SECONDS = 10        # before the first one: step in front of the camera
MIN_HANDS = 0.6           # sign recordings: share of frames with hands needed to keep it
MIN_HANDS_IDLE = 0.3      # idle 2-4 (OK sign, half signs, random movements) show hands too
SIGNS = [g for g in config.GESTURES if g != "idle"]
IDLE = [
    "IDLE 1: hands down, relaxed. Move naturally, touch your face, wave a little.",
    "IDLE 2: an OK sign (thumb and index make a circle). Move it around.",
    "IDLE 3: half-formed signs, a fist, a claw. NOT a flat open palm.",
    "IDLE 4: random hand movements (scratch your head, point...). NOT a flat open palm.",
]


def plan():
    """Two rounds: idle, the 9 signs, idle."""
    steps = []
    for r in range(2):
        steps.append(("idle", IDLE[2 * r]))
        steps += [(s, config.GESTURE_HINTS[s]) for s in SIGNS]
        steps.append(("idle", IDLE[2 * r + 1]))
    return steps


def min_hands(label, idle_index):
    """Share of frames with hands a recording needs (the first idle is hands down: none)."""
    if label != "idle":
        return MIN_HANDS
    return 0.0 if idle_index == 0 else MIN_HANDS_IDLE


def save_new(label, person, lighting, frames, video_frames, aspect, extra=None):
    """collect_data.save_session's format, but the files must not exist yet (never overwrites).

    extra: more meta entries (e.g. the camera position); the standard ones cannot be replaced."""
    session_id = f"{person}_{lighting}_{datetime.now():%Y%m%d_%H%M%S}"
    npz = config.LANDMARKS_DIR / label / f"{session_id}.npz"
    mp4 = config.VIDEOS_DIR / label / f"{session_id}.mp4"
    if npz.exists() or mp4.exists():
        raise FileExistsError(f"{npz.name} already exists: nothing was written")
    npz.parent.mkdir(parents=True, exist_ok=True)
    with open(npz, "xb") as f:                                  # "x": fails if the file appeared
        np.savez_compressed(
            f,
            image_lm=np.stack([fr[0] for fr in frames]),
            world_lm=np.stack([fr[1] for fr in frames]),
            present=np.stack([fr[2] for fr in frames]),
            timestamps=np.array([fr[3] for fr in frames]),
            meta=json.dumps({**(extra or {}), "label": label, "session": session_id, "person": person,
                             "lighting": lighting, "aspect": aspect}),
        )
    if video_frames:
        mp4.parent.mkdir(parents=True, exist_ok=True)
        h, w = video_frames[0].shape[:2]
        writer = cv2.VideoWriter(str(mp4), cv2.VideoWriter_fourcc(*"mp4v"), 15, (w, h))
        for fr in video_frames:
            writer.write(fr)
        writer.release()
    return session_id


def big(view, line, y, scale=1.0, color=(255, 255, 255)):
    text(view, line, (30, y), scale, color, 2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--person", default="me")
    parser.add_argument("--lighting", default="day")
    parser.add_argument("--seconds", type=float, default=config.RECORD_SECONDS)
    parser.add_argument("--resume", help="the log of a stopped session (reports/test_sessions/<start>.json)")
    args = parser.parse_args()

    steps = plan()
    idle_index, n = {}, 0
    for i, (label, _) in enumerate(steps):
        if label == "idle":
            idle_index[i], n = n, n + 1
    done = set()
    if args.resume:
        log_path = Path(args.resume)
        log = json.loads(log_path.read_text(encoding="utf-8"))
        log.setdefault("rejected", [])
        rejected = {r["id"] for r in log["rejected"]}
        for entry in log["saved"]:
            k = entry["step"] - 1
            if entry["hands"] >= min_hands(entry["label"], idle_index.get(k, 0)):
                done.add(k)
            elif entry["id"] not in rejected:
                log["rejected"].append({**entry, "reason": "hands not seen enough: not part of the test set"})
                rejected.add(entry["id"])
        log["saved"] = [e for e in log["saved"] if e["id"] not in rejected]
        log["resumed"] = log.get("resumed", []) + [datetime.now().isoformat(timespec="seconds")]
        log["finished"] = False
        args.person, args.lighting = log["person"], log["lighting"]
    else:
        start = datetime.now()
        log_path = ROOT / "reports" / "test_sessions" / f"{start:%Y%m%d_%H%M%S}.json"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log = {"start": start.isoformat(timespec="seconds"), "person": args.person, "lighting": args.lighting,
               "seconds": args.seconds, "saved": [], "not_saved": [], "rejected": [], "finished": False}

    def write_log():
        log_path.write_text(json.dumps(log, indent=2), encoding="utf-8")

    write_log()
    print(f"SESSION START {log['start']}  (log: {log_path})  steps already done: {sorted(k + 1 for k in done)}",
          flush=True)

    camera = Camera()
    tracker = HandTracker()
    pictures = load_sign_pictures()
    todo = [k for k in range(len(steps)) if k not in done]
    window = "SHINOBI AI - test recording (Q = stop)"
    last_id, last_seen = -1, time.perf_counter()

    def frame_and_hands():
        nonlocal last_id, last_seen
        while True:
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                return None, None, "quit"
            fid, frame = camera.read()
            if frame is not None and fid != last_id:
                last_id, last_seen = fid, time.perf_counter()
                return frame, tracker.detect(frame), chr(key) if key < 255 else ""
            if time.perf_counter() - last_seen > 10:
                raise RuntimeError("the camera sends no picture (is another app or the website using it?)")

    try:
        # step in front of the camera
        t0 = time.perf_counter()
        while (left := START_SECONDS - (time.perf_counter() - t0)) > 0:
            frame, hands, key = frame_and_hands()
            if key == "quit":
                raise KeyboardInterrupt
            view = draw_hands(frame.copy(), hands)
            big(view, f"Test recording: {len(todo)} gestures to go, 20 s each", 50, 1.0, (0, 255, 255))
            big(view, "Stand in front of the camera. Just follow the instructions.", 90, 0.7)
            big(view, f"Starting in {left:.0f}", view.shape[0] // 2, 2.0, (0, 200, 255))
            cv2.imshow(window, view)

        q = 0
        while q < len(todo):
            k = todo[q]
            label, hint = steps[k]
            need = min_hands(label, idle_index.get(k, 0))
            tries = log.setdefault("tries", {}).get(str(k), 0)
            # prepare: the countdown runs only while the hands are seen (not for the hands-down idle)
            left, paused, last = float(PREP_SECONDS), False, time.perf_counter()
            while True:
                frame, hands, key = frame_and_hands()
                if key == "quit":
                    raise KeyboardInterrupt
                if key == " ":
                    paused = not paused
                now = time.perf_counter()
                waiting = need > 0 and not hands
                if not paused and not waiting:
                    left -= now - last
                last = now
                if left <= 0:
                    break
                view = draw_hands(frame.copy(), hands)
                big(view, f"{len(done) + q + 1} / {len(steps)}   NEXT: {label.upper()}", 50, 1.1, (0, 255, 255))
                big(view, hint, 90, 0.65)
                if tries:
                    big(view, "Hands were not seen enough: once more, please, facing the camera", 125, 0.65, (0, 160, 255))
                if label in pictures:
                    paste_picture(view, pictures[label])
                msg = ("PAUSED (SPACE)" if paused else
                       f"Show your hands: make {label.upper()}" if waiting else f"Get ready: {left:.0f}")
                big(view, msg, view.shape[0] // 2, 1.4 if waiting else 1.8, (0, 200, 255))
                cv2.imshow(window, view)
            # record
            print(f"step {k + 1}/{len(steps)} {label}: recording", flush=True)
            frames, video_frames, video_idx, last_video, r0 = [], [], [], 0.0, time.perf_counter()
            aspect = None
            while (elapsed := time.perf_counter() - r0) < args.seconds:
                frame, hands, key = frame_and_hands()
                if key == "quit":
                    raise KeyboardInterrupt
                now = time.perf_counter()
                h, w = frame.shape[:2]
                aspect = w / h
                frames.append((*hands_to_arrays(hands), now - r0))
                if now - last_video >= 1 / 15:
                    video_frames.append(cv2.resize(frame, (int(480 * w / h), 480)))
                    video_idx.append(len(frames) - 1)
                    last_video = now
                view = draw_hands(frame.copy(), hands)
                cv2.circle(view, (w - 40, 40), 15, (0, 0, 255), -1)
                big(view, f"REC {label.upper()}  {args.seconds - elapsed:4.1f}s", 50, 1.1, (0, 0, 255))
                big(view, "hold it; move, rotate, change distance a little", 90, 0.65)
                if label in pictures:
                    paste_picture(view, pictures[label])
                cv2.imshow(window, view)
            seen = sum(1 for fr in frames if fr[2].any()) / max(1, len(frames))
            if seen < need:                             # never saved: wait for the hands, record again
                log["tries"][str(k)] = tries + 1
                log["not_saved"].append({"step": k + 1, "label": label, "hands": round(seen, 2), "reason": "hands not seen enough, recorded again"})
                print(f"  not saved: hands in {seen:.0%} of frames, recording again", flush=True)
                write_log()
                continue
            answer = review.ask(window, review.sheet(
                video_frames, video_idx, frames, f"{label.upper()}: keep this recording?",
                [hint, f"hands seen in {seen:.0%} of the frames"], pictures.get(label), (w, h)))
            if answer == "quit":
                print("  not kept: stopped at the review", flush=True)
                raise KeyboardInterrupt
            if answer == "redo":
                log.setdefault("redone", []).append({"step": k + 1, "label": label, "hands": round(seen, 2),
                                                     "reason": "the user chose to record it again"})
                print("  not kept: the user chose to record it again", flush=True)
                write_log()
                continue
            sid = save_new(label, args.person, args.lighting, frames, video_frames, aspect)
            log["saved"].append({"step": k + 1, "label": label, "id": sid, "frames": len(frames), "hands": round(seen, 2),
                                 "note": hint if label == "idle" else ""})
            print(f"  saved {label}/{sid}: {len(frames)} frames, hands in {seen:.0%}", flush=True)
            write_log()
            q += 1
        log["finished"] = True
        frame, hands, _ = frame_and_hands()
        view = frame.copy()
        big(view, f"Done! All {len(steps)} recordings are saved. Thank you.", view.shape[0] // 2, 1.1, (0, 255, 0))
        cv2.imshow(window, view)
        cv2.waitKey(2500)
    except KeyboardInterrupt:
        print("stopped by the user (Q)", flush=True)
    finally:
        write_log()
        camera.release()
        tracker.close()
        cv2.destroyAllWindows()
        print(f"SESSION END: {len(log['saved'])} saved, finished={log['finished']}  (log: {log_path})", flush=True)


if __name__ == "__main__":
    main()

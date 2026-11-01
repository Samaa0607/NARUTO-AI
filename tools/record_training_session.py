"""Guided recording of TRAINING and VALIDATION data in three sessions (68 recordings in all).

Run:  python tools/record_training_session.py --session 1 --plan      the plan only (no camera)
      python tools/record_training_session.py --session 1             record session 1
      python tools/record_training_session.py --session 1 --resume reports/training_sessions/<log>.json

Sessions 1 and 2 are TRAINING data, session 3 is VALIDATION data: whole recordings from a session
of their own (another day if possible), never frames of a training recording. A session is a few
blocks; a block is one camera position. Before a block the screen says where to put the camera and
waits for SPACE, so nothing starts before the user is ready. In a block each gesture is recorded once
for RECORD_SECONDS (20 s), after a countdown that runs only while the hands are seen. Then six frames
of the recording are shown (tools/recording_review.py): ENTER keeps it, R records it again, Q stops.
Nothing is saved before ENTER. Q / Esc stops at any time; what was kept stays and --resume goes on.

Recordings are saved like collect_data.py (data/landmarks/<label>/, data/videos/<label>/, ids
<person>_<lighting>_<YYYYMMDD_HHMMSS>), never over an existing file. The meta also keeps the camera
position, the session and the planned set. Nothing is put in a set here (train.py ignores the new
recordings until then): after a session, tools/assign_recordings.py (dry run first) assigns the kept
recordings to train / validation by id. The log: reports/training_sessions/session<N>_<start>.json.
"""

import argparse
import json
import sys
import time
from collections import Counter
from datetime import datetime
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import recording_review as review  # noqa: E402
from collect_data import load_sign_pictures, paste_picture  # noqa: E402
from record_test_session import big, save_new  # noqa: E402
from shinobi import config  # noqa: E402
from shinobi.camera import Camera  # noqa: E402
from shinobi.features import hands_to_arrays  # noqa: E402
from shinobi.hands import HandTracker, draw_hands  # noqa: E402

PREP_SECONDS = 6          # countdown before a recording; it runs only while the hands are seen
SPACE_GRACE = 0.6         # s after the camera screen's SPACE in which SPACE does not pause (key repeat)
MIN_HANDS = 0.6           # share of frames with hands a sign recording needs
MIN_HANDS_IDLE = 0.3      # idle recordings here all show hands, but move them in and out
LOG_DIR = ROOT / "reports" / "training_sessions"

WEAK = ["ram", "snake", "tiger", "dog", "clone_seal", "rasengan_palm"]      # every block
STRONG = ["monkey", "boar", "horse"]                                       # some blocks
CAMERAS = {
    "A": "FACE LEVEL, straight in front of you (laptop on a table), about one arm away",
    "A-far": "FACE LEVEL, straight in front of you, sit further back (hands look smaller)",
    "A-side": "FACE LEVEL, a little to your side (turn the laptop about 15-20 degrees)",
    "B": "LOW, looking UP at you (laptop on your lap or a low table)",
    "B-near": "LOW, looking UP at you, sit closer (hands look bigger: keep them inside the picture)",
    "C": "to your SIDE: turn the laptop about 30 degrees, at face level",
}
IDLE = [
    "IDLE: an OK sign (thumb and index make a circle). Move it around. NOT an open palm.",
    "IDLE: fists and claw hands. Move them around.",
    "IDLE: point at things, scratch your head, touch your face.",
    "IDLE: hold your phone and use it normally.",
    "IDLE: hands relaxed in front of your chest, fingers curled or together. NOT spread palms.",
    "IDLE: half-formed seals: start a seal and break it, cross your hands, clap slowly.",
    "IDLE: an OK sign and fists: change between them.",
    "IDLE: random natural movements: phone, face, hair, pointing. NOT a spread open palm.",
]
# block = (camera position, with monkey/boar/horse?, idle variant); blocks are numbered 1..8 over the sessions
SESSIONS = {
    1: {"set": "train", "lighting": "day",
        "light": "DAYLIGHT: daytime, the window light on (the window may be in the picture)",
        "blocks": [("A", True, IDLE[0]), ("B", True, IDLE[1]), ("A-far", False, IDLE[2])]},
    2: {"set": "train", "lighting": "night",
        "light": "EVENING: after dark, only the room lamp on",
        "blocks": [("A", False, IDLE[3]), ("C", True, IDLE[4]), ("B-near", False, IDLE[5])]},
    3: {"set": "validation", "lighting": None,
        "light": "ANOTHER light than sessions 1 and 2 if you can (another day; late afternoon or one lamp)",
        "blocks": [("A-side", True, IDLE[6]), ("B", False, IDLE[7])]},
}
EXTRA_HINTS = {
    "clone_seal": "Keep BOTH hands fully inside the picture, the top hand too.",
    "rasengan_palm": "ONE hand only ({hand} hand). Keep the other hand down, out of the picture.",
}


def plan(session):
    """The steps of one session: [{step, block, camera, set, label, hint, extra}] in recording order."""
    first_block = 1 + sum(len(SESSIONS[s]["blocks"]) for s in SESSIONS if s < session)
    steps = []
    for b, (camera, strong, idle_note) in enumerate(SESSIONS[session]["blocks"]):
        block = first_block + b
        for label in [g for g in config.GESTURES if g in WEAK or (strong and g in STRONG)] + ["idle"]:
            hint = idle_note if label == "idle" else config.GESTURE_HINTS[label]
            extra = EXTRA_HINTS.get(label, "").format(hand="RIGHT" if block % 2 else "LEFT")
            steps.append({"step": len(steps) + 1, "block": block, "camera": camera,
                          "set": SESSIONS[session]["set"], "label": label, "hint": hint, "extra": extra})
    return steps


def print_plan(session, lighting):
    steps = plan(session)
    s = SESSIONS[session]
    print(f"SESSION {session}: {len(steps)} recordings of {config.RECORD_SECONDS} s -> {s['set'].upper()} set")
    print(f"  light: {s['light']}   (file tag: {lighting or 'choose with --lighting'})")
    for block in sorted({st["block"] for st in steps}):
        bs = [st for st in steps if st["block"] == block]
        print(f"  block {block}: camera {bs[0]['camera']}: {CAMERAS[bs[0]['camera']]}")
        for st in bs:
            print(f"     {st['step']:2d}. {st['label']:14s} {st['hint']}" + (f"  [{st['extra']}]" if st["extra"] else ""))
    counts = Counter(st["label"] for st in steps)
    print("  per gesture:", ", ".join(f"{g} {counts[g]}" for g in config.GESTURES if counts[g]))


def needed_hands(label):
    return MIN_HANDS_IDLE if label == "idle" else MIN_HANDS


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--session", type=int, choices=sorted(SESSIONS), required=True)
    parser.add_argument("--person", default="me")
    parser.add_argument("--lighting", default=None, help="file tag for the light (sessions 1, 2: day / night)")
    parser.add_argument("--seconds", type=float, default=config.RECORD_SECONDS)
    parser.add_argument("--plan", action="store_true", help="print the plan and stop (no camera)")
    parser.add_argument("--resume", help="the log of a stopped session")
    args = parser.parse_args(argv)

    steps = plan(args.session)
    if args.resume:
        log_path = Path(args.resume)
        log = json.loads(log_path.read_text(encoding="utf-8"))
        if log.get("session") != args.session:
            parser.error(f"{log_path} is the log of session {log.get('session')}, not {args.session}")
        log["resumed"] = log.get("resumed", []) + [datetime.now().isoformat(timespec="seconds")]
        log["finished"] = False
        args.person, args.lighting = log["person"], log["lighting"]
    lighting = args.lighting or SESSIONS[args.session]["lighting"]
    if args.plan:
        print_plan(args.session, lighting)
        return 0
    if not lighting:
        parser.error("session 3: say which light it is with --lighting (for example day, night or dim)")
    if not args.resume:
        start = datetime.now()
        log_path = LOG_DIR / f"session{args.session}_{start:%Y%m%d_%H%M%S}.json"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log = {"session": args.session, "start": start.isoformat(timespec="seconds"), "person": args.person,
               "lighting": lighting, "set": SESSIONS[args.session]["set"], "seconds": args.seconds,
               "saved": [], "redone": [], "not_saved": [], "finished": False}
    done = {e["step"] for e in log["saved"]}
    todo = [st for st in steps if st["step"] not in done]

    def write_log():
        log_path.write_text(json.dumps(log, indent=2), encoding="utf-8")

    write_log()
    print(f"SESSION {args.session} START {log['start']}  (log: {log_path})  "
          f"{len(todo)} of {len(steps)} recordings to go", flush=True)

    camera = Camera()
    tracker = HandTracker()
    pictures = load_sign_pictures()
    window = f"SHINOBI AI - training session {args.session} (Q = stop)"
    last_id, last_seen = -1, time.perf_counter()

    def frame_and_hands():
        nonlocal last_id, last_seen
        while True:
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), ord("Q"), 27):
                raise KeyboardInterrupt
            fid, frame = camera.read()
            if frame is not None and fid != last_id:
                last_id, last_seen = fid, time.perf_counter()
                return frame, tracker.detect(frame), key
            if time.perf_counter() - last_seen > 10:
                raise RuntimeError("the camera sends no picture (is another app or the website using it?)")

    def setup(st):
        """Where to put the camera; waits for SPACE."""
        n_blocks = len(SESSIONS[args.session]["blocks"])
        first = steps[0]["block"]
        while True:
            frame, hands, key = frame_and_hands()
            if key == ord(" "):
                return
            view = draw_hands(frame.copy(), hands)
            big(view, f"SESSION {args.session} - part {st['block'] - first + 1} of {n_blocks}"
                      f"   ({SESSIONS[args.session]['set'].upper()} data)", 50, 1.0, (0, 255, 255))
            big(view, f"Camera: {CAMERAS[st['camera']]}", 92, 0.62)
            big(view, f"Light: {SESSIONS[args.session]['light']}", 124, 0.62)
            big(view, "Your face, chest and both hands must be inside the picture.", 156, 0.62)
            big(view, "Press SPACE when you are ready", view.shape[0] // 2, 1.6, (0, 200, 255))
            cv2.imshow(window, view)

    try:
        block = None
        q = 0
        while q < len(todo):
            st = todo[q]
            label, hint, extra, need = st["label"], st["hint"], st["extra"], needed_hands(st["label"])
            grace = 0.0
            if st["block"] != block:
                setup(st)
                block, grace = st["block"], time.perf_counter() + SPACE_GRACE
            # prepare: the countdown runs only while the hands are seen
            left, paused, last = float(PREP_SECONDS), False, time.perf_counter()
            while True:
                frame, hands, key = frame_and_hands()
                if key == ord(" ") and time.perf_counter() > grace:
                    paused = not paused
                now = time.perf_counter()
                waiting = not hands
                if not paused and not waiting:
                    left -= now - last
                last = now
                if left <= 0:
                    break
                view = draw_hands(frame.copy(), hands)
                big(view, f"{len(done) + q + 1} / {len(steps)}   NEXT: {label.upper()}", 50, 1.1, (0, 255, 255))
                big(view, hint, 90, 0.6)
                if extra:
                    big(view, extra, 122, 0.6, (0, 160, 255))
                if label in pictures:
                    paste_picture(view, pictures[label])
                msg = ("PAUSED (SPACE)" if paused else
                       f"Show your hands: make {label.upper()}" if waiting else f"Get ready: {left:.0f}")
                big(view, msg, view.shape[0] // 2, 1.4 if waiting else 1.8, (0, 200, 255))
                cv2.imshow(window, view)
            # record
            print(f"step {st['step']}/{len(steps)} {label} (block {st['block']}, camera {st['camera']}): recording",
                  flush=True)
            frames, video_frames, video_idx, last_video, r0 = [], [], [], 0.0, time.perf_counter()
            aspect, size = None, None
            while (elapsed := time.perf_counter() - r0) < args.seconds:
                frame, hands, _ = frame_and_hands()
                now = time.perf_counter()
                h, w = frame.shape[:2]
                aspect, size = w / h, (w, h)
                frames.append((*hands_to_arrays(hands), now - r0))
                if now - last_video >= 1 / 15:
                    video_frames.append(cv2.resize(frame, (int(480 * w / h), 480)))
                    video_idx.append(len(frames) - 1)
                    last_video = now
                view = draw_hands(frame.copy(), hands)
                cv2.circle(view, (w - 40, 40), 15, (0, 0, 255), -1)
                big(view, f"REC {label.upper()}  {args.seconds - elapsed:4.1f}s", 50, 1.1, (0, 0, 255))
                big(view, "hold it; move, rotate, change distance a little" if label != "idle" else hint, 90, 0.6)
                if extra:
                    big(view, extra, 122, 0.6, (0, 160, 255))
                if label in pictures:
                    paste_picture(view, pictures[label])
                cv2.imshow(window, view)
            seen = sum(1 for fr in frames if fr[2].any()) / max(1, len(frames))
            if seen < need:                                 # never kept: record it again
                log["not_saved"].append({"step": st["step"], "label": label, "hands": round(seen, 2),
                                         "reason": "hands not seen enough, recorded again"})
                print(f"  not kept: hands in {seen:.0%} of frames, recording again", flush=True)
                write_log()
                continue
            answer = review.ask(window, review.sheet(
                video_frames, video_idx, frames, f"{label.upper()}: keep this recording?",
                [hint, *([extra] if extra else []), f"camera: {st['camera']}    hands seen in {seen:.0%} of the frames"],
                pictures.get(label), size))
            if answer == "quit":
                print("  not kept: stopped at the review", flush=True)
                raise KeyboardInterrupt
            if answer == "redo":
                log["redone"].append({"step": st["step"], "label": label, "hands": round(seen, 2),
                                      "reason": "the user chose to record it again"})
                print("  not kept: the user chose to record it again", flush=True)
                write_log()
                continue
            meta = {"camera": st["camera"], "camera_note": CAMERAS[st["camera"]],
                    "planned_set": st["set"], "recording_session": args.session, "block": st["block"],
                    "note": hint if label == "idle" else extra}
            sid = save_new(label, args.person, lighting, frames, video_frames, aspect, meta)
            log["saved"].append({"step": st["step"], "block": st["block"], "camera": st["camera"], "set": st["set"],
                                 "label": label, "id": sid, "frames": len(frames), "hands": round(seen, 2),
                                 "note": hint if label == "idle" else ""})
            print(f"  kept {label}/{sid}: {len(frames)} frames, hands in {seen:.0%}", flush=True)
            write_log()
            q += 1
        log["finished"] = True
        frame, _, _ = frame_and_hands()
        view = frame.copy()
        big(view, f"Session {args.session} done: {len(log['saved'])} recordings kept. Thank you!",
            view.shape[0] // 2, 1.1, (0, 255, 0))
        cv2.imshow(window, view)
        cv2.waitKey(2500)
    except KeyboardInterrupt:
        print("stopped by the user (Q)", flush=True)
    finally:
        write_log()
        camera.release()
        tracker.close()
        cv2.destroyAllWindows()
        print(f"SESSION END: {len(log['saved'])} of {len(steps)} kept, finished={log['finished']}  "
              f"(log: {log_path})", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

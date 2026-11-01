"""Record guided hand-sign SEQUENCES for the dataset, or just practise them.

Run:   python record_sequences.py --person me --lighting day
Keys:  1-4    choose the jutsu (1 Fire Style, 2 Chidori, 3 Shadow Clone, 4 Rasengan)
       TAB    kind of take: correct / wrong order / incomplete / wrong sign
       R      new random signs for a negative take
       SPACE  record one take        P  practise one take (nothing is saved)
       [ ]    slower / faster        C  cancel the running take        Q  quit

A take: 3-2-1 countdown, "hands down", then every sign in turn with its picture for
a fixed time, a short break to change hands between signs, and "hands down" again.
Each frame is saved with its hand landmarks AND the prompt that was on screen, so the
dataset knows the step boundaries and the transitions. The prompt is what was ASKED:
people react ~0.3-0.8 s later, so code using these labels should trust the second
half of each hold window more than the first.

Negative takes (wrong order, incomplete, one wrong sign) are checked with the real
SequenceMatcher so that they can never complete a jutsu: they teach and test that
only the exact, complete sequence fires.
"""

import argparse
import json
import time
from dataclasses import asdict, dataclass
from datetime import datetime

import cv2
import numpy as np

from shinobi import config
from shinobi.camera import Camera
from shinobi.controller import SequenceMatcher
from shinobi.features import hands_to_arrays
from shinobi.hands import HandTracker, draw_hands
from shinobi.hud import text

PHASES = ["lead_in", "hold", "transition", "tail"]
KINDS = ["correct", "wrong_order", "incomplete", "wrong_sign"]
JUTSU_KEYS = list(config.JUTSU)
WINDOW = "SHINOBI AI - sequence recording"


@dataclass
class Segment:
    phase: str          # one of PHASES
    sign: str = None    # sign to hold (hold) or the next sign (transition)
    step: int = -1      # step index during "hold", else -1
    start: float = 0.0  # seconds from the start of the take
    end: float = 0.0


def build_timeline(signs, hold, transition, lead):
    """hands down -> sign 1 -> change -> sign 2 -> ... -> last sign -> hands down."""
    out, t = [Segment("lead_in", None, -1, 0.0, lead)], lead
    for i, sign in enumerate(signs):
        out.append(Segment("hold", sign, i, t, t + hold))
        t += hold
        if i < len(signs) - 1:
            out.append(Segment("transition", signs[i + 1], -1, t, t + transition))
            t += transition
    out.append(Segment("tail", None, -1, t, t + lead))
    return out


def segment_at(timeline, t):
    """The segment running at time t, or None when the take is over."""
    return next((seg for seg in timeline if seg.start <= t < seg.end), None)


def fires(signs, jutsu=config.JUTSU):
    """Jutsu that this exact order of signs would fire, according to the app's own matcher."""
    matcher = SequenceMatcher(jutsu, max_gap=1e9)
    return [name for i, s in enumerate(signs) if (name := matcher.push(s, float(i)))]


def make_signs(kind, jutsu_key, rng, jutsu=config.JUTSU):
    """Signs to ask for in one take. Negative kinds are re-drawn until they fire nothing."""
    seq = list(jutsu[jutsu_key]["sequence"])
    if kind == "correct":
        return seq
    vocabulary = sorted({s for spec in jutsu.values() for s in spec["sequence"]})
    for _ in range(500):
        if kind == "wrong_order":
            signs = [str(s) for s in rng.permutation(seq)]
        elif kind == "incomplete":
            signs = seq[:int(rng.integers(2, len(seq)))]          # stops after 2 or 3 steps
        elif kind == "wrong_sign":
            signs = seq.copy()
            i = int(rng.integers(len(seq)))
            signs[i] = str(rng.choice([s for s in vocabulary if s != seq[i]]))
        else:
            raise ValueError(f"unknown kind {kind}")
        if signs != seq and not fires(signs, jutsu):
            return signs
    raise RuntimeError(f"could not build a '{kind}' take for {jutsu_key}")


def frame_labels(segments):
    """Per-frame phase / step / sign arrays. sign: GESTURES index, idle for hands-down, -1 while changing."""
    idle = config.GESTURES.index("idle")
    phase = np.array([PHASES.index(s.phase) for s in segments], np.int8)
    step = np.array([s.step for s in segments], np.int8)
    sign = np.array([config.GESTURES.index(s.sign) if s.phase == "hold"
                     else (-1 if s.phase == "transition" else idle) for s in segments], np.int16)
    return phase, step, sign


def save_take(path, frames, meta):
    """frames: list of (image_lm, world_lm, present, t, segment)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    phase, step, sign = frame_labels([f[4] for f in frames])
    np.savez_compressed(
        path,
        image_lm=np.stack([f[0] for f in frames]),
        world_lm=np.stack([f[1] for f in frames]),
        present=np.stack([f[2] for f in frames]),
        timestamps=np.array([f[3] for f in frames]),
        frame_phase=phase, frame_step=step, frame_sign=sign,
        meta=json.dumps(meta),
    )
    return path


def take_quality(frames, signs):
    """Share of 'hold' frames where hands were found (and both hands, for two-hand signs)."""
    holds = [f for f in frames if f[4].phase == "hold"]
    if not holds:
        return 0.0, 0.0
    seen = np.mean([f[2].any() for f in holds])
    two = [f for f in holds if f[4].sign != "rasengan_palm"]
    both = np.mean([f[2].all() for f in two]) if two else 1.0
    return float(seen), float(both)


def count_takes(jutsu_key):
    folder = config.SEQUENCES_DIR / jutsu_key
    return {k: len(list(folder.glob(f"{jutsu_key}_{k}_*.npz"))) if folder.exists() else 0 for k in KINDS}


# ---------------------------------------------------------------- drawing

def load_pictures():
    pictures = {}
    for sign in config.GESTURES:
        path = config.REFERENCES_DIR / "_sources" / "signs" / f"{sign}.png"
        if path.exists():                                             # "idle" has no picture
            pictures[sign] = cv2.imread(str(path))
    return pictures


def fit(img, w, h):
    scale = min(w / img.shape[1], h / img.shape[0])
    return cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)


def draw_strip(view, signs, pictures, current=-1):
    """The signs of the take as cards along the bottom: done = grey, current = green border."""
    h, w = view.shape[:2]
    tile_w, tile_h, gap = 190, 150, 14
    x = (w - (len(signs) * tile_w + (len(signs) - 1) * gap)) // 2
    y = h - tile_h - 46
    for i, sign in enumerate(signs):
        tile = np.full((tile_h, tile_w, 3), 255, np.uint8)
        if sign in pictures:
            pic = fit(pictures[sign], tile_w - 16, tile_h - 44)
            px, py = (tile_w - pic.shape[1]) // 2, 8 + (tile_h - 44 - pic.shape[0]) // 2
            tile[py:py + pic.shape[0], px:px + pic.shape[1]] = pic
        if i < current:
            tile = (tile * 0.45 + 140).astype(np.uint8)          # done: faded
        cv2.putText(tile, f"{i + 1}. {sign.upper().replace('_', ' ')}", (8, tile_h - 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (20, 20, 20), 1, cv2.LINE_AA)
        view[y:y + tile_h, x:x + tile_w] = tile
        color, thick = ((0, 200, 0), 5) if i == current else ((90, 90, 90), 2)
        cv2.rectangle(view, (x, y), (x + tile_w, y + tile_h), color, thick)
        x += tile_w + gap


def draw_timeline(view, timeline, t):
    h, w = view.shape[:2]
    total = timeline[-1].end
    y0, y1 = h - 30, h - 14
    colors = {"lead_in": (150, 150, 150), "hold": (0, 180, 0), "transition": (0, 150, 255), "tail": (150, 150, 150)}
    for seg in timeline:
        a = int(20 + (w - 40) * seg.start / total)
        b = int(20 + (w - 40) * seg.end / total)
        cv2.rectangle(view, (a, y0), (b, y1), colors[seg.phase], -1)
    cx = int(20 + (w - 40) * min(t, total) / total)
    cv2.line(view, (cx, y0 - 6), (cx, y1 + 6), (255, 255, 255), 3)


def banner(view, msg, color=(0, 255, 255), scale=1.3):
    w = view.shape[1]
    size = cv2.getTextSize(msg, cv2.FONT_HERSHEY_SIMPLEX, scale, 3)[0]
    text(view, msg, ((w - size[0]) // 2, 150), scale, color, 3)


def prompt_text(seg, n_steps):
    if seg.phase == "lead_in":
        return "HANDS DOWN - get ready", (200, 200, 200)
    if seg.phase == "hold":
        return f"STEP {seg.step + 1}/{n_steps}:  {seg.sign.upper().replace('_', ' ')}", (0, 255, 0)
    if seg.phase == "transition":
        return f"CHANGE TO:  {seg.sign.upper().replace('_', ' ')}", (0, 170, 255)
    return "HANDS DOWN", (200, 200, 200)


# ---------------------------------------------------------------- main loop

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--person", default="me", help="who is recording (used to split train/test)")
    parser.add_argument("--lighting", default="normal", help="e.g. day, night, lamp")
    parser.add_argument("--hold", type=float, default=config.SEQ_HOLD_SECONDS)
    parser.add_argument("--transition", type=float, default=config.SEQ_TRANSITION_SECONDS)
    parser.add_argument("--lead", type=float, default=config.SEQ_LEAD_SECONDS)
    parser.add_argument("--no-video", action="store_true", help="do not save the reference video")
    args = parser.parse_args()

    rng = np.random.default_rng()
    camera = Camera()
    tracker = HandTracker()
    pictures = load_pictures()
    jutsu_key, kind = JUTSU_KEYS[0], KINDS[0]
    signs = make_signs(kind, jutsu_key, rng)
    hold, transition = args.hold, args.transition
    state, state_start, recording = "menu", 0.0, False
    timeline, frames = [], []
    session_id, writer, video_path = None, None, None
    counts = count_takes(jutsu_key)
    note, note_until = "", 0.0
    last_id, last_video = -1, 0.0

    def stop_video(keep):
        nonlocal writer
        if writer is not None:
            writer.release()
            writer = None
            if not keep and video_path.exists():
                video_path.unlink()                                       # cancelled take: no orphan video

    try:
        while True:
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            if state == "menu":
                changed = False
                if ord("1") <= key < ord("1") + len(JUTSU_KEYS):
                    jutsu_key, changed = JUTSU_KEYS[key - ord("1")], True
                elif key == 9:                                            # TAB
                    kind, changed = KINDS[(KINDS.index(kind) + 1) % len(KINDS)], True
                elif key == ord("r"):
                    changed = True
                elif key == ord("["):
                    hold, transition = min(hold * 1.25, 3.0), min(transition * 1.25, 3.0)
                elif key == ord("]"):
                    hold, transition = max(hold / 1.25, 0.6), max(transition / 1.25, 0.6)
                elif key in (ord(" "), ord("p")):
                    recording = key == ord(" ")
                    timeline = build_timeline(signs, hold, transition, args.lead)
                    state, state_start = "countdown", time.perf_counter()
                if changed:
                    signs = make_signs(kind, jutsu_key, rng)
                    counts = count_takes(jutsu_key)
            elif key == ord("c"):
                stop_video(keep=False)
                state, note, note_until = "menu", "take cancelled (nothing saved)", time.perf_counter() + 3

            frame_id, frame = camera.read()
            if frame is None or frame_id == last_id:
                continue
            last_id = frame_id
            now = time.perf_counter()
            h, w = frame.shape[:2]
            hands = tracker.detect(frame)

            if state == "countdown" and now - state_start >= config.COUNTDOWN_SECONDS:
                state, state_start, frames = "running", now, []
                if recording:
                    session_id = f"{jutsu_key}_{kind}_{args.person}_{args.lighting}_{datetime.now():%Y%m%d_%H%M%S}"
                    if not args.no_video:                                 # written while recording: no RAM build-up
                        video_path = config.SEQUENCE_VIDEOS_DIR / jutsu_key / f"{session_id}.mp4"
                        video_path.parent.mkdir(parents=True, exist_ok=True)
                        writer = cv2.VideoWriter(str(video_path), cv2.VideoWriter_fourcc(*"mp4v"), 15,
                                                 (int(480 * w / h), 480))
            seg = None
            if state == "running":
                t = now - state_start
                seg = segment_at(timeline, t)
                if seg is None:                                           # take finished
                    if recording:
                        stop_video(keep=True)
                        meta = {
                            "format": "shinobi-sequence-v1", "session": session_id,
                            "person": args.person, "lighting": args.lighting,
                            "jutsu": jutsu_key, "kind": kind, "signs": signs,
                            "expected_activation": jutsu_key if kind == "correct" else None,
                            "timeline": [asdict(s) for s in timeline],   # step boundaries + transitions
                            "phases": PHASES, "sign_names": config.GESTURES,
                            "hold_seconds": hold, "transition_seconds": transition, "lead_seconds": args.lead,
                            "aspect": w / h, "created": datetime.now().isoformat(timespec="seconds"),
                        }
                        path = save_take(config.SEQUENCES_DIR / jutsu_key / f"{session_id}.npz", frames, meta)
                        seen, both = take_quality(frames, signs)
                        note = f"saved {path.name}: hands seen {seen:.0%}, both hands {both:.0%}"
                        print(note)
                        counts = count_takes(jutsu_key)
                    else:
                        note = "practice take finished (nothing saved)"
                    note_until = now + 5
                    state = "menu"
                    if kind != "correct":
                        signs = make_signs(kind, jutsu_key, rng)           # fresh negative for the next take
                elif recording:
                    frames.append((*hands_to_arrays(hands), t, seg))
                    if writer is not None and now - last_video >= 1 / 15:  # 15 fps, 480p is plenty
                        writer.write(cv2.resize(frame, (int(480 * w / h), 480)))
                        last_video = now

            # ---- screen
            view = draw_hands(frame.copy(), hands)
            for i, key_name in enumerate(JUTSU_KEYS):
                color = (0, 255, 255) if key_name == jutsu_key else (200, 200, 200)
                text(view, f"[{i + 1}] {key_name.upper().replace('_', ' ')}", (10 + 230 * i, 30), 0.6, color, 2)
            text(view, f"kind: {kind.upper().replace('_', ' ')} (TAB)    hold {hold:.1f}s / change {transition:.1f}s ([ ])",
                 (10, 60), 0.55)
            text(view, "takes: " + "  ".join(f"{k.replace('_', ' ')} {n}" for k, n in counts.items()), (10, 85), 0.55)

            if state == "menu":
                banner(view, "SPACE = record    P = practise", (255, 255, 255), 1.0)
                draw_strip(view, signs, pictures)
                expected = "fires " + jutsu_key.upper() if kind == "correct" else "must NOT fire"
                text(view, f"this take: {' -> '.join(signs)}   ({expected})", (10, 115), 0.55, (0, 255, 255))
            elif state == "countdown":
                left = config.COUNTDOWN_SECONDS - (now - state_start)
                banner(view, f"{left:.0f}", (0, 200, 255), 3)
                draw_strip(view, signs, pictures)
            elif seg is not None:
                msg, color = prompt_text(seg, len(signs))
                banner(view, msg, color)
                done = sum(1 for s in timeline if s.phase == "hold" and s.end <= now - state_start)
                current = {"hold": seg.step, "transition": done, "lead_in": -1}.get(seg.phase, len(signs))
                draw_strip(view, signs, pictures, current)
                draw_timeline(view, timeline, now - state_start)
                if recording:
                    cv2.circle(view, (w - 40, 40), 15, (0, 0, 255), -1)
                    text(view, "REC", (w - 110, 48), 0.7, (0, 0, 255), 2)
                else:
                    text(view, "PRACTICE", (w - 170, 48), 0.7, (0, 255, 0), 2)
            if note and now < note_until:
                text(view, note, (10, h - 220), 0.6, (0, 255, 255), 2)
            cv2.imshow(WINDOW, view)
    finally:
        stop_video(keep=False)                                            # quit in the middle of a take
        camera.release()
        tracker.close()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()

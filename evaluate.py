"""Measure how well SHINOBI AI recognises signs and jutsu, on recordings it never learned from.

Run:  python evaluate.py splits                      give new recordings a set (data/splits.json)
      python evaluate.py run                         evaluate the TEST recordings -> reports/<time>/
      python evaluate.py run --sets validation       numbers for tuning (NOT a final result)

Frame level, per recogniser, always with the app's own code (shinobi/*, nothing re-implemented):
  landmarks  shinobi.classifier on the recorded hand landmarks (frames where a hand was found)
  yolox      the app's SealWorker + YOLOX on the saved video frames (YOLOX alone: best seal >= SEAL_MIN_SCORE)
  fused      the recording replayed in time through SignFusion, the same calls as shinobi/engine.py:
             recorded hands + landmark classifier + YOLOX results at config.SEAL_RATE_HZ
Sequence level: guided takes (data/sequences) through fusion + ActionController: did the right jutsu
fire exactly once, and nothing on negative takes? Single-sign sessions are replayed too: holding one
sign or idling must never fire a jutsu.

Scoring skips the first SKIP_START seconds of every single-sign session (the replay itself starts at 0):
the countdown is not in the files (collect_data.py starts saving after it) and the hands are already
in place, but fusion needs SEAL_CONFIRM YOLOX results before it can name a seal at all.
Recordings listed in data/evaluation_exclusions.json (invalid labels, decided by the user; --exclusions
PATH or none) keep their set and are still evaluated one by one, but every aggregate is reported for the
valid recordings only (the result) and, apart and marked, for all recordings.
Output: reports/<time>/summary.md, metrics.json, confusion_*.png. Nothing is written into data/
except data/splits.json by the `splits` command.
"""

import argparse
import json
import sys
import time
from bisect import bisect_right
from collections import Counter
from datetime import datetime
from pathlib import Path

import cv2
import joblib
import matplotlib
import numpy as np

import splits as splits_mod
from shinobi import config
from shinobi.classifier import GestureClassifier
from shinobi.controller import ActionController
from shinobi.features import extract
from shinobi.fusion import SignFusion
from shinobi.hands import Hand

matplotlib.use("Agg")                     # save plots to file, no window
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap  # noqa: E402
from matplotlib.patches import Rectangle  # noqa: E402

REPORTS_DIR = config.ROOT / "reports"
RECOGNIZERS = ("landmarks", "yolox", "fused")
SET_ORDER = ("test", "validation", "train")
SKIP_START = 0.5      # seconds not scored at the start of a single-sign session (see the docstring)
YOLOX_DELAY = 0.06    # s from a frame to its YOLOX result being usable (~ one run: median 61 ms measured here)
VIDEO_FPS = 15        # collect_data.py / record_sequences.py write a video frame at most this often
YOLOX_SIGNS = [s for s in config.GESTURES if s in config.SEAL_CLASSES.values()]   # what YOLOX can name
SHORT = {"clone_seal": "clone", "rasengan_palm": "palm"}                         # narrow table columns
EXCLUSIONS_FILE = "evaluation_exclusions.json"
EXCLUSIONS_FORMAT = "shinobi-exclusions-v1"
EXCLUSION_FIELDS = ("set", "label", "reason", "decided_on", "decided_by")       # each a non-empty text
VALID_ONLY = "valid recordings only (exclusions applied)"


# ---------------------------------------------------------------- recordings on disk

def load_recording(data_dir, rec):
    """All arrays of one recording + its meta dict."""
    with np.load(Path(data_dir) / rec.path) as d:
        out = {k: d[k] for k in d.files if k != "meta"}
        out["meta"] = json.loads(str(d["meta"]))
    return out


def video_file(data_dir, rec):
    """The reference video the recorder saved next to the landmarks (data/videos/...)."""
    folder = Path(rec.path).parent.name
    if rec.kind == "take":
        return Path(data_dir) / "videos" / "sequences" / folder / f"{rec.id}.mp4"
    return Path(data_dir) / "videos" / folder / f"{rec.id}.mp4"


def saved_video_frames(timestamps, fps=VIDEO_FPS):
    """Indices of the landmark frames that the recorders also wrote to the video.

    Both recorders write a video frame when at least 1/fps s passed since the last one written, on
    the same loop pass that saves the landmarks. Replaying that rule on the saved timestamps gives
    exactly the video's frame count on every recording we have (checked on all 27 on 2026-10-31).
    """
    idx, last = [], -np.inf
    for i, t in enumerate(timestamps):
        if t - last >= 1 / fps:
            idx.append(i)
            last = t
    return np.array(idx, dtype=int)


def align_video(timestamps, n_video):
    """Landmark index of every video frame -> (indices, exact?). Not exact = spread evenly in time."""
    idx = saved_video_frames(timestamps)
    if len(idx) == n_video:
        return idx, True
    targets = np.linspace(timestamps[0], timestamps[-1], n_video)
    return np.searchsorted(timestamps, targets).clip(0, len(timestamps) - 1), False


def read_video(path):
    cap = cv2.VideoCapture(str(path))
    frames = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frames.append(frame)
    cap.release()
    return frames


def hands_from_arrays(image_lm, world_lm, present, width, height):
    """The Hand objects HandTracker.detect returned for a recorded frame (pixels of a width x height frame).

    Handedness and score are not stored; fusion does not use them.
    """
    scale = np.array([width, height], np.float32)
    return [Hand(image_lm[s], world_lm[s], "?", 1.0, image_lm[s, :, :2] * scale)
            for s in range(len(present)) if present[s]]


# ---------------------------------------------------------------- the recognisers

class SealRunner:
    """The app's own SealWorker (resize, YOLOX, boxes back to frame pixels), one frame at a time."""

    def __init__(self):
        from shinobi.seal_detector import SealDetector, SealWorker
        self.worker = SealWorker(SealDetector(), rate_hz=1000)    # the replay decides the rate, not the clock

    def run(self, frame, stamp, timeout=60.0):
        before = self.worker.result
        self.worker.submit(frame, stamp)
        start = time.perf_counter()
        while self.worker.result is before:
            if time.perf_counter() - start > timeout:
                raise RuntimeError("the YOLOX worker did not answer within 60 s")
            time.sleep(0.0005)
        return self.worker.result

    def close(self):
        self.worker.close()


def yolox_sign(detections, min_score=config.SEAL_MIN_SCORE):
    """YOLOX ALONE on one frame: its best detection of a seal a jutsu uses, if the score reaches
    SEAL_MIN_SCORE; otherwise idle (= no seal). This is fusion's per-result rule without the hand
    check and without SEAL_CONFIRM results in a row: it measures the detector, not the app."""
    for d in detections:                                     # best first
        if d.sign is not None and d.score >= min_score:
            return d.sign
    return "idle"


def yolox_truth(label):
    """What YOLOX should say for a frame of this sign: the seal, or idle for signs it has no class for."""
    return label if label in YOLOX_SIGNS else "idle"


def seal_schedule(frame_times, rate_hz=config.SEAL_RATE_HZ, delay=YOLOX_DELAY):
    """When the app's SealWorker would have run on these frames -> [(frame index, result usable from)].

    Like SealWorker: wake up every 1/rate_hz s and take the newest frame not processed yet (or wait
    for the next one); a result can be used `delay` s after its run started.
    """
    period = 1.0 / rate_hz
    times = list(frame_times)
    runs, wake, last = [], -np.inf, -1
    while True:
        k = bisect_right(times, wake) - 1
        if k <= last:                                        # nothing new yet: wait for the next frame
            k = last + 1
            if k >= len(times):
                break
            start = times[k]
        else:
            start = wake
        runs.append((k, start + delay))
        last = k
        wake = start + max(period, delay)                    # one run at a time, at most rate_hz
    return runs


def landmark_probs(classifier, image_lm, world_lm, present, aspect):
    """Classifier output per frame (None where no hand was found, like the app) + ms per frame."""
    probs, ms = [], []
    for img, wld, pres in zip(image_lm, world_lm, present):
        if not pres.any():
            probs.append(None)
            continue
        t0 = time.perf_counter()
        probs.append(classifier.predict(extract(img, wld, pres, aspect)))   # = extract(*hands_to_arrays(hands))
        ms.append((time.perf_counter() - t0) * 1000)
    return probs, ms


def replay(times, hands, probs, lm_labels, seal_runs, yolox_running=True):
    """Feed one recording through SignFusion + ActionController with the same calls as Engine.process.

    seal_runs: [(usable_from, SealResult)] sorted by time: what SealWorker.result holds from then on.
    """
    fusion, controller = SignFusion(), ActionController(config.GESTURES)
    out = {"signs": [], "sources": [], "confirmed": [], "fired": [], "fusion_ms": []}
    j, result = 0, None
    for i, now in enumerate(times):
        while j < len(seal_runs) and seal_runs[j][0] <= now:
            result = seal_runs[j][1]
            j += 1
        t0 = time.perf_counter()
        fused = fusion.update(probs[i], lm_labels, result, hands[i], now, yolox_running=yolox_running)
        state = controller.update(fused.probs, now)
        out["fusion_ms"].append((time.perf_counter() - t0) * 1000)
        out["signs"].append(fused.sign)
        out["sources"].append(fused.source)
        if state.confirmed:
            out["confirmed"].append((round(float(now), 3), state.confirmed))
        if state.jutsu:                                      # fired (cooldown already applied)
            out["fired"].append((round(float(now), 3), state.jutsu))
    out["conflicts"] = fusion.conflicts
    return out


# ---------------------------------------------------------------- metrics

def frame_metrics(truth, pred, labels=()):
    """Accuracy, balanced accuracy (mean recall), macro-F1 and per-class precision / recall / F1.

    labels: classes the recogniser can output (listed even with no frames). Macro averages use only
    the classes present in the truth; precision is None for a class that was never predicted.
    """
    truth, pred = np.asarray(truth, dtype=object), np.asarray(pred, dtype=object)
    classes = list(dict.fromkeys(list(labels) + sorted(set(truth) | set(pred), key=_order)))
    per = {}
    for c in classes:
        tp = int(np.sum((truth == c) & (pred == c)))
        support, predicted = int(np.sum(truth == c)), int(np.sum(pred == c))
        precision = tp / predicted if predicted else None
        recall = tp / support if support else None
        f1 = None
        if support:
            f1 = 2 * precision * recall / (precision + recall) if tp else 0.0
        per[c] = {"precision": precision, "recall": recall, "f1": f1, "support": support, "predicted": predicted}
    present = [c for c in classes if per[c]["support"]]
    return {
        "frames": int(len(truth)),
        "accuracy": float(np.mean(truth == pred)) if len(truth) else None,
        "balanced_accuracy": float(np.mean([per[c]["recall"] for c in present])) if present else None,
        "macro_f1": float(np.mean([per[c]["f1"] for c in present])) if present else None,
        "per_class": per,
    }


def confusion(true_rows, pred, rows, cols):
    """Counts: rows = true sign of the recording, columns = what the recogniser said."""
    m = np.zeros((len(rows), len(cols)), dtype=int)
    r, c = {k: i for i, k in enumerate(rows)}, {k: i for i, k in enumerate(cols)}
    for t, p in zip(true_rows, pred):
        m[r[t], c[p]] += 1
    return m


def latency(ms):
    if not len(ms):
        return None
    a = np.asarray(ms, float)
    return {"n": int(len(a)), "mean": round(float(a.mean()), 2), "median": round(float(np.median(a)), 2),
            "p90": round(float(np.percentile(a, 90)), 2), "max": round(float(a.max()), 2)}


def take_outcome(kind, expected, fired):
    """Sequence verdict. fired: [(time, jutsu)]. Correct take: the expected jutsu exactly once, nothing else."""
    names = [j for _, j in fired]
    if kind != "correct":
        return "false activation" if names else "ok"
    if names == [expected]:
        return "success"
    if not names:
        return "missed"
    return "fired twice" if set(names) == {expected} else "wrong jutsu"


def _order(label):
    return config.GESTURES.index(label) if label in config.GESTURES else len(config.GESTURES)


# ---------------------------------------------------------------- model (leakage guard)

def model_status(path):
    """Which landmark model to use, and the recordings it must never be evaluated on."""
    info = {"path": str(path), "exists": False, "usable": False, "reason": "", "train_sessions": [],
            "validation_sessions": []}
    if path is None:
        info["reason"] = "switched off (--model none)"
        return info, None
    path = Path(path)
    if not path.exists():
        info["reason"] = f"{path} does not exist (no landmark model trained yet)"
        return info, None
    info["exists"] = True
    bundle = joblib.load(path)
    if "train_sessions" not in bundle:
        info["reason"] = ("it was trained without data/splits.json, so it may have learned from ANY recording, "
                          "test ones included. Re-train (`python train.py` now respects the splits) and evaluate again.")
        return info, None
    info.update(usable=True, reason="trained with splits", model_name=bundle.get("model_name"),
                created=bundle.get("created"), selection=bundle.get("selection"),
                train_sessions=list(bundle["train_sessions"]),
                validation_sessions=list(bundle.get("validation_sessions", [])))
    return info, GestureClassifier(path)


# ---------------------------------------------------------------- exclusions (recordings with invalid labels)

class ExclusionsError(ValueError):
    """data/evaluation_exclusions.json is broken."""


def _unique_keys(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise ExclusionsError(f"'{key}' appears twice")
        out[key] = value
    return out


def load_exclusions(path):
    """{recording id: entry} of the recordings left out of the scores; {} when the file does not exist.

    Raises ExclusionsError when the file is broken: which recordings are scored is never guessed.
    """
    path = Path(path)
    if not path.exists():
        return {}
    try:
        record = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_unique_keys)
    except json.JSONDecodeError as e:
        raise ExclusionsError(f"{path} is not valid JSON ({e}). Fix it by hand; nothing was evaluated.") from e
    except ExclusionsError as e:
        raise ExclusionsError(f"{path}: {e}. Fix it by hand; nothing was evaluated.") from e
    if not isinstance(record, dict) or record.get("format") != EXCLUSIONS_FORMAT:
        raise ExclusionsError(f"{path}: not an exclusion record (expected \"format\": \"{EXCLUSIONS_FORMAT}\")")
    recordings = record.get("recordings")
    if not isinstance(recordings, dict):
        raise ExclusionsError(f"{path}: \"recordings\" must be an object {{id: {{\"set\", \"label\", \"reason\", "
                              f"\"decided_on\", \"decided_by\"}}}}")
    for rid, entry in recordings.items():
        if not isinstance(entry, dict):
            raise ExclusionsError(f"{path}: '{rid}' must be an object with {', '.join(EXCLUSION_FIELDS)}")
        missing = [k for k in EXCLUSION_FIELDS if not isinstance(entry.get(k), str) or not entry[k].strip()]
        if missing:
            raise ExclusionsError(f"{path}: '{rid}' has no {', '.join(missing)} (each must be a non-empty text)")
        if entry["set"] not in splits_mod.SETS:
            raise ExclusionsError(f"{path}: '{rid}' has set '{entry['set']}'; use one of {', '.join(splits_mod.SETS)}")
        if entry.get("evidence") is not None and not isinstance(entry["evidence"], str):
            raise ExclusionsError(f"{path}: '{rid}' has an evidence that is not a text (a path)")
    return recordings


def exclusions_for(args, data_dir):
    """(path or None, {id: entry}) for --exclusions: default <data>/evaluation_exclusions.json, 'none' = off."""
    if args.exclusions and args.exclusions.lower() == "none":
        return None, {}
    path = Path(args.exclusions) if args.exclusions else data_dir / EXCLUSIONS_FILE
    if args.exclusions and not path.exists():
        raise SystemExit(f"ERROR: {path} does not exist (--exclusions). Use --exclusions none to switch them off.")
    try:
        return path, load_exclusions(path)
    except ExclusionsError as e:
        raise SystemExit(f"ERROR: {e}")


def exclusion_warnings(exclusions, recordings, sets, path):
    """The record must point at real recordings, with the set and label they really have."""
    by_id, out = {r.id: r for r in recordings}, []
    for rid, entry in exclusions.items():
        rec = by_id.get(rid)
        if rec is None:
            out.append(f"{path.name} lists '{rid}', which is not a recording in the data folder: nothing excluded "
                       f"for it. Check the id.")
        elif sets.get(rid) != entry["set"] or entry["label"] not in (rec.group, rec.label):
            out.append(f"{rid}: {path.name} says {entry['set']} / {entry['label']}, but it is "
                       f"{sets.get(rid) or 'in no set'} / {rec.group}. It is excluded by id; check the record.")
    return out


# ---------------------------------------------------------------- one recording

def _frames_store():
    return {"truth": [], "orig": [], "pred": [], "session": [], "ms": []}


def evaluate_recording(rec, set_name, data_dir, args, classifier, model, runner, store):
    """Run every requested recogniser on one recording. Adds scored frames to `store`; returns its summary."""
    data = load_recording(data_dir, rec)
    times = np.asarray(data["timestamps"], float)
    image_lm, world_lm, present = data["image_lm"], data["world_lm"], data["present"]
    aspect = float(data["meta"].get("aspect", 16 / 9))
    single = rec.kind == "single"
    label = rec.group if single else None
    scored = times >= (args.skip_start if single else 0.0)
    summary = {"id": rec.id, "set": set_name, "kind": rec.kind, "group": rec.group, "lighting": rec.lighting,
               "date": rec.date, "frames": int(len(times)), "scored_frames": int(scored.sum()),
               "duration_s": round(float(times[-1] - times[0]), 2) if len(times) else 0.0,
               "hands_found": round(float(present.any(axis=1)[scored].mean()), 3) if scored.any() else None}

    # the landmark model must never be scored on a recording it learned from
    leak = classifier is not None and rec.id in model["train_sessions"]
    use_model = classifier is not None and not leak
    if leak:
        summary["model_note"] = "the landmark model was trained on this recording: landmarks + fused skipped"
    elif classifier is not None and rec.id in model["validation_sessions"]:
        summary["model_note"] = "the landmark model was chosen with this recording (validation)"

    probs, lm_ms = [None] * len(times), []
    if use_model:
        probs, lm_ms = landmark_probs(classifier, image_lm, world_lm, present, aspect)
    if single and "landmarks" in args.recognizers:
        if use_model:
            keep = [i for i in range(len(times)) if scored[i] and probs[i] is not None]
            pred = [classifier.labels[int(np.argmax(probs[i]))] for i in keep]
            _add(store["landmarks"], [label] * len(keep), [label] * len(keep), pred, rec.id)
            store["landmarks"]["ms"] += lm_ms
            summary["landmarks"] = {"frames": len(keep), "accuracy": _acc([label] * len(keep), pred),
                                    "latency_ms": latency(lm_ms)}
        else:
            summary["landmarks"] = {"skipped": "trained on this recording" if leak else model["reason"]}

    # YOLOX on the saved video frames
    video = video_file(data_dir, rec)
    results, v_idx, exact = None, None, None
    needs_yolox = runner is not None and ({"yolox", "fused"} & set(args.recognizers))
    width, height = 720 * aspect, 720.0
    if needs_yolox and video.exists():
        frames = read_video(video)
        if frames:
            height, width = frames[0].shape[:2]
            v_idx, exact = align_video(times, len(frames))
            results = [runner.run(f, float(times[i])) for f, i in zip(frames, v_idx)]
        summary["video"] = {"frames": len(frames), "aligned": ("exact" if exact else "approximate (frame count differs)")
                            if frames else "no frame could be read"}
    elif needs_yolox:
        summary["video"] = {"frames": 0, "aligned": None, "missing": video.relative_to(data_dir).as_posix()}
    if single and "yolox" in args.recognizers:
        if results:
            keep = [k for k, i in enumerate(v_idx) if scored[i]]
            pred = [yolox_sign(results[k].detections) for k in keep]
            _add(store["yolox"], [yolox_truth(label)] * len(keep), [label] * len(keep), pred, rec.id)
            store["yolox"]["ms"] += [r.latency_ms for r in results]
            wrong = Counter(p for p in pred if p != yolox_truth(label)).most_common(1)
            summary["yolox"] = {"frames": len(keep), "accuracy": _acc([yolox_truth(label)] * len(keep), pred),
                                "most_common_mistake": wrong[0][0] if wrong else None,
                                "latency_ms": latency([r.latency_ms for r in results])}
        else:
            summary["yolox"] = {"skipped": "no saved video" if runner else "YOLOX model not available"}

    # fused: replay in time like the app (needs YOLOX, as the app has it)
    replayed = None
    if ("fused" in args.recognizers or not single) and results and not leak:
        hands = [hands_from_arrays(*f, width, height) for f in zip(image_lm, world_lm, present)]
        runs = seal_schedule(times[v_idx], delay=args.yolox_delay)
        seal_runs = [(available, results[k]) for k, available in runs]
        replayed = replay(times, hands, probs, classifier.labels if use_model else None, seal_runs)
        summary["yolox_runs_per_s"] = round(len(runs) / max(summary["duration_s"], 1e-6), 2)
        summary["controller"] = {"confirmed": replayed["confirmed"], "fired": replayed["fired"]}
        if single:
            keep = np.flatnonzero(scored)
            pred = [replayed["signs"][i] for i in keep]
            _add(store["fused"], [label] * len(keep), [label] * len(keep), pred, rec.id)
            store["fused"]["ms"] += replayed["fusion_ms"]
            first = next((t for t, s in replayed["confirmed"] if s == label), None)
            summary["fused"] = {
                "frames": len(keep), "accuracy": _acc([label] * len(keep), pred),
                "sources": dict(Counter(replayed["sources"][i] for i in keep)), "conflicts": replayed["conflicts"],
                "first_confirmed_s": first if label != "idle" else None,
                "wrong_confirmations": [s for _, s in replayed["confirmed"] if s != label],
                "jutsu_fired": [j for _, j in replayed["fired"]],
                "latency_ms": latency(replayed["fusion_ms"])}
    elif single and "fused" in args.recognizers:
        summary["fused"] = {"skipped": "trained on this recording" if leak else
                            ("no saved video, so no YOLOX" if runner else "YOLOX model not available")}

    if not single:                                           # guided sequence take
        meta = data["meta"]
        holds = [s for s in meta.get("timeline", []) if s.get("phase") == "hold"]
        summary.update(jutsu=meta.get("jutsu"), take_kind=meta.get("kind"), signs=meta.get("signs"),
                       expected=meta.get("expected_activation"))
        if replayed is None:
            summary["outcome"] = None
            summary["skipped"] = ("the landmark model was trained on this take" if leak else
                                  "no saved video, so no YOLOX" if runner else "YOLOX model not available")
        else:
            summary["outcome"] = take_outcome(meta.get("kind"), meta.get("expected_activation"), replayed["fired"])
            hit = next((t for t, j in replayed["fired"] if j == meta.get("expected_activation")), None)
            if hit is not None and holds:
                summary["latency_after_last_sign_end_s"] = round(hit - holds[-1]["end"], 3)
                summary["latency_after_last_sign_start_s"] = round(hit - holds[-1]["start"], 3)
            summary["confirmed_signs"] = [s for _, s in replayed["confirmed"]]
    return summary


def _add(frames, truth, orig, pred, session):
    frames["truth"] += list(truth)
    frames["orig"] += list(orig)
    frames["pred"] += list(pred)
    frames["session"] += [session] * len(pred)


def _acc(truth, pred):
    return round(float(np.mean(np.asarray(truth) == np.asarray(pred))), 4) if len(pred) else None


# ---------------------------------------------------------------- aggregation

def recognizer_labels(name, classifier):
    if name == "yolox":
        return ["idle"] + [s for s in YOLOX_SIGNS]
    if name == "landmarks" and classifier is not None:
        return list(classifier.labels)
    return list(config.GESTURES)


def aggregate_frames(store, name, classifier):
    """Metrics + confusion for one recogniser on one set."""
    labels = recognizer_labels(name, classifier)
    m = frame_metrics(store["truth"], store["pred"], labels)
    rows = sorted(set(store["orig"]), key=_order)
    cols = list(dict.fromkeys(labels + sorted(set(store["pred"]) - set(labels), key=_order)))
    m["confusion"] = {"rows": rows, "cols": cols,
                      "matrix": confusion(store["orig"], store["pred"], rows, cols).tolist(),
                      "correct_col": {r: (yolox_truth(r) if name == "yolox" else r) for r in rows}}
    m["sessions"] = sorted(set(store["session"]))
    m["latency_ms"] = latency(store["ms"])
    return m


def frame_level_results(stores, summaries, recognizers, classifier, skip=()):
    """{set: {recogniser: metrics}} for the sets with single-sign recordings. skip: ids whose frames are not
    in `stores` (excluded recordings)."""
    out = {}
    for set_name, recs in stores.items():
        singles = [r for r in summaries if r["set"] == set_name and r["kind"] == "single"]
        if not singles:
            continue
        valid = [r for r in singles if r["id"] not in skip]
        out[set_name] = {}
        for name in recognizers:
            if recs[name]["pred"]:
                out[set_name][name] = aggregate_frames(recs[name], name, classifier)
                continue
            reasons = {r[name]["skipped"] for r in valid if isinstance(r.get(name), dict) and "skipped" in r[name]}
            if not valid:
                reasons = {"every recording of this set is excluded (invalid labels)"}
            out[set_name][name] = {"frames": 0, "skipped": "; ".join(sorted(reasons)) or "no frames"}
    return out


def _merged(a, b):
    """One frame store with the frames of both."""
    return {k: a[k] + b[k] for k in a}


def aggregate_takes(summaries):
    """Per jutsu: activation rate on correct takes, false activations on negative takes, latency."""
    out = {}
    for s in summaries:
        if s.get("outcome") is None:
            continue
        j = out.setdefault(s["jutsu"], {"correct_takes": 0, "success": 0, "missed": 0, "wrong_jutsu": 0,
                                        "fired_twice": 0, "negative_takes": {}, "latency_end_s": [],
                                        "latency_start_s": [], "takes": []})
        j["takes"].append(s["id"])
        if s["take_kind"] == "correct":
            j["correct_takes"] += 1
            key = {"success": "success", "missed": "missed", "wrong jutsu": "wrong_jutsu",
                   "fired twice": "fired_twice"}[s["outcome"]]
            j[key] += 1
            if "latency_after_last_sign_end_s" in s:
                j["latency_end_s"].append(s["latency_after_last_sign_end_s"])
                j["latency_start_s"].append(s["latency_after_last_sign_start_s"])
        else:
            neg = j["negative_takes"].setdefault(s["take_kind"], {"takes": 0, "false_activations": 0})
            neg["takes"] += 1
            neg["false_activations"] += s["outcome"] == "false activation"
    for j in out.values():
        j["activation_rate"] = j["success"] / j["correct_takes"] if j["correct_takes"] else None
        for key in ("latency_end_s", "latency_start_s"):
            v = j.pop(key)
            j[key.replace("_s", "")] = ({"n": len(v), "mean_s": round(float(np.mean(v)), 3),
                                         "median_s": round(float(np.median(v)), 3)} if v else None)
    return out


def aggregate_streams(summaries):
    """Single-sign sessions replayed through the controller: a jutsu must never fire."""
    done = [s for s in summaries if s["kind"] == "single" and "controller" in s]
    minutes = sum(s["duration_s"] for s in done) / 60
    fired = [(s["id"], j) for s in done for _, j in s["controller"]["fired"]]
    return {"sessions": len(done), "minutes": round(minutes, 2), "false_activations": len(fired),
            "per_minute": round(len(fired) / minutes, 3) if minutes else None, "details": fired}


# ---------------------------------------------------------------- report

RAMP = ["#fcfcfb", "#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"]   # one blue hue, light -> dark
INK, INK_ON_DARK, SURFACE = "#0b0b0b", "#ffffff", "#fcfcfb"


def save_confusion_png(conf, title, path):
    """Heatmap: colour = share of the row (how a true sign's frames were named), text = count + share.
    The outlined cell in each row is the right answer."""
    rows, cols = conf["rows"], conf["cols"]
    m = np.asarray(conf["matrix"], float)
    share = m / np.maximum(m.sum(axis=1, keepdims=True), 1)
    fig, ax = plt.subplots(figsize=(2.2 + 0.82 * len(cols), 1.6 + 0.55 * len(rows)))
    fig.patch.set_facecolor(SURFACE)
    ax.imshow(share, cmap=LinearSegmentedColormap.from_list("ramp", RAMP), vmin=0, vmax=1, aspect="auto")
    ax.set_xticks(np.arange(len(cols) + 1) - 0.5, minor=True)
    ax.set_yticks(np.arange(len(rows) + 1) - 0.5, minor=True)
    ax.grid(which="minor", color=SURFACE, linewidth=2)            # thin gap between cells
    ax.tick_params(which="both", length=0)
    for i in range(len(rows)):
        for j in range(len(cols)):
            if m[i, j]:
                ax.text(j, i, f"{int(m[i, j])}\n{share[i, j]:.0%}", ha="center", va="center", fontsize=7.5,
                        color=INK_ON_DARK if share[i, j] > 0.6 else INK)
        if conf["correct_col"].get(rows[i]) in cols:
            ax.add_patch(Rectangle((cols.index(conf["correct_col"][rows[i]]) - 0.5, i - 0.5), 1, 1,
                                   fill=False, edgecolor=INK, linewidth=1.6, zorder=4, clip_on=False))
    ax.set_xticks(range(len(cols)), [SHORT.get(c, c) for c in cols], rotation=40, ha="right", fontsize=8)
    ax.set_yticks(range(len(rows)), rows, fontsize=8)
    ax.set_xlabel("what the recogniser said", fontsize=8.5, color="#52514e")
    ax.set_ylabel("true sign of the recording", fontsize=8.5, color="#52514e")
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.set_title(title, fontsize=9.5, loc="left", color=INK)
    fig.tight_layout()
    fig.savefig(path, dpi=130, facecolor=SURFACE)
    plt.close(fig)


def _pct(v):
    return "-" if v is None else f"{100 * v:.1f}%"


def _num(v, digits=3):
    return "-" if v is None else f"{v:.{digits}f}"


def confusion_text(conf):
    rows, cols, m = conf["rows"], [SHORT.get(c, c) for c in conf["cols"]], conf["matrix"]
    w = max(6, max(len(c) for c in cols) + 1)
    lines = [f"{'true / said':<15}" + "".join(f"{c:>{w}}" for c in cols)]
    for r, row in zip(rows, m):
        lines.append(f"{r:<15}" + "".join(f"{v:>{w}}" for v in row))
    return "\n".join(lines)


SET_TEXT = {
    "test": "TEST set: the headline. No model learned from these recordings and nothing was tuned on them.",
    "validation": ("VALIDATION set: used to choose the landmark model and to tune thresholds. Useful, but NOT "
                   "the final result."),
    "train": ("TRAIN set: the landmark model learned from these (its numbers are skipped here). YOLOX never saw "
              "any of our recordings, so YOLOX and fused-without-landmark-model numbers are still on unseen data, "
              "but this is NOT the agreed test set."),
}
REC_TEXT = {
    "landmarks": "landmark classifier alone (frames where MediaPipe found a hand)",
    "yolox": "YOLOX alone (saved video frames; best seal >= SEAL_MIN_SCORE, no hand check, no 2-in-a-row)",
    "fused": "fused, as in the app (SignFusion replayed in time: hands + classifier + YOLOX at SEAL_RATE_HZ)",
}


def write_report(out_dir, report):
    out_dir.mkdir(parents=True, exist_ok=True)
    pngs = {}
    all_frames = report.get("frame_level_all_recordings", {})
    for set_name, recs in report["frame_level"].items():
        scope = f", {VALID_ONLY}\n" if set_name in all_frames else ": "
        for name, m in recs.items():
            if m.get("frames"):
                path = out_dir / f"confusion_{name}_{set_name}.png"
                save_confusion_png(m["confusion"], f"{name} - {set_name} set{scope}accuracy {_pct(m['accuracy'])}, "
                                   f"macro-F1 {_num(m['macro_f1'])} ({m['frames']} frames)", path)
                pngs[(set_name, name)] = path.name
    for set_name, recs in all_frames.items():                 # the same, with the invalid labels in
        scope = _all_text(len(_excluded_ids(report, set_name)))
        for name, m in recs.items():
            if m.get("frames"):
                path = out_dir / f"confusion_{name}_{set_name}_all_recordings.png"
                save_confusion_png(m["confusion"], f"{name} - {set_name} set, {scope}\naccuracy {_pct(m['accuracy'])}"
                                   f", macro-F1 {_num(m['macro_f1'])} ({m['frames']} frames)", path)
                pngs[(set_name, name, "all")] = path.name
    (out_dir / "metrics.json").write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    (out_dir / "summary.md").write_text(summary_markdown(report, pngs), encoding="utf-8")


def _all_text(n):
    """Label of the numbers that still include the excluded recordings."""
    return f"all recordings (includes {n} recording{'' if n == 1 else 's'} with invalid labels)"


def _excluded_ids(report, set_name=None, kind="single"):
    """Ids of the excluded recordings evaluated in this run (of one set)."""
    return [r["id"] for r in report["recordings"]
            if "excluded" in r and r["kind"] == kind and set_name in (None, r["set"])]


def _cell(text):
    """Free text inside a markdown table (a | would end the cell, ~ can strike text through)."""
    return str(text).replace("|", "\\|").replace("~", "\\~")


def _excluded_mark(r):
    return f" - **EXCLUDED: {_cell(r['excluded']['reason'])}**" if "excluded" in r else ""


def exclusions_markdown(report):
    """Near the top of summary.md: which recordings are left out of the scores, why, and that they are kept."""
    ex = report["exclusions"]
    set_of = {r["id"]: r["set"] for r in report["recordings"]}
    L = [f"## Excluded from the scores: {len(ex['recordings'])} recording(s) with invalid labels", "",
         f"Listed in `{ex['file']}`. They were **not deleted and not moved**: each keeps its set in splits.json and "
         f"is still evaluated on its own (section 4, marked EXCLUDED). Every aggregate they would be part of is "
         f"given twice: **{VALID_ONLY}** is the result; **all recordings** also counts these invalid labels and is "
         f"shown only for comparison.", "",
         "| set | recording | label | reason | evidence | decided |", "|---|---|---|---|---|---|"]
    for rid, e in ex["recordings"].items():
        L.append(f"| {set_of.get(rid, e['set'])} | {rid} | {_cell(e['label'])} | {_cell(e['reason'])} | "
                 f"{_cell(e.get('evidence') or '-')} | {_cell(e['decided_on'])} by {_cell(e['decided_by'])} |")
    return L + [""]


def _glance(frame_level):
    """The results-at-a-glance table."""
    L = ["| set | recogniser | recordings | frames | accuracy | macro-F1 | balanced accuracy |",
         "|---|---|---|---|---|---|---|"]
    for set_name in SET_ORDER:
        for name, m in frame_level.get(set_name, {}).items():
            if m.get("frames"):
                L.append(f"| {set_name} | {name} | {len(m['sessions'])} | {m['frames']} | {_pct(m['accuracy'])} | "
                         f"{_num(m['macro_f1'])} | {_pct(m['balanced_accuracy'])} |")
            else:
                L.append(f"| {set_name} | {name} | - | 0 | not run (see section 3) | - | - |")
    return L


def _details(m, name, png, alt, excluded=(), notes=True):
    """Per-sign table, confusion matrix and plot of one recogniser on one set. notes: YOLOX note + timing."""
    if not m.get("frames"):
        return [f"No frames: {m.get('skipped', 'nothing to score')}", ""]
    ids = [i + (" (EXCLUDED)" if i in excluded else "") for i in m["sessions"]]
    L = [f"From {len(m['sessions'])} recordings: {', '.join(ids)}", "",
         "| sign | precision | recall | F1 | frames (true) | frames (said) |", "|---|---|---|---|---|---|"]
    for c, v in m["per_class"].items():
        if v["support"] or v["predicted"]:
            L.append(f"| {c} | {_pct(v['precision'])} | {_pct(v['recall'])} | {_num(v['f1'])} | "
                     f"{v['support']} | {v['predicted']} |")
    L += ["", "```", confusion_text(m["confusion"]), "```", ""]
    if name == "yolox" and notes:
        L += ["YOLOX has no class for idle, clone_seal or rasengan_palm: for those recordings the right "
              "answer is `idle` (no seal).", ""]
    if png:
        L += [f"![{alt}]({png})", ""]
    lat = m.get("latency_ms")
    if lat and notes:
        L += [f"Time per {'YOLOX run' if name == 'yolox' else 'frame'}: median {lat['median']} ms, "
              f"p90 {lat['p90']} ms (measured while other programs shared the CPU: not a final speed).", ""]
    return L


def _streams_text(streams, scope=""):
    return (f"**Single-sign sessions replayed through the controller{scope}:** {streams['sessions']} sessions, "
            f"{streams['minutes']} minutes, **{streams['false_activations']} jutsu fired** (should be 0: one held "
            f"sign can never complete a 4-sign jutsu)."
            + (f" Details: {streams['details']}" if streams["details"] else ""))


def _takes_table(per):
    L = ["| jutsu | correct takes | fired right, once | activation rate | missed | wrong jutsu | fired twice | "
         "negative takes (false activations) | median latency after the last sign's window ended |",
         "|---|---|---|---|---|---|---|---|---|"]
    for jutsu, j in per.items():
        neg = ", ".join(f"{k}: {v['false_activations']}/{v['takes']}" for k, v in j["negative_takes"].items())
        lat = "-" if j["latency_end"] is None else f"{j['latency_end']['median_s']:+.2f} s"
        L.append(f"| {jutsu} | {j['correct_takes']} | {j['success']} | {_pct(j['activation_rate'])} | "
                 f"{j['missed']} | {j['wrong_jutsu']} | {j['fired_twice']} | {neg or '-'} | {lat} |")
    return L


def summary_markdown(report, pngs):
    s = report["settings"]
    evaluated = report["sets_evaluated"]
    excluded = (report.get("exclusions") or {}).get("recordings", {})
    all_frames = report.get("frame_level_all_recordings", {})
    L = [f"# SHINOBI AI - evaluation report ({report['created']})", ""]
    if report.get("title"):
        L += [f"**{report['title']}**", ""]
    if "test" not in evaluated or not report["sessions_by_set"].get("test"):
        L += ["> **NOT A FINAL RESULT.** No test recordings were evaluated in this run, so none of the numbers "
              "below is the honest test result. See the warnings at the end.", ""]
    for note in report.get("notes", []):
        L += [f"> {note}", ""]
    if excluded:
        L += exclusions_markdown(report)

    L += ["## 1. What was measured", ""]
    for set_name in SET_ORDER:
        ids = report["sessions_by_set"].get(set_name)
        if ids is not None:
            n_ex = sum(i in excluded for i in ids)
            out = f", {n_ex} of them excluded from the scores" if n_ex else ""
            L += [f"- **{set_name}** ({len(ids)} recordings{out}): {SET_TEXT[set_name]}"]
            L += [f"  - {', '.join(i + (' (EXCLUDED)' if i in excluded else '') for i in ids) if ids else '(none)'}"]
    model = report["model"]
    L += ["", f"- Landmark model: `{model['path']}` - " +
          (f"used ({model.get('model_name')}, trained on {len(model['train_sessions'])} train recordings, "
           f"created {model.get('created')})." if model["usable"] else f"**not used**: {model['reason']}"),
          f"- YOLOX: `{config.SEAL_MODEL_PATH.name}`, pretrained elsewhere, never trained on our recordings - "
          + ("used." if report["yolox_used"] else "not requested in this run (--recognizers)."
             if not report.get("yolox_requested", True) else "**not used** (model file or onnxruntime missing)."),
          f"- Fused = what the app decides: " + ("YOLOX + hands + landmark classifier." if model["usable"] else
                                                   "YOLOX + hands only (no landmark model), so clone_seal and "
                                                   "rasengan_palm can never be recognised in this run."),
          f"- Frames: the first {s['skip_start_s']} s of every single-sign session are not scored (the countdown "
          f"is not saved; this skips fusion's start-up, see docs/14_evaluation.md). The replay itself starts at 0 s.",
          f"- Replay of YOLOX like the app: at most {s['seal_rate_hz']} runs per second on the newest saved video "
          f"frame, each result usable {s['yolox_delay_s']} s after its frame. The saved video has ~10 frames per "
          f"second, so the replay ran YOLOX {s.get('yolox_runs_per_s_median', '-')} times per second (median).",
          f"- Thresholds (shinobi/config.py): SEAL_MIN_SCORE {config.SEAL_MIN_SCORE}, SEAL_NO_HAND_SCORE "
          f"{config.SEAL_NO_HAND_SCORE}, SEAL_CONFIRM {config.SEAL_CONFIRM}, LANDMARK_MIN_PROB "
          f"{config.LANDMARK_MIN_PROB}, CONF_ON {config.CONF_ON}, HOLD_SECONDS {config.HOLD_SECONDS}.", ""]

    L += ["## 2. Results at a glance (frame level)", ""]
    if all_frames:
        L += [f"**{VALID_ONLY.capitalize()}** - the result:", ""]
    L += _glance(report["frame_level"])
    if all_frames:
        L += ["", f"**{_all_text(len(_excluded_ids(report))).capitalize()}** - contaminated by invalid labels, "
              f"for comparison only:", ""] + _glance(all_frames)
    L += ["", "accuracy = share of frames named correctly. macro-F1 / balanced accuracy give every sign the same "
          "weight, so a sign the recogniser never gets right pulls them down even if it has few frames.", ""]

    L += ["## 3. Details per set and recogniser", ""]
    for set_name in SET_ORDER:
        for name, m in report["frame_level"].get(set_name, {}).items():
            L += [f"### {name} - {set_name} set", "", f"_{REC_TEXT[name]}_", ""]
            m_all = all_frames.get(set_name, {}).get(name)
            if m_all is None or not (m.get("frames") or m_all.get("frames")):     # nothing to give twice
                L += _details(m, name, pngs.get((set_name, name)), f"{name} {set_name}")
                continue
            L += [f"#### {VALID_ONLY.capitalize()}", ""]
            L += _details(m, name, pngs.get((set_name, name)), f"{name} {set_name}")
            L += [f"#### {_all_text(len(_excluded_ids(report, set_name))).capitalize()}", "",
                  "_Contaminated by invalid labels: for comparison only, not the result._", ""]
            L += _details(m_all, name, pngs.get((set_name, name, "all")), f"{name} {set_name} all recordings",
                          excluded, notes=False)

    L += ["## 4. Every recording", "",
          "| set | recording | sign | hands found | landmarks | yolox | fused | signs confirmed by the controller | jutsu fired |",
          "|---|---|---|---|---|---|---|---|---|"]
    for r in report["recordings"]:
        if r["kind"] != "single":
            continue
        cells = []
        for name in RECOGNIZERS:
            v = r.get(name)
            cells.append("-" if v is None else ("skipped" if "skipped" in v else _pct(v.get("accuracy"))))
        ctrl = r.get("controller", {})
        L.append(f"| {r['set']} | {r['id']}{_excluded_mark(r)} | {r['group']} | {_pct(r['hands_found'])} | "
                 f"{' | '.join(cells)} | {', '.join(s for _, s in ctrl.get('confirmed', [])) or '-'} | "
                 f"{', '.join(j for _, j in ctrl.get('fired', [])) or 'none'} |")
    L += ["", "\"signs confirmed\" = what the GestureStabilizer accepted (held long enough); holding one sign "
          "should confirm exactly that sign once.", ""]
    if excluded:
        L += ["Rows marked EXCLUDED have an invalid label: they are shown for completeness, their frames are "
              f"counted only in the \"all recordings\" numbers, never in the {VALID_ONLY} ones.", ""]

    L += ["## 5. Jutsu (sequence level)", ""]
    streams = report["sequence_level"]["single_sign_streams"]
    streams_all = report["sequence_level"].get("single_sign_streams_all_recordings")
    if streams_all is None:
        L += [_streams_text(streams), ""]
    else:
        L += [_streams_text(streams, f", {VALID_ONLY}"), "",
              _streams_text(streams_all, f", {_all_text(len(_excluded_ids(report)))}, for comparison only"), ""]
    takes = report["sequence_level"]["takes"]
    takes_all = report["sequence_level"].get("takes_all_recordings", {})
    if not report["sequence_level"]["takes_found"]:
        L += ["**Guided sequence takes:** none recorded yet (data/sequences is empty). Record them with "
              "`record_sequences.py`, run `python evaluate.py splits`, then evaluate again.", ""]
    for set_name in SET_ORDER:
        per, per_all = takes.get(set_name), takes_all.get(set_name)
        if not per and not per_all:
            continue
        L += [f"### takes - {set_name} set", ""]
        if per_all:
            L += [f"**{VALID_ONLY.capitalize()}:**", ""]
        L += _takes_table(per or {})
        if per_all:
            L += ["", f"**{_all_text(len(_excluded_ids(report, set_name, 'take'))).capitalize()}** - contaminated "
                  f"by invalid labels, for comparison only:", ""] + _takes_table(per_all)
        L += ["", "Latency: from the moment the screen stopped asking for the last sign to the activation. "
              "Negative = the jutsu fired while the last sign was still being asked for (normal: it needs only "
              f"{config.HOLD_SECONDS} s of hold).", ""]
        for r in report["recordings"]:
            if r["kind"] == "take" and r["set"] == set_name:
                L.append(f"- {r['id']}{_excluded_mark(r)}: {r.get('take_kind')} {r.get('signs')} -> "
                         f"**{r.get('outcome') or r.get('skipped')}**; confirmed {r.get('confirmed_signs', [])}")
        L.append("")

    L += ["## 6. Warnings and caveats", ""]
    L += [f"- {w}" for w in report["warnings"]] or ["- none"]
    L += ["", "## 7. How to read this report", "",
          "- **Precision** of a sign: when the recogniser said it, how often was it right? Low = effects fire by mistake.",
          "- **Recall** of a sign: of the frames that really were that sign, how many were found? Low = you do the "
          "sign and nothing happens.",
          "- **Confusion matrix**: rows = the sign that was really recorded, columns = what was said. The outlined "
          "cell is the right answer; everything else in the row is a mistake.",
          "- **Frame level** numbers are strict: a single wrong frame counts. The app smooths over frames, which is "
          "why section 5 (what the user actually sees) matters too.",
          "- Numbers from few recordings move a lot: one recording per sign is a smoke test, not a measurement.",
          "- More: docs/14_evaluation.md.", ""]
    return "\n".join(L)


# ---------------------------------------------------------------- commands

def cmd_splits(args):
    path = Path(args.splits) if args.splits else Path(args.data) / "splits.json"
    try:
        existing = splits_mod.load(path)
        recordings, ignored, notes = splits_mod.scan(args.data)
    except splits_mod.SplitsError as e:
        raise SystemExit(f"ERROR: {e}")
    quotas = None
    if args.quota or args.take_quota:
        quotas = json.loads(json.dumps((existing or {}).get("quotas") or splits_mod.QUOTAS))
        for kind, text in (("single", args.quota), ("take", args.take_quota)):
            if text:
                values = [int(v) for v in text.split(",")]
                if len(values) != 3 or min(values) < 0 or sum(values) == 0:
                    raise SystemExit("quotas are three numbers train,validation,test, e.g. 3,1,1")
                quotas[kind] = dict(zip(("train", "validation", "test"), values))
        print("note: new quotas apply to recordings assigned from now on; assigned ones never move.")
    result, new_ids = splits_mod.update(existing, recordings, ignored, quotas)
    for item in args.assign or []:
        rid, _, set_name = item.partition("=")
        try:
            old = splits_mod.assign(result, recordings, rid.strip(), set_name.strip())
        except splits_mod.SplitsError as e:
            raise SystemExit(f"ERROR: {e}")
        print(f"by hand: {rid} {old or '(new)'} -> {set_name}")
        if old == "train" and set_name != "train":
            print("  ! it was in train: re-train (python train.py) before evaluating, or evaluate.py will skip it "
                  "for the landmark model")
    text, _ = splits_mod.table(result, recordings, ignored, new_ids, notes, path, listing=args.list)
    print(text)
    if args.dry_run:
        print(f"\n--dry-run: {path} was NOT written")
    elif existing is None or new_ids or args.assign or quotas or result.get("ignored") != existing.get("ignored"):
        splits_mod.save(result, path)
        print(f"\nwrote {path}")
    else:
        print(f"\n{path} unchanged")


def cmd_run(args):
    data_dir = Path(args.data)
    path = Path(args.splits) if args.splits else data_dir / "splits.json"
    try:
        splits = splits_mod.load(path)
        recordings, ignored, notes = splits_mod.scan(data_dir)
    except splits_mod.SplitsError as e:
        raise SystemExit(f"ERROR: {e}")
    if splits is None:
        raise SystemExit(f"{path} does not exist: run `python evaluate.py splits` first.")
    ex_path, exclusions = exclusions_for(args, data_dir)
    sets = splits_mod.set_of(splits)
    wanted = list(SET_ORDER) if args.sets == "all" else [s.strip() for s in args.sets.split(",")]
    bad = [s for s in wanted if s not in splits_mod.SETS]
    if bad:
        raise SystemExit(f"unknown set(s) {bad}: use test, validation, train or all")
    args.recognizers = [r.strip() for r in args.recognizers.split(",")]
    only = set(args.sessions.split(",")) if args.sessions else None
    chosen = [r for r in recordings if sets.get(r.id) in wanted and (only is None or r.id in only)]
    chosen.sort(key=lambda r: (SET_ORDER.index(sets[r.id]), r.kind != "single", _order(r.group), r.group, r.id))
    applied = {r.id: exclusions[r.id] for r in chosen if r.id in exclusions}   # evaluated, but not scored
    warnings = list(notes)
    if exclusions:
        warnings += exclusion_warnings(exclusions, recordings, sets, ex_path)
    unassigned = [r.id for r in recordings if r.id not in sets]
    if unassigned:
        warnings.append(f"{len(unassigned)} recording(s) have no set yet and were NOT evaluated: "
                        f"{', '.join(unassigned)}. Run `python evaluate.py splits`.")

    model, classifier = model_status(None if args.model.lower() == "none" else Path(args.model))
    if model["exists"] and not model["usable"]:
        warnings.append(f"Landmark model NOT used: {model['reason']}")
    elif not model["exists"]:
        warnings.append(f"No landmark model: {model['reason']}. Landmark numbers are missing and fused = YOLOX + "
                        f"hands only (clone_seal and rasengan_palm cannot be recognised).")
    if model["usable"]:
        moved = [i for i in model["train_sessions"] if sets.get(i) in ("test", "validation")]
        if moved:
            warnings.append(f"The landmark model learned from {moved}, which splits.json now puts in test/validation "
                            f"(hand edit after training?). They are skipped for it; re-train to fix.")
        chose = [i for i in model["validation_sessions"] if sets.get(i) == "test"]
        if chose:
            warnings.append(f"The landmark model was chosen using {chose}, now in test: those numbers are slightly "
                            f"optimistic. Re-train.")

    runner = None
    yolox_wanted = bool({"yolox", "fused"} & set(args.recognizers) or any(r.kind == "take" for r in chosen))
    if yolox_wanted:
        try:
            runner = SealRunner() if config.SEAL_MODEL_PATH.exists() else None
        except ImportError as e:
            warnings.append(f"YOLOX not available: {e}")
        if runner is None:
            warnings.append("YOLOX not available: YOLOX and fused numbers are missing.")

    stores = {s: {n: _frames_store() for n in RECOGNIZERS} for s in wanted}
    excluded_stores = {s: {n: _frames_store() for n in RECOGNIZERS} for s in wanted}   # frames of excluded ones
    summaries = []
    started = time.perf_counter()
    try:
        for n, rec in enumerate(chosen, 1):
            set_name = sets[rec.id]
            print(f"[{n}/{len(chosen)}] {set_name:<10} {rec.group:<22} {rec.id}"
                  + ("  (EXCLUDED from the scores: invalid label)" if rec.id in applied else ""), flush=True)
            summary = evaluate_recording(rec, set_name, data_dir, args, classifier, model, runner,
                                         (excluded_stores if rec.id in applied else stores)[set_name])
            if rec.id in applied:
                summary["excluded"] = applied[rec.id]
            summaries.append(summary)
    finally:
        if runner:
            runner.close()

    # aggregates: valid recordings only = the result; with the excluded ones = only for the sets they are in
    frame_level = frame_level_results(stores, summaries, args.recognizers, classifier, skip=applied)
    single_out = [r["id"] for r in summaries if r["id"] in applied and r["kind"] == "single"]
    frame_level_all = frame_level_results(
        {s: {n: _merged(stores[s][n], excluded_stores[s][n]) for n in RECOGNIZERS}
         for s in wanted if any(sets[i] == s for i in single_out)}, summaries, args.recognizers, classifier)
    take_summaries = [r for r in summaries if r["kind"] == "take"]
    take_sets = [s for s in wanted if any(r["set"] == s and r["id"] in applied for r in take_summaries)]

    for r in summaries:
        rid = r["id"] + (" (EXCLUDED: invalid label)" if r["id"] in applied else "")
        if r["kind"] == "single" and r.get("video", {}).get("aligned", "exact") not in ("exact", None):
            warnings.append(f"{rid}: video frame count does not match the recorder's rule; YOLOX frames were "
                            f"aligned approximately.")
        if r["kind"] == "single" and r.get("video", {}).get("missing"):
            warnings.append(f"{rid}: no saved video ({r['video']['missing']}), so no YOLOX / fused numbers.")
        for j in r.get("controller", {}).get("fired", []) if r["kind"] == "single" else []:
            warnings.append(f"{rid} ({r['group']}): the jutsu '{j[1]}' fired at {j[0]} s while only one sign "
                            f"was held - a false activation.")
    rates = [r["yolox_runs_per_s"] for r in summaries if "yolox_runs_per_s" in r]
    takes_found = [r for r in recordings if r.kind == "take"]
    sequence_level = {
        "takes_found": len(takes_found),
        "takes": {s: aggregate_takes([r for r in take_summaries if r["set"] == s and r["id"] not in applied])
                  for s in wanted},
        "single_sign_streams": aggregate_streams([r for r in summaries if r["id"] not in applied]),
    }
    if single_out:
        sequence_level["single_sign_streams_all_recordings"] = aggregate_streams(summaries)
    if take_sets:
        sequence_level["takes_all_recordings"] = {s: aggregate_takes([r for r in take_summaries if r["set"] == s])
                                                  for s in take_sets}
    report = {
        "format": "shinobi-eval-v1",
        "created": datetime.now().isoformat(timespec="seconds"),
        "command": " ".join(sys.argv),
        "title": args.title, "notes": args.note or [],
        **({"exclusions": {"file": str(ex_path), "recordings": applied}} if applied else {}),
        "settings": {"sets": wanted, "recognizers": args.recognizers, "skip_start_s": args.skip_start,
                     "yolox_delay_s": args.yolox_delay, "seal_rate_hz": config.SEAL_RATE_HZ,
                     "yolox_runs_per_s_median": round(float(np.median(rates)), 2) if rates else None,
                     "seal_min_score": config.SEAL_MIN_SCORE, "seal_no_hand_score": config.SEAL_NO_HAND_SCORE,
                     "seal_confirm": config.SEAL_CONFIRM, "seal_max_age": config.SEAL_MAX_AGE,
                     "landmark_min_prob": config.LANDMARK_MIN_PROB, "conf_on": config.CONF_ON,
                     "hold_seconds": config.HOLD_SECONDS, "data": str(data_dir), "splits": str(path),
                     "exclusions": str(ex_path) if ex_path is not None and ex_path.exists() else None},
        "sets_evaluated": wanted,
        "sessions_by_set": {s: [r.id for r in chosen if sets[r.id] == s] for s in wanted},
        "model": model, "yolox_used": runner is not None, "yolox_requested": yolox_wanted,
        "frame_level": frame_level,
        **({"frame_level_all_recordings": frame_level_all} if frame_level_all else {}),
        "sequence_level": sequence_level,
        "recordings": summaries,
        "ignored": ignored,
        "warnings": warnings + _caveats(chosen, sets, recordings, splits, exclusions),
        "seconds": round(time.perf_counter() - started, 1),
    }
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    out_dir = Path(args.out) / stamp
    n = 1
    while out_dir.exists():
        out_dir = Path(args.out) / f"{stamp}_{n}"
        n += 1
    write_report(out_dir, report)
    print(f"\nreport: {out_dir / 'summary.md'}")
    if applied:
        print(f"  {VALID_ONLY}; {len(applied)} excluded: {', '.join(applied)}")
    for tag, levels in (("", frame_level), ("  <- all recordings, with invalid labels", frame_level_all)):
        for set_name, recs in levels.items():
            for name, m in recs.items():
                if m.get("frames"):
                    print(f"  {set_name:<10} {name:<10} accuracy {_pct(m['accuracy']):>7}  macro-F1 "
                          f"{_num(m['macro_f1'])}  ({m['frames']} frames, {len(m['sessions'])} recordings){tag}")
    return out_dir


def _caveats(chosen, sets, recordings, splits, excluded=()):
    """Honest limits of this run, computed from what was actually evaluated and scored.
    excluded: ids of the recordings with invalid labels (not scored)."""
    out = []
    rows, _ = splits_mod.review(splits, recordings)
    weak = [r["group"] for r in rows if r["kind"] == "single" and r["counts"]["test"] == 0]
    if weak:
        out.append(f"Signs without any test recording yet: {', '.join(weak)}. They have no honest test number.")
    scored = [r for r in chosen if r.id not in excluded]                 # what the numbers come from
    if len(scored) < len(chosen):
        test, run = [r for r in recordings if r.kind == "single" and sets.get(r.id) == "test"], {r.id for r in chosen}
        lost = sorted({r.group for r in test if r.id in excluded and r.id in run}
                      - {r.group for r in test if r.id not in excluded}, key=_order)
        if lost:
            out.append(f"Signs whose only test recordings are excluded (invalid labels): {', '.join(lost)}. They "
                       f"have no valid test number.")
    clash = [r["group"] for r in rows if r["test_clash"]]
    if clash:
        out.append(f"Test recordings that share day + lighting with training data: {', '.join(clash)} "
                   f"(optimistic numbers).")
    per_sign = Counter(r.group for r in scored if r.kind == "single")
    few = sorted(g for g, n in per_sign.items() if n < 2)
    if few:
        out.append(f"Only one {'valid ' if len(scored) < len(chosen) else ''}recording evaluated for: "
                   f"{', '.join(few)}. One recording = one person, one day, one light: treat those numbers as a "
                   f"smoke test.")
    conds = sorted({(r.date, r.lighting) for r in scored})
    if conds and len(conds) <= 2:
        out.append(f"All evaluated recordings come from {', '.join(f'{c[1]} {c[0]}' for c in conds)}: nothing "
                   f"here says how the app does in other light or on other days.")
    out.append("YOLOX sees the saved 480p reference video (mp4), not the live 720p camera frame: pixels differ a "
               "little from the app's.")
    out.append("Hands come from the landmarks saved while recording (MediaPipe on the live 720p frame), as the app "
               "would have them; MediaPipe itself is not re-run.")
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("splits", help="give new recordings a set (train / validation / test)")
    p.add_argument("--data", default=str(config.DATA_DIR))
    p.add_argument("--splits", default=None, help="default: <data>/splits.json")
    p.add_argument("--quota", default=None, help="single-sign sessions per sign: train,validation,test (default 3,1,1)")
    p.add_argument("--take-quota", default=None, help="sequence takes per jutsu + kind (default 0,1,1)")
    p.add_argument("--assign", action="append", metavar="ID=SET", help="put one recording in a set by hand")
    p.add_argument("--list", action="store_true", help="also list every recording")
    p.add_argument("--dry-run", action="store_true", help="show the result but do not write the file")
    p.set_defaults(func=cmd_splits)

    p = sub.add_parser("run", help="evaluate recordings -> reports/<time>/")
    p.add_argument("--data", default=str(config.DATA_DIR))
    p.add_argument("--splits", default=None, help="default: <data>/splits.json")
    p.add_argument("--sets", default="test", help="test (default), validation, train, a comma list, or all")
    p.add_argument("--sessions", default=None, help="only these recording ids (comma list)")
    p.add_argument("--recognizers", default=",".join(RECOGNIZERS))
    p.add_argument("--model", default=str(config.GESTURE_MODEL_PATH), help="landmark model, or 'none'")
    p.add_argument("--exclusions", default=None, help=f"recordings with invalid labels, left out of the scores "
                   f"(default: <data>/{EXCLUSIONS_FILE} if it exists), or 'none'")
    p.add_argument("--skip-start", type=float, default=SKIP_START, help="seconds not scored at a session start")
    p.add_argument("--yolox-delay", type=float, default=YOLOX_DELAY, help="seconds until a YOLOX result is usable")
    p.add_argument("--out", default=str(REPORTS_DIR))
    p.add_argument("--title", default=None, help="a line shown at the top of summary.md")
    p.add_argument("--note", action="append", help="a note shown at the top of summary.md (repeatable)")
    p.set_defaults(func=cmd_run)
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    main()

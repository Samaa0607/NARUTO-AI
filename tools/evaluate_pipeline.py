"""Extra measurements for the AI evaluation report (reports/ai_evaluation/), on top of evaluate.py.

Run (from the project folder):
  python tools/evaluate_pipeline.py negatives  --cache DIR
  python tools/evaluate_pipeline.py loro
  python tools/evaluate_pipeline.py sequences  --cache DIR
  python tools/evaluate_pipeline.py montecarlo
  python tools/evaluate_pipeline.py fps        --url ws://127.0.0.1:8003/ws --fixtures DIR
  python tools/evaluate_pipeline.py figures
  python tools/evaluate_pipeline.py summary

  negatives   never-trained footage of hands that make NO sign of the app (claw, OK sign, two open
              palms: data/landmarks/{chidori,fire} = old labels the splits ignore, data/_discarded)
              + the held-out idle recordings: what each recogniser says per frame, which signs the
              app confirms, and how many jutsu it fires (Live mode and Practice mode)
  loro        landmark classifier, leave-one-recording-out: train.py's random forest and features,
              refitted in memory once per recording (nothing is saved, the installed model is untouched)
  sequences   spliced performances (windows of the single-sign recordings, in order, with short idle
              gaps) through fusion + the controller: activation rate, wrong jutsu, latency; all four
              jutsu back to back; long random sign streams (unintended activations)
  montecarlo  the sequence matcher alone on long random sign streams (Live and Practice)
  fps         the real server over its WebSocket (camera fixtures at 15 fps, like a browser):
              per-stage timings idle and during each effect
  figures     PNG charts of the parts above

Everything runs the app's own code (evaluate.py helpers, shinobi.*); nothing is re-implemented and
nothing is written into data/ or models/. Results: reports/ai_evaluation/parts/<part>.json. The YOLOX
results of every clip are cached in --cache (outside the repository: the clips show the user).
"""

import argparse
import asyncio
import itertools
import json
import pickle
import random
import struct
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field, replace
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))                       # run as a plain script from tools/
import evaluate as ev  # noqa: E402
import splits as splits_mod  # noqa: E402
from shinobi import config  # noqa: E402
from shinobi.controller import ActionController, SequenceMatcher  # noqa: E402
from shinobi.features import extract  # noqa: E402
from shinobi.fusion import SignFusion  # noqa: E402

OUT = ROOT / "reports" / "ai_evaluation"
PARTS = OUT / "parts"
DATA = config.DATA_DIR
SIGNS = [g for g in config.GESTURES if g != "idle"]
JUTSU = list(config.JUTSU)
SKIP = ev.SKIP_START                                 # the first 0.5 s of a session are not scored
RNG_SEED = 20261101
_RESULT_IDS = itertools.count(1)      # every YOLOX result in a stream gets its own id (fusion tracks ids)


# ---------------------------------------------------------------- clips

@dataclass
class Clip:
    id: str
    npz: Path
    video: Path
    label: str          # what the app should answer: a sign, or "idle" (the hand makes no sign of the app)
    what: str           # what the clip shows
    status: str         # train / validation (data/splits.json) or "never trained" (not in the splits)
    data: dict = field(default=None, repr=False)


def split_clips():
    """The 19 recordings of data/splits.json (single-sign sessions)."""
    sets = splits_mod.set_of(splits_mod.load(splits_mod.DEFAULT_PATH))
    recordings, _, _ = splits_mod.scan(DATA)
    clips = []
    for rec in recordings:
        if rec.id not in sets or rec.kind != "single":
            continue
        clips.append(Clip(rec.id, DATA / rec.path, DATA / "videos" / Path(rec.path).parent.name / f"{rec.id}.mp4",
                          rec.group, f"{rec.group} held", sets[rec.id]))
    return clips


def negative_clips():
    """Never-trained clips of hands that make no sign of the app (gesture_references/README.md, section
    'the existing data'): old 'chidori' = claw hand, old 'fire' = OK sign, data/_discarded = two open
    palms recorded under a wrong name."""
    out = []
    for folder, what in (("chidori", "claw hand (old 'chidori' gesture)"), ("fire", "OK sign (old 'fire' gesture)")):
        for p in sorted((DATA / "landmarks" / folder).glob("*.npz")):
            out.append(Clip(p.stem, p, DATA / "videos" / folder / f"{p.stem}.mp4", "idle", what, "never trained"))
    for p in sorted((DATA / "_discarded").glob("*.npz")):
        out.append(Clip(p.stem, p, p.with_suffix(".mp4"), "idle", "two open palms (data/_discarded)", "never trained"))
    return out


def load_clip(clip, classifier, runner, cache):
    """Landmarks, hands, classifier output and (cached) YOLOX results of a clip."""
    if clip.data is not None:
        return clip.data
    with np.load(clip.npz) as d:
        arrays = {k: d[k] for k in d.files if k != "meta"}
        meta = json.loads(str(d["meta"]))
    times = np.asarray(arrays["timestamps"], float)
    aspect = float(meta.get("aspect", 16 / 9))
    cache_file = Path(cache) / f"{clip.id}.pkl"
    if cache_file.exists():
        seal = pickle.loads(cache_file.read_bytes())
    else:
        frames = ev.read_video(clip.video)
        v_idx, exact = ev.align_video(times, len(frames))
        results = [runner.run(f, float(times[i])) for f, i in zip(frames, v_idx)]
        seal = {"v_idx": np.asarray(v_idx), "exact": bool(exact), "results": results,
                "height": frames[0].shape[0], "width": frames[0].shape[1]}
        cache_file.write_bytes(pickle.dumps(seal))
    probs, _ = (ev.landmark_probs(classifier, arrays["image_lm"], arrays["world_lm"], arrays["present"], aspect)
                if classifier is not None else ([None] * len(times), []))
    hands = [ev.hands_from_arrays(*f, seal["width"], seal["height"])
             for f in zip(arrays["image_lm"], arrays["world_lm"], arrays["present"])]
    clip.data = {"times": times, "aspect": aspect, "probs": probs, "hands": hands, "present": arrays["present"],
                 "image_lm": arrays["image_lm"], "world_lm": arrays["world_lm"], **seal}
    return clip.data


# ---------------------------------------------------------------- streams (one clip, or spliced windows)

@dataclass
class Stream:
    times: list = field(default_factory=list)       # landmark frame times (s)
    hands: list = field(default_factory=list)
    probs: list = field(default_factory=list)       # classifier output per frame (None: no hand / no model)
    video: list = field(default_factory=list)       # [(time, SealResult)] of the saved video frames
    marks: list = field(default_factory=list)       # [(start, end, label)] of every segment
    end: float = 0.0

    def add(self, d, t0, t1, label, use_model=True):
        """Append the window [t0, t1) of a loaded clip."""
        sel = np.flatnonzero((d["times"] >= t0) & (d["times"] < t1))
        off = self.end - t0
        for i in sel:
            self.times.append(float(d["times"][i] + off))
            self.hands.append(d["hands"][i])
            self.probs.append(d["probs"][i] if use_model else None)
        for k, i in enumerate(d["v_idx"]):
            if t0 <= d["times"][i] < t1:
                # fusion drops a result older than SEAL_MAX_AGE (by .time) and counts a new one by .id:
                # move the result to the stream's clock and give it a fresh id
                res = d["results"][k]
                self.video.append((float(d["times"][i] + off),
                                   replace(res, time=float(res.time + off), id=next(_RESULT_IDS))))
        start = self.end
        self.end = start + (t1 - t0)
        self.marks.append((round(start, 3), round(self.end, 3), label))


def controller_for(mode, jutsu=None):
    """Live = every jutsu, SEQUENCE_MAX_GAP between steps; practice = one jutsu, no time limit (engine.set_jutsu)."""
    if mode == "practice":
        return ActionController(config.GESTURES, jutsu={jutsu: config.JUTSU[jutsu]}, max_gap=None)
    return ActionController(config.GESTURES, jutsu=config.JUTSU, max_gap=config.SEQUENCE_MAX_GAP)


def run_stream(stream, lm_labels, mode="live", jutsu=None):
    """evaluate.replay with a chosen controller: SignFusion + ActionController, the calls of Engine.process."""
    runs = ev.seal_schedule([t for t, _ in stream.video], delay=ev.YOLOX_DELAY)
    seal_runs = [(available, stream.video[k][1]) for k, available in runs]
    fusion, controller = SignFusion(), controller_for(mode, jutsu)
    out = {"signs": [], "confirmed": [], "fired": []}
    j, result = 0, None
    for i, now in enumerate(stream.times):
        while j < len(seal_runs) and seal_runs[j][0] <= now:
            result = seal_runs[j][1]
            j += 1
        fused = fusion.update(stream.probs[i], lm_labels, result, stream.hands[i], now, yolox_running=True)
        state = controller.update(fused.probs, now)
        out["signs"].append(fused.sign)
        if state.confirmed and not state.repeat:
            out["confirmed"].append((round(now, 3), state.confirmed))
        if state.jutsu:
            out["fired"].append((round(now, 3), state.jutsu))
    return out


# ---------------------------------------------------------------- shared setup

def setup(need_yolox=True):
    info, classifier = ev.model_status(config.GESTURE_MODEL_PATH)
    runner = ev.SealRunner() if need_yolox else None
    return info, classifier, runner


def save_part(name, data):
    PARTS.mkdir(parents=True, exist_ok=True)
    path = PARTS / f"{name}.json"
    path.write_text(json.dumps(data, indent=2, default=lambda o: o.tolist() if hasattr(o, "tolist") else str(o)),
                    encoding="utf-8")
    print(f"wrote {path}")


def seconds(values):
    a = np.asarray(values, float)
    if not len(a):
        return None
    return {"n": int(len(a)), "median": round(float(np.median(a)), 3), "p90": round(float(np.percentile(a, 90)), 3),
            "min": round(float(a.min()), 3), "max": round(float(a.max()), 3)}


def rule_of_three(events, minutes):
    """Events per hour, and the 95% upper bound when none happened (3 / exposure)."""
    hours = minutes / 60
    return {"events": events, "minutes": round(minutes, 2), "per_hour": round(events / hours, 2) if hours else None,
            "upper_95_per_hour_if_zero": round(3 / hours, 1) if hours and events == 0 else None}


# ---------------------------------------------------------------- part: negatives

def part_negatives(args):
    info, classifier, runner = setup()
    labels = list(classifier.labels)
    clips = negative_clips() + [c for c in split_clips() if c.status == "validation" and c.label == "idle"]
    rows, live_fired, practice_fired, minutes = [], [], defaultdict(list), 0.0
    for clip in clips:
        d = load_clip(clip, classifier, runner, args.cache)
        scored = d["times"] >= SKIP
        lm = [labels[int(np.argmax(p))] for p, s in zip(d["probs"], scored) if s and p is not None]
        yx = [ev.yolox_sign(d["results"][k].detections) for k, i in enumerate(d["v_idx"]) if scored[i]]
        stream = Stream()
        stream.add(d, 0.0, float(d["times"][-1]) + 1e-3, clip.label)
        live = run_stream(stream, labels, "live")
        fused = [s for s, keep in zip(live["signs"], scored) if keep]
        practice = {j: run_stream(stream, labels, "practice", j)["fired"] for j in JUTSU}
        dur = float(d["times"][-1] - d["times"][0])
        minutes += dur / 60
        live_fired += [(clip.id, t, j) for t, j in live["fired"]]
        for j, f in practice.items():
            practice_fired[j] += [(clip.id, t) for t, _ in f]
        rows.append({
            "id": clip.id, "what": clip.what, "status": clip.status, "duration_s": round(dur, 1),
            "landmarks": dict(Counter(lm)), "yolox": dict(Counter(yx)), "fused": dict(Counter(fused)),
            "confirmed": [s for _, s in live["confirmed"]], "live_fired": [j for _, j in live["fired"]],
            "practice_fired": {j: len(f) for j, f in practice.items()},
        })
        print(f"{clip.id} {clip.what}: lm {dict(Counter(lm))} | yolox {dict(Counter(yx))} | fused {dict(Counter(fused))}"
              f" | confirmed {[s for _, s in live['confirmed']]} | fired {live['fired']}")
    runner.close()
    save_part("negatives", {
        "about": "Hands that make NO sign of the app; the right answer for every frame is idle. Never-trained "
                 "clips (claw, OK sign, two open palms) + the 2 held-out idle recordings (validation set).",
        "model": {k: info.get(k) for k in ("path", "model_name", "created", "selection")},
        "clips": rows,
        "live": rule_of_three(len(live_fired), minutes) | {"details": live_fired},
        "practice": {j: rule_of_three(len(f), minutes) | {"details": f} for j, f in practice_fired.items()},
    })


# ---------------------------------------------------------------- part: leave-one-recording-out

def part_loro(args):
    import train as tr
    clips = split_clips()
    ids = {c.id for c in clips}
    sessions = tr.load_sessions(config.LANDMARKS_DIR, step=2, only=ids)   # train.py's sampling and labels
    by_id = {s["id"]: s for s in sessions}
    truth, pred, est, per = [], [], [], []
    for held in clips:
        others = [by_id[i] for i in ids if i != held.id and i in by_id]
        rng = np.random.default_rng(0)
        X, Xm, Xj, y, _, _ = tr.build(others, rng)
        model = tr.make_models()["random_forest"]
        model.fit(*tr.augmented(np.arange(len(y)), X, Xm, Xj, y))
        known = {config.GESTURES[i] for i in set(y)}
        with np.load(held.npz) as dd:
            times, img, wld, pres = dd["timestamps"], dd["image_lm"], dd["world_lm"], dd["present"]
            meta = json.loads(str(dd["meta"]))
        keep = [i for i in range(len(times)) if times[i] >= SKIP and pres[i].any()]
        feats = np.array([extract(img[i], wld[i], pres[i], float(meta.get("aspect", 16 / 9))) for i in keep])
        p = [config.GESTURES[int(c)] for c in model.predict(feats)]
        truth += [held.label] * len(p)
        pred += p
        est += [held.label in known] * len(p)
        per.append({"id": held.id, "label": held.label, "status": held.status, "frames": len(p),
                    "label_in_training": held.label in known, "accuracy": round(float(np.mean(np.array(p) == held.label)), 4),
                    "said": dict(Counter(p))})
        print(f"{held.id} {held.label:13s} seen={held.label in known} acc={per[-1]['accuracy']:.3f} said={dict(Counter(p))}")
    estimable = [r for r in per if r["label_in_training"]]
    t_est = [t for t, e in zip(truth, est) if e]
    p_est = [p for p, e in zip(pred, est) if e]
    m = ev.frame_metrics(t_est, p_est, config.GESTURES)
    rows = sorted(set(truth), key=ev._order)
    m["confusion_all"] = {"rows": rows, "cols": list(config.GESTURES),
                          "matrix": ev.confusion(truth, pred, rows, list(config.GESTURES)).tolist(),
                          "correct_col": {r: r for r in rows}}
    save_part("loro", {
        "about": "Leave-one-recording-out on the 19 split recordings (train + validation; there is no test set): "
                 "train.py's random forest (n_estimators 300, min_samples_leaf 2, balanced) on mirrored + jittered "
                 "copies, every 2nd frame, refitted without the held-out recording, scored on all its frames with a "
                 "hand after the first 0.5 s. A sign with ONE recording is absent from training when its recording "
                 "is held out: its frames cannot be right, so those rows show only what it is mistaken for and are "
                 "left out of the metrics.",
        "recordings": per, "metrics_estimable": m,
        "estimable_signs": sorted({r["label"] for r in estimable}, key=ev._order),
    })


# ---------------------------------------------------------------- part: sequences

def sign_clips(clips, sign, prefer_held_out):
    pool = [c for c in clips if c.label == sign]
    held = [c for c in pool if c.status == "validation"]
    return held if (prefer_held_out and held) else pool


def window(rng, d, length):
    start = rng.uniform(SKIP, max(SKIP, float(d["times"][-1]) - length - 0.05))
    return start, start + length


def perform(stream, rng, jutsu, clips, loaded, use_model, gap=(0.4, 1.2), hold=(1.6, 2.6), lead=1.5, tail=3.0):
    """One performance of a jutsu: idle lead-in, then hold each sign with a short idle gap between."""
    idle = sign_clips(clips, "idle", prefer_held_out=True)
    d = loaded[rng.choice(idle).id]
    stream.add(d, *window(rng, d, lead), "idle", use_model)
    starts = []
    for n, sign in enumerate(config.JUTSU[jutsu]["sequence"]):
        c = rng.choice(sign_clips(clips, sign, prefer_held_out=True))
        d = loaded[c.id]
        starts.append(stream.end)
        stream.add(d, *window(rng, d, rng.uniform(*hold)), sign, use_model)
        g = loaded[rng.choice(idle).id]
        stream.add(g, *window(rng, g, rng.uniform(*gap) if n < 3 else tail), "idle", use_model)
    return starts


def contamination(jutsu):
    """Which signs of a jutsu come from recordings the landmark model was trained on, and whether the
    app's landmark model decides them (clone_seal, rasengan_palm) or YOLOX does (the 7 seals)."""
    out = {}
    for s in config.JUTSU[jutsu]["sequence"]:
        if s in ("clone_seal", "rasengan_palm"):
            out[s] = ("landmark model; its only recording is a TRAIN recording -> optimistic" if s == "clone_seal" else
                      "landmark model; held-out VALIDATION recording (used to choose the model)")
        else:
            out[s] = "YOLOX (never trained on our recordings; thresholds tuned while they existed)"
    return out


def part_sequences(args):
    info, classifier, runner = setup()
    labels = list(classifier.labels)
    clips = split_clips()
    loaded = {c.id: load_clip(c, classifier, runner, args.cache) for c in clips}
    runner.close()
    rng = random.Random(RNG_SEED)
    trials = {}
    for jutsu in JUTSU:
        for mode in ("live", "practice"):
            for use_model in ((True, False) if all(s not in ("clone_seal", "rasengan_palm")
                                                   for s in config.JUTSU[jutsu]["sequence"]) else (True,)):
                key = f"{jutsu}|{mode}|{'model' if use_model else 'yolox_path'}"
                outcomes, lat_start, lat_end, wrong, confirmed_ok = Counter(), [], [], Counter(), 0
                for _ in range(args.trials):
                    st = Stream()
                    starts = perform(st, rng, jutsu, clips, loaded, use_model)
                    res = run_stream(st, labels if use_model else None, mode, jutsu)
                    names = [j for _, j in res["fired"]]
                    verdict = ev.take_outcome("correct", jutsu, res["fired"])
                    outcomes[verdict] += 1
                    wrong.update(n for n in names if n != jutsu)
                    hit = next((t for t, j in res["fired"] if j == jutsu), None)
                    if hit is not None:
                        last_start = starts[-1]
                        last_end = next(e for s, e, lab in st.marks if s == round(last_start, 3))
                        lat_start.append(hit - last_start)
                        lat_end.append(hit - last_end)
                    seq = config.JUTSU[jutsu]["sequence"]
                    confirmed_ok += [s for _, s in res["confirmed"]][:4] == seq
                trials[key] = {
                    "jutsu": jutsu, "mode": mode, "landmark_model": use_model, "trials": args.trials,
                    "outcomes": dict(outcomes), "activation_rate": round(outcomes["success"] / args.trials, 4),
                    "wrong_jutsu_fired": dict(wrong),
                    "latency_from_last_sign_start_s": seconds(lat_start),
                    "latency_from_last_sign_end_s": seconds(lat_end),
                    "first_four_confirmed_in_order": confirmed_ok,
                    "signs": contamination(jutsu),
                }
                print(f"{key}: {dict(outcomes)} wrong={dict(wrong)} latency(start) median "
                      f"{np.median(lat_start) if lat_start else None}")

    # all four jutsu back to back, in a random order, with 2-4 s of idle between performances (Live)
    mixed = {"performances": 0, "expected_fired": 0, "missed": 0, "wrong_or_extra": Counter(), "streams": args.mixed}
    for _ in range(args.mixed):
        order = JUTSU[:]
        rng.shuffle(order)
        st, expect = Stream(), []
        for j in order:
            perform(st, rng, j, clips, loaded, True, tail=rng.uniform(2.0, 4.0))
            expect.append(j)
        res = run_stream(st, labels, "live")
        names = [j for _, j in res["fired"]]
        mixed["performances"] += len(expect)
        left = list(names)
        for j in expect:
            if j in left:
                left.remove(j)
                mixed["expected_fired"] += 1
            else:
                mixed["missed"] += 1
        mixed["wrong_or_extra"].update(left)
    mixed["wrong_or_extra"] = dict(mixed["wrong_or_extra"])

    # random sign streams: a user making signs in no particular order (Live: every jutsu; Practice: one)
    def random_stream(minutes):
        st = Stream()
        idle = sign_clips(clips, "idle", prefer_held_out=True)
        while st.end < minutes * 60:
            sign = rng.choice(SIGNS)
            c = rng.choice(sign_clips(clips, sign, prefer_held_out=True))
            d = loaded[c.id]
            st.add(d, *window(rng, d, rng.uniform(1.2, 2.6)), sign)
            g = loaded[rng.choice(idle).id]
            st.add(g, *window(rng, g, rng.uniform(0.2, 1.5)), "idle")
        return st

    streams = {"minutes_per_stream": args.random_minutes, "live": {}, "practice": {}}
    st = random_stream(args.random_minutes)
    res = run_stream(st, labels, "live")
    streams["live"] = rule_of_three(len(res["fired"]), st.end / 60) | {"by_jutsu": dict(Counter(j for _, j in res["fired"])),
                                                                         "confirmed_signs": len(res["confirmed"])}
    for j in JUTSU:
        r = run_stream(st, labels, "practice", j)
        streams["practice"][j] = rule_of_three(len(r["fired"]), st.end / 60)
    save_part("sequences", {
        "about": "No guided sequence takes exist (data/sequences is missing), so performances are SPLICED from the "
                 "single-sign recordings: an idle lead-in, each sign held 1.6-2.6 s, 0.4-1.2 s of idle between signs "
                 "(real transitions between seals are not in the data), 3 s of idle after. Windows are random; the "
                 "held-out validation recording is used where a sign has one (idle, rasengan_palm). Everything else "
                 "comes from TRAIN recordings, see 'signs' per jutsu.",
        "trials": trials, "mixed": mixed, "random_streams": streams,
        "settings": {"SEQUENCE_MAX_GAP": config.SEQUENCE_MAX_GAP, "COOLDOWN_SECONDS": config.COOLDOWN_SECONDS,
                     "HOLD_SECONDS": config.HOLD_SECONDS, "SEAL_CONFIRM": config.SEAL_CONFIRM,
                     "SEAL_MIN_SCORE": config.SEAL_MIN_SCORE, "LANDMARK_MIN_PROB": config.LANDMARK_MIN_PROB,
                     "seed": RNG_SEED},
    })


# ---------------------------------------------------------------- part: monte carlo (matcher only)

def part_montecarlo(args):
    rng = random.Random(RNG_SEED)
    hours = args.hours

    def simulate(mode, jutsu=None, pool=SIGNS):
        m = SequenceMatcher(config.JUTSU if mode == "live" else {jutsu: config.JUTSU[jutsu]},
                            max_gap=config.SEQUENCE_MAX_GAP if mode == "live" else None)
        t, fired, last = 0.0, Counter(), -1e9
        while t < hours * 3600:
            t += rng.uniform(1.8, 3.6)                  # hold 1.2-2.6 s + 0.2-1.5 s to change hands (as above)
            got = m.push(rng.choice(pool), t)
            if got is not None and t - last >= config.COOLDOWN_SECONDS:
                fired[got] += 1
                last = t
        return {"per_hour": {j: round(n / hours, 2) for j, n in fired.items()}, "total_per_hour": round(sum(fired.values()) / hours, 2)}

    def simulate_previous_rule():
        """For comparison only: the matching rule the app used until 2026-10-31 (history of confirmed signs; a
        jutsu fires when its whole sequence ends the history; a wrong sign breaks the chain; a pause longer
        than max_gap clears it; the same sign again only refreshes it), re-stated here from that code."""
        seqs = {j: s["sequence"] for j, s in config.JUTSU.items()}
        longest = max(len(s) for s in seqs.values())
        history, t, fired, last = [], 0.0, Counter(), -1e9
        while t < hours * 3600:
            t += rng.uniform(1.8, 3.6)
            g = rng.choice(SIGNS)
            if history and t - history[-1][1] > config.SEQUENCE_MAX_GAP:
                history.clear()
            elif history and history[-1][0] == g:
                history[-1] = (g, t)
                continue
            history = (history + [(g, t)])[-longest:]
            recent = [x for x, _ in history]
            best = None
            for j, s in seqs.items():
                if recent[-len(s):] == s and (best is None or len(s) > len(seqs[best])):
                    best = j
            if best is not None:
                history.clear()
                if t - last >= config.COOLDOWN_SECONDS:
                    fired[best] += 1
                    last = t
        return {"per_hour": {j: round(n / hours, 2) for j, n in fired.items()}, "total_per_hour": round(sum(fired.values()) / hours, 2)}

    out = {"about": "SequenceMatcher alone (the app's class, current rules: per-jutsu counters, a wrong sign keeps the "
                    "progress, 7 s limit in Live, none in Practice) fed one uniformly random sign every 1.8-3.6 s, "
                    f"for {hours} simulated hours. It shows how often signs made in NO particular order complete a "
                    "jutsu by chance. Recognition is assumed perfect here; the spliced random streams of the "
                    "'sequences' part include the real recognisers.",
           "hours": hours, "live": simulate("live"),
           "practice": {j: simulate("practice", j) for j in JUTSU},
           "live_previous_rule_for_comparison": simulate_previous_rule()}
    print(json.dumps(out, indent=1)[:1500])
    save_part("montecarlo", out)


# ---------------------------------------------------------------- part: fps (the real server)

def y4m_frames(path):
    """Frames (BGR) of a .y4m camera fixture (frontend/e2e/make_fixtures.py) + its frame rate."""
    import cv2
    with open(path, "rb") as f:
        header = f.readline().decode().split()
        w = int(next(t[1:] for t in header if t.startswith("W")))
        h = int(next(t[1:] for t in header if t.startswith("H")))
        num, den = (int(x) for x in next(t[1:] for t in header if t.startswith("F")).split(":"))
        size = w * h * 3 // 2
        frames = []
        while f.readline():
            data = f.read(size)
            if len(data) < size:
                break
            frames.append(cv2.cvtColor(np.frombuffer(data, np.uint8).reshape(h * 3 // 2, w), cv2.COLOR_YUV2BGR_I420))
    return frames, num / den


async def stream_fixture(url, frames, fps, loops):
    """Like a browser: the camera runs on the wall clock and the newest frame is sent when the answer to the
    previous one arrived (one frame in flight), JPEG quality 80. Returns one record per answered frame."""
    import cv2
    import websockets
    rows = []
    async with websockets.connect(url, max_size=None) as ws:
        hello = json.loads(await ws.recv())
        t0, last, n = time.perf_counter(), -1, len(frames)
        while True:
            i = int((time.perf_counter() - t0) * fps)
            if i >= n * loops:
                break
            if i == last:
                await asyncio.sleep(0.003)
                continue
            last = i
            ok, jpg = cv2.imencode(".jpg", frames[i % n], [cv2.IMWRITE_JPEG_QUALITY, 80])
            head = json.dumps({"t": i}).encode()
            sent = time.perf_counter()
            await ws.send(struct.pack(">I", len(head)) + head + jpg.tobytes())
            while True:
                msg = await ws.recv()
                if isinstance(msg, bytes):
                    break
            k = struct.unpack(">I", msg[:4])[0]
            st = json.loads(msg[4:4 + k])
            rows.append({"t": time.perf_counter() - t0, "rtt_ms": (time.perf_counter() - sent) * 1000,
                         "timings": st.get("timings", {}), "effect": (st.get("effect") or {}).get("name"),
                         "server_fps": st.get("fps"), "w": st.get("width"), "h": st.get("height")})
    return hello, rows


def stats(values):
    a = np.asarray([v for v in values if v is not None], float)
    if not len(a):
        return None
    return {"n": int(len(a)), "median": round(float(np.median(a)), 1), "p90": round(float(np.percentile(a, 90)), 1),
            "p99": round(float(np.percentile(a, 99)), 1), "mean": round(float(a.mean()), 1)}


def part_fps(args):
    import os
    fixtures = Path(args.fixtures)
    plan = [("idle", 1), ("fire_style", 2), ("chidori", 2), ("shadow_clone", 2), ("rasengan", 2)]
    by_condition = defaultdict(list)
    runs = []
    for name, loops in plan:
        frames, fps = y4m_frames(fixtures / f"{name}.y4m")
        hello, rows = asyncio.run(stream_fixture(args.url, frames, fps, loops))
        dur = rows[-1]["t"] - rows[0]["t"] if len(rows) > 1 else 0
        runs.append({"fixture": name, "frames_answered": len(rows), "seconds": round(dur, 1),
                     "answered_fps": round((len(rows) - 1) / dur, 2) if dur else None,
                     "effects_seen": dict(Counter(r["effect"] for r in rows if r["effect"]))})
        for r in rows:
            by_condition[r["effect"] or "no effect"].append(r)
        print(runs[-1])
    stages = ("decode", "hands", "model", "yolox", "seg", "fx", "encode", "total")
    table = {}
    for cond, rows in by_condition.items():
        table[cond] = {"frames": len(rows), "rtt_ms": stats(r["rtt_ms"] for r in rows),
                       "server_fps": stats(r["server_fps"] for r in rows),
                       "capacity_fps_median": round(1000 / np.median([r["timings"].get("total", np.nan) for r in rows]), 1)
                       if rows else None,
                       "stages_ms": {s: stats(r["timings"].get(s) for r in rows) for s in stages}}
    mt = {p.name: time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(p.stat().st_mtime))
          for p in sorted((ROOT / "shinobi").rglob("*.py"))}
    save_part("fps", {
        "about": "The real server (python -m shinobi.server, its own port) over the WebSocket, fed the camera fixtures "
                 "(1280x720, 15 fps, the user's recordings spliced into sign sequences, looping) like a browser: one "
                 "frame in flight, JPEG 80. Stage timings are the server's own FrameState.timings (ms). 'no effect' = "
                 "frames without a running effect. The machine was shared with other agents' work while measuring.",
        "url": args.url, "runs": runs, "by_condition": table, "cpu_count": os.cpu_count(),
        "code_mtimes": mt, "measured_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "server_info": hello.get("info") if isinstance(hello, dict) else None,
    })


# ---------------------------------------------------------------- part: figures

def part_figures(args):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    ink, muted, surface = "#0b0b0b", "#52514e", "#fcfcfb"
    loro = json.loads((PARTS / "loro.json").read_text(encoding="utf-8"))
    conf = loro["metrics_estimable"]["confusion_all"]
    ev.save_confusion_png(conf, "Landmark classifier, leave-one-recording-out. Only idle, monkey and palm had "
                                "another recording to learn from; the other rows cannot be right by construction",
                          OUT / "confusion_landmarks_loro.png")
    if (PARTS / "fps.json").exists():
        fps = json.loads((PARTS / "fps.json").read_text(encoding="utf-8"))
        conds = [c for c in ("no effect", "fire", "chidori", "rasengan", "shadow_clone") if c in fps["by_condition"]]
        # stages on the frame's own path. YOLOX runs in its own thread and segmentation on a worker thread
        # at the same time as hand tracking (engine.process), so both are shown apart, not stacked
        stages = ("decode", "hands", "model", "fx", "encode")
        colors = ["#9aa7b8", "#3987e5", "#86b6ef", "#e5643a", "#6f6c66"]

        def per_frame(cond, stage):
            """Mean ms per frame of a stage, counting 0 on frames where it did not run (segmentation, effects)."""
            c = fps["by_condition"][cond]
            s = c["stages_ms"].get(stage)
            return (s["mean"] * s["n"] / c["frames"]) if s else 0.0

        fig, ax = plt.subplots(figsize=(8.4, 3.6))
        fig.patch.set_facecolor(surface)
        left = np.zeros(len(conds))
        for s, col in zip(stages, colors):
            vals = np.array([per_frame(c, s) for c in conds])
            ax.barh(conds, vals, left=left, color=col, label=s, height=0.6, edgecolor=surface, linewidth=1)
            left += vals
        for i, c in enumerate(conds):
            tot = (fps["by_condition"][c]["stages_ms"].get("total") or {}).get("mean")
            yx = (fps["by_condition"][c]["stages_ms"].get("yolox") or {}).get("median")
            sg = fps["by_condition"][c]["stages_ms"].get("seg")
            sg = sg["median"] if sg and sg["n"] >= 10 else None
            note = (f"  (YOLOX thread {yx:.0f} ms" if yx else "  (") + (f", segmentation thread {sg:.0f} ms)" if sg else ")")
            ax.text(left[i] + 3, i, f"total {tot:.0f} ms" + note, va="center", fontsize=8, color=ink)
        ax.set_xlim(0, max(left) * 1.9)
        ax.invert_yaxis()
        ax.set_xlabel("mean ms per frame on the server (stacked stages of the frame's own path)", fontsize=8.5,
                      color=muted)
        ax.legend(ncol=7, fontsize=7.5, frameon=False, loc="upper center", bbox_to_anchor=(0.5, 1.16))
        for sp in ("top", "right"):
            ax.spines[sp].set_visible(False)
        ax.tick_params(labelsize=8)
        fig.tight_layout()
        fig.savefig(OUT / "fps_stages.png", dpi=130, facecolor=surface)
        plt.close(fig)
    print("figures written")


def part_summary(args):
    """reports/ai_evaluation/metrics.json: every number of the report in one file (the evaluate.py runs are
    referenced and their per-sign tables copied; the full per-recording details stay in their metrics.json)."""
    def latest(folder):
        runs = sorted((OUT / folder).glob("*/metrics.json"))
        return (runs[-1], json.loads(runs[-1].read_text(encoding="utf-8"))) if runs else (None, None)

    def per_sign(m):
        keep = ("precision", "recall", "f1", "support", "predicted")
        return {"frames": m.get("frames"), "accuracy": m.get("accuracy"), "macro_f1": m.get("macro_f1"),
                "balanced_accuracy": m.get("balanced_accuracy"),
                "per_class": {c: {k: v[k] for k in keep} for c, v in m["per_class"].items() if v["support"] or v["predicted"]},
                "confusion": m.get("confusion"), "sessions": m.get("sessions"), "latency_ms": m.get("latency_ms")}

    path_a, run_a = latest("evaluate_py")
    path_b, run_b = latest("evaluate_py_yolox_path")
    frame = {}
    for tag, run in (("run_A_installed_model", run_a), ("run_B_yolox_path_no_landmark_model", run_b)):
        if run:
            frame[tag] = {s: {r: per_sign(m) for r, m in recs.items() if m.get("frames")}
                          for s, recs in run["frame_level"].items()}
    parts = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(PARTS.glob("*.json"))}
    out = {
        "created": time.strftime("%Y-%m-%d %H:%M:%S"),
        "test_set": "none: data/splits.json has 16 train, 3 validation, 0 test recordings",
        "evaluate_py_runs": {"A": str(path_a.relative_to(ROOT)) if path_a else None,
                             "B": str(path_b.relative_to(ROOT)) if path_b else None},
        "frame_level": frame,
        "per_recording_confirmations": {
            tag: [{"id": r["id"], "set": r["set"], "sign": r["group"], **{k: (r.get("fused") or {}).get(k) for k in
                   ("accuracy", "first_confirmed_s", "wrong_confirmations", "jutsu_fired")}}
                  for r in run["recordings"] if (r.get("fused") or {}) and "skipped" not in r["fused"]]
            for tag, run in (("A", run_a), ("B", run_b)) if run},
        **parts,
    }
    (OUT / "metrics.json").write_text(json.dumps(out, indent=2, default=str), encoding="utf-8")
    print(f"wrote {OUT / 'metrics.json'}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("part", choices=["negatives", "loro", "sequences", "montecarlo", "fps", "figures", "summary"])
    p.add_argument("--cache", default=None, help="folder for the YOLOX results of every clip (outside the repository)")
    p.add_argument("--trials", type=int, default=40, help="sequences: spliced performances per jutsu and mode")
    p.add_argument("--mixed", type=int, default=25, help="sequences: streams with all four jutsu back to back")
    p.add_argument("--random-minutes", type=float, default=20.0, help="sequences: length of the random sign stream")
    p.add_argument("--hours", type=float, default=200.0, help="montecarlo: simulated hours")
    p.add_argument("--url", default="ws://127.0.0.1:8003/ws", help="fps: the server's WebSocket")
    p.add_argument("--fixtures", default=None, help="fps: folder with idle/fire_style/chidori/shadow_clone/rasengan.y4m")
    args = p.parse_args()
    if args.part in ("negatives", "sequences"):
        if not args.cache:
            raise SystemExit("--cache is required (a folder outside the repository)")
        cache = Path(args.cache).resolve()
        if ROOT in cache.parents or cache == ROOT:
            raise SystemExit("refusing to cache clips of the user inside the repository")
        cache.mkdir(parents=True, exist_ok=True)
        args.cache = cache
    {"negatives": part_negatives, "loro": part_loro, "sequences": part_sequences, "montecarlo": part_montecarlo,
     "fps": part_fps, "figures": part_figures, "summary": part_summary}[args.part](args)


if __name__ == "__main__":
    main()

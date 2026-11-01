"""Condition-grouped cross-validation of the landmark model on the TRAIN set (never test, never validation).

Run:  python tools/grouped_cv.py                  (random forest + MLP from train.py, + the installed model)
      python tools/grouped_cv.py --out reports    (report folder: <out>/<time>_grouped_cv/)

A group is a whole recording condition, so a fold never sees the condition it is scored on:
  G1 oct30   every TRAIN recording made on 2026-10-30 (old setup: night seals, day palms)
  G2 A       2026-11-01, camera at face level         (meta "camera" = A)
  G3 B       2026-11-01, camera low, looking up       (meta "camera" = B)
  G4 A-far   2026-11-01, face level, sitting back     (meta "camera" = A-far)
Each fold trains on 3 groups and is scored on the 4th. The frames of one recording always stay
together. Training uses train.py itself: the same frames (every --step-th frame with a hand), the
same features, the same two models (make_models) and the same augmentation (mirror + jitter, on the
training part of the fold only). Scoring uses the original frames only.

Also reported, for the same held-out frames:
  * the INSTALLED model (models/gesture_model.joblib) on G2-G4, the groups it never saw: a baseline;
  * for clone_seal / rasengan_palm, the share of frames the app's landmark path would accept with
    today's rules (p >= LANDMARK_MIN_PROB, margin >= LANDMARK_MIN_MARGIN, open-palm gate), and how
    often other gestures (idle above all) would be accepted as one of them (false triggers).
Nothing is trained for real and nothing is installed: models live only in memory.
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import confusion_matrix, f1_score, precision_recall_fscore_support

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import evaluate as E  # noqa: E402
import splits as S  # noqa: E402
import train as T  # noqa: E402
from shinobi import config  # noqa: E402
from shinobi.fusion import open_palm  # noqa: E402

GROUPS = ["G1 oct30", "G2 A", "G3 B", "G4 A-far"]
CAMERA_GROUP = {"A": "G2 A", "B": "G3 B", "A-far": "G4 A-far"}
NAMES = list(config.GESTURES)


def group_of(meta, date):
    if date == "2026-10-30":
        return "G1 oct30"
    if date == "2026-11-01" and meta.get("camera") in CAMERA_GROUP:
        return CAMERA_GROUP[meta["camera"]]
    raise SystemExit(f"recording {meta.get('session')} ({date}) has no condition group: nothing was run")


def per_class(y, pred, labels):
    p, r, f, n = precision_recall_fscore_support(y, pred, labels=labels, zero_division=0)
    return {NAMES[c]: {"precision": round(float(p[i]), 3), "recall": round(float(r[i]), 3), "f1": round(float(f[i]), 3),
                       "frames": int(n[i])} for i, c in enumerate(labels)}


def landmark_gate(probs, labels, hands):
    """What the app's landmark path would output for one frame with today's rules: a sign or None."""
    i = int(np.argmax(probs))
    sign, p = labels[i], float(probs[i])
    if sign not in config.LANDMARK_SIGNS or p < config.LANDMARK_MIN_PROB:
        return None
    top2 = np.sort(probs)[-2:]
    if float(top2[1] - top2[0]) < config.LANDMARK_MIN_MARGIN:
        return None
    if sign == "rasengan_palm" and not open_palm(hands, config.PALM_MIN_THUMB_GAP):
        return None
    return sign


def score(y, pred, probs, labels_of_model, hands, groups, rec_ids, present):
    """Everything reported for one recogniser's held-out predictions."""
    out = {"macro_f1": round(float(f1_score(y, pred, labels=present, average="macro", zero_division=0)), 3),
           "accuracy": round(float(np.mean(y == pred)), 3), "per_class": per_class(y, pred, present),
           "confusion": confusion_matrix(y, pred, labels=present).tolist(), "per_group": {}, "per_recording": {}}
    for g in GROUPS:
        m = groups == g
        if not m.any():
            continue
        labs = sorted(set(y[m]))
        out["per_group"][g] = {"macro_f1": round(float(f1_score(y[m], pred[m], labels=labs, average="macro", zero_division=0)), 3),
                               "frames": int(m.sum()),
                               "recall": {NAMES[c]: round(float(np.mean(pred[m][y[m] == c] == c)), 3) for c in labs}}
    for rid in sorted(set(rec_ids)):
        m = rec_ids == rid
        out["per_recording"][rid] = {"label": NAMES[int(y[m][0])], "group": str(groups[m][0]),
                                     "top_class_correct": round(float(np.mean(pred[m] == y[m])), 3)}
    gate = [landmark_gate(pb, labels_of_model, h) for pb, h in zip(probs, hands)]
    out["app_landmark_path"] = {}
    for sign in config.LANDMARK_SIGNS:
        c = NAMES.index(sign)
        m = y == c
        out["app_landmark_path"][sign] = {
            "accepted_share_of_its_frames": round(float(np.mean([gate[i] == sign for i in np.flatnonzero(m)])), 3) if m.any() else None,
            "per_group": {g: round(float(np.mean([gate[i] == sign for i in np.flatnonzero(m & (groups == g))])), 3)
                          for g in GROUPS if (m & (groups == g)).any()}}
    idle = NAMES.index("idle")
    others = np.flatnonzero(~np.isin(y, [NAMES.index(s) for s in config.LANDMARK_SIGNS]))
    out["app_false_triggers"] = {
        "idle_frames_accepted_as_landmark_sign": round(float(np.mean([gate[i] is not None for i in np.flatnonzero(y == idle)])), 4),
        "seal_frames_accepted_as_landmark_sign": round(float(np.mean([gate[i] is not None for i in others if y[i] != idle])), 4),
        "by_sign": {s: int(sum(1 for i in others if gate[i] == s)) for s in config.LANDMARK_SIGNS}}
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--step", type=int, default=2, help="every n-th frame with a hand (train.py's default)")
    parser.add_argument("--out", default=str(ROOT / "reports"))
    parser.add_argument("--model", default=str(config.GESTURE_MODEL_PATH), help="installed model for the baseline")
    args = parser.parse_args(argv)

    splits = S.load()
    train_ids = {rid for rid, e in splits["sessions"].items() if e["set"] == "train"}
    recs = {r.id: r for r in S.scan(config.DATA_DIR)[0]}
    sessions = T.load_sessions(config.LANDMARKS_DIR, args.step, only=train_ids)
    if {s["id"] for s in sessions} != train_ids:
        raise SystemExit("not every TRAIN recording could be loaded: nothing was run")
    rng = np.random.default_rng(0)                                   # like train.py
    X, X_mirror, X_jitter, y, _, _ = T.build(sessions, rng)
    rec_ids = np.array([s["id"] for s in sessions for _ in range(len(s["present"]))])
    groups = np.array([group_of(s, recs[s["id"]].date) for s in sessions for _ in range(len(s["present"]))])
    hands = [E.hands_from_arrays(img, wld, pres, 1280, 720) for s in sessions
             for img, wld, pres in zip(s["image_lm"], s["world_lm"], s["present"])]
    present = sorted(set(y))
    print(f"TRAIN: {len(sessions)} recordings, {len(y)} frames (every {args.step}th with a hand)")
    for g in GROUPS:
        m = groups == g
        print(f"  {g:9s} {len(set(rec_ids[m])):2d} recordings {m.sum():5d} frames  "
              + ", ".join(f"{NAMES[c]} {len(set(rec_ids[m & (y == c)]))}" for c in present if (m & (y == c)).any()))

    report = {"created": datetime.now().isoformat(timespec="seconds"), "step": args.step, "groups": {},
              "rules": {"LANDMARK_MIN_PROB": config.LANDMARK_MIN_PROB, "LANDMARK_MIN_MARGIN": config.LANDMARK_MIN_MARGIN,
                        "PALM_MIN_THUMB_GAP": config.PALM_MIN_THUMB_GAP},
              "train_recordings": sorted(train_ids), "models": {}}
    for g in GROUPS:
        m = groups == g
        report["groups"][g] = {NAMES[c]: sorted(set(rec_ids[m & (y == c)])) for c in present if (m & (y == c)).any()}

    preds = {}
    for name in T.make_models():
        pred = np.zeros(len(y), int)
        probs = np.zeros((len(y), len(present)))
        for g in GROUPS:
            te, tr = np.flatnonzero(groups == g), np.flatnonzero(groups != g)
            model = T.make_models()[name]
            model.fit(*T.augmented(tr, X, X_mirror, X_jitter, y))
            cls = list(model.classes_)
            pb = model.predict_proba(X[te])
            full = np.zeros((len(te), len(present)))
            for j, c in enumerate(cls):
                full[:, present.index(c)] = pb[:, j]
            probs[te] = full
            pred[te] = np.array(present)[full.argmax(1)]
            print(f"  {name}: fold {g} done ({len(tr)} train frames x3 augmented, {len(te)} held out)", flush=True)
        preds[name] = pred
        report["models"][name] = score(y, pred, probs, [NAMES[c] for c in present], hands, groups, rec_ids, present)
        print(f"{name}: pooled macro-F1 {report['models'][name]['macro_f1']}", flush=True)

    # baseline: the installed model, on the groups it never saw (G2-G4)
    bundle = joblib.load(args.model)
    unseen = np.flatnonzero(groups != "G1 oct30")
    if set(bundle.get("train_sessions", [])) & set(rec_ids[unseen]):
        raise SystemExit("the installed model was trained on a Nov-1 recording: no fair baseline")
    model = bundle["model"]
    pb = model.predict_proba(X[unseen])
    full = np.zeros((len(unseen), len(present)))
    for j, c in enumerate(model.classes_):
        full[:, present.index(int(c))] = pb[:, j]
    base_pred = np.array(present)[full.argmax(1)]
    report["installed_model_on_unseen_groups"] = score(y[unseen], base_pred, full, [NAMES[c] for c in present],
                                                       [hands[i] for i in unseen], groups[unseen], rec_ids[unseen], present)
    report["installed_model_on_unseen_groups"]["model"] = {k: str(bundle.get(k)) for k in ("model_name", "created", "selection")}
    for name, pred in preds.items():                               # the same G2-G4 frames, like for like
        report["models"][name]["on_G2_G4"] = {
            "macro_f1": round(float(f1_score(y[unseen], pred[unseen], labels=present, average="macro", zero_division=0)), 3),
            "per_class": per_class(y[unseen], pred[unseen], present)}
    out_dir = Path(args.out) / f"{datetime.now():%Y-%m-%d_%H%M%S}_grouped_cv"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "metrics.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    for name, res in list(report["models"].items()) + [("installed_model_G2-G4", report["installed_model_on_unseen_groups"])]:
        T.save_confusion(np.array(res["confusion"]), [NAMES[c] for c in present],
                         f"{name}: held-out groups (macro-F1 {res['macro_f1']})", out_dir / f"confusion_{name}.png")
    print("written", out_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())

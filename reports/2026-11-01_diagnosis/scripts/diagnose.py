"""DIAGNOSTIC ONLY: reads recordings, the installed model and YOLOX; writes nothing in the project.

A. landmark-path rules (clone_seal / rasengan_palm), per set: argmax | p>=0.6 (before this session) |
   p>=0.6 + margin>=0.30 | + open-palm gate (current) | p>=0.6 + gate (no margin).
   Train / validation = the ablation. Test = diagnosis of WHY (reported apart, used for no choice).
B. probability / margin / gate distributions on the clone_seal and rasengan_palm frames.
C. YOLOX on ram / snake / tiger / dog (+ monkey/boar/horse as reference): Oct-30 vs Nov-1 recordings
   (YOLOX never trained on either): correct sign found? its score? what else?
D. recording quality: hands, both hands, hand size (distance), position, per recording.
"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(r"C:\Users\user\Desktop\SHINOBI-AI")
sys.path.insert(0, str(ROOT))
import evaluate as E  # noqa: E402
import splits as S  # noqa: E402
from shinobi import config  # noqa: E402
from shinobi.classifier import GestureClassifier  # noqa: E402
from shinobi.fusion import open_palm  # noqa: E402
from shinobi.seal_detector import SealDetector  # noqa: E402

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
recs, _, _ = S.scan(config.DATA_DIR)
sets = S.set_of(S.load())
recs = [r for r in recs if r.kind == "single" and r.id in sets]
clf = GestureClassifier(config.MODELS_DIR / "gesture_model.joblib") if hasattr(config, "MODELS_DIR") else GestureClassifier()
labels = list(clf.labels)
LM = {"clone_seal", "rasengan_palm"}
MIN_P, MARGIN, GAP = config.LANDMARK_MIN_PROB, config.LANDMARK_MIN_MARGIN, config.PALM_MIN_THUMB_GAP
CONFIGS = ["argmax", "p>=0.6 (before)", "p>=0.6+margin", "current (p+margin+gate)", "p>=0.6+gate (no margin)"]


def landmark_out(probs, hands):
    """The landmark-path decision of each config: clone_seal / rasengan_palm / '-' (no landmark sign)."""
    i = int(np.argmax(probs))
    sign, p = labels[i], float(probs[i])
    top2 = np.sort(probs)[-2:]
    margin = float(top2[1] - top2[0])
    gate = open_palm(hands, GAP) if sign == "rasengan_palm" else True
    if sign not in LM:
        return {c: "-" for c in CONFIGS} | {"argmax": sign}, sign, p, margin, gate
    ok_p, ok_m = p >= MIN_P, margin >= MARGIN
    return {
        "argmax": sign,
        "p>=0.6 (before)": sign if ok_p else "-",
        "p>=0.6+margin": sign if ok_p and ok_m else "-",
        "current (p+margin+gate)": sign if ok_p and ok_m and gate else "-",
        "p>=0.6+gate (no margin)": sign if ok_p and gate else "-",
    }, sign, p, margin, gate


rows = []                                  # per frame
quality = []
for r in recs:
    d = E.load_recording(config.DATA_DIR, r)
    aspect = float(d["meta"].get("aspect", 16 / 9))
    probs, _ = E.landmark_probs(clf, d["image_lm"], d["world_lm"], d["present"], aspect)
    pres = d["present"].reshape(len(d["present"]), -1)
    two = pres.sum(1) >= 2
    sizes, centers = [], []
    for img, wld, pr, pb in zip(d["image_lm"], d["world_lm"], d["present"], probs):
        if pb is None:
            continue
        hands = E.hands_from_arrays(img, wld, pr, 1280, 720)
        outs, sign, p, margin, gate = landmark_out(pb, hands)
        rows.append({"set": sets[r.id], "rec": r.id, "label": r.group, "argmax": sign, "p": p,
                     "margin": margin, "gate": gate, **{f"cfg:{c}": v for c, v in outs.items()},
                     "p_true": float(pb[labels.index(r.group)]) if r.group in labels else None})
        pts = np.concatenate([img[s, :, :2] for s in range(len(pr)) if pr[s]])
        sizes.append(float(max(np.ptp(pts[:, 0]) * aspect, np.ptp(pts[:, 1]))))   # in frame heights
        centers.append(pts.mean(0))
    c = np.array(centers) if centers else np.zeros((1, 2))
    quality.append({"set": sets[r.id], "rec": r.id, "label": r.group, "date": r.date, "frames": len(pres),
                    "hands": float(pres.any(1).mean()), "both_hands": float(two.mean()),
                    "hand_extent_median": float(np.median(sizes)) if sizes else None,
                    "center_x": float(np.median(c[:, 0])), "center_y": float(np.median(c[:, 1]))})

# ---------------------------------------------------------------- A + B
report = {"A": {}, "B": {}, "C": {}, "D": quality, "train_frames": {}}
for st in ("train", "validation", "test"):
    fr = [x for x in rows if x["set"] == st]
    out = {}
    for lab in sorted({x["label"] for x in fr}):
        lf = [x for x in fr if x["label"] == lab]
        out[lab] = {"frames": len(lf)}
        for c in CONFIGS:
            said = Counter(x[f"cfg:{c}"] for x in lf)
            if c == "argmax":
                out[lab][c] = round(said.get(lab, 0) / len(lf), 3)
            else:   # share of this label's frames output as clone_seal / rasengan_palm by the landmark path
                out[lab][c] = {k: round(v / len(lf), 3) for k, v in said.items() if k in LM}
    report["A"][st] = out
    for lab in ("clone_seal", "rasengan_palm"):
        lf = [x for x in fr if x["label"] == lab]
        if not lf:
            continue
        top = [x for x in lf if x["argmax"] == lab]
        pt = np.array([x["p_true"] for x in lf])
        report["B"][f"{st}/{lab}"] = {
            "frames": len(lf), "argmax_is_true": round(len(top) / len(lf), 3),
            "p_true_median": round(float(np.median(pt)), 3), "p_true_p10": round(float(np.percentile(pt, 10)), 3),
            "of_argmax_frames": {
                "p>=0.6": round(np.mean([x["p"] >= MIN_P for x in top]), 3) if top else None,
                "margin>=0.30": round(np.mean([x["margin"] >= MARGIN for x in top]), 3) if top else None,
                "p>=0.6 and margin>=0.30": round(np.mean([x["p"] >= MIN_P and x["margin"] >= MARGIN for x in top]), 3) if top else None,
                "gate (palm only)": round(np.mean([x["gate"] for x in top]), 3) if top else None,
                "p_median": round(float(np.median([x["p"] for x in top])), 3) if top else None,
                "margin_median": round(float(np.median([x["margin"] for x in top])), 3) if top else None,
            },
            "argmax_when_wrong": dict(Counter(x["argmax"] for x in lf if x["argmax"] != lab).most_common(4)),
        }
tr = Counter(x["label"] for x in rows if x["set"] == "train")
report["train_frames"] = dict(tr)
report["train_recordings"] = dict(Counter(r.group for r in recs if sets[r.id] == "train"))

# ---------------------------------------------------------------- C: YOLOX
det = SealDetector()
yres = defaultdict(list)
for r in recs:
    if r.group not in ("ram", "snake", "tiger", "dog", "monkey", "boar", "horse"):
        continue
    cap = cv2.VideoCapture(str(E.video_file(config.DATA_DIR, r)))
    k = 0
    found, best_true, wrong = [], [], Counter()
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        k += 1
        if k % 3:
            continue
        ds = det.detect(frame, min_score=0.1)
        true_scores = [x.score for x in ds if x.sign == r.group]
        best_true.append(max(true_scores) if true_scores else 0.0)
        top = next((x for x in ds if x.sign is not None), None)
        if top is not None and top.sign != r.group and top.score >= 0.3:
            wrong[top.sign] += 1
    cap.release()
    b = np.array(best_true) if best_true else np.zeros(1)
    yres[r.group].append({"rec": r.id, "set": sets[r.id], "date": r.date, "frames": len(b),
                          ">=0.70": round(float((b >= 0.70).mean()), 3),
                          "0.40-0.70": round(float(((b >= 0.4) & (b < 0.7)).mean()), 3),
                          "0.10-0.40": round(float(((b >= 0.1) & (b < 0.4)).mean()), 3),
                          "not found": round(float((b < 0.1).mean()), 3),
                          "median score": round(float(np.median(b)), 3),
                          "other seals >=0.3": dict(wrong.most_common(3))})
report["C"] = yres
(OUT / "diagnosis.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
print("written", OUT / "diagnosis.json")

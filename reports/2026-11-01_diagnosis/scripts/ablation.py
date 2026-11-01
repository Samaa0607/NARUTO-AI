"""DIAGNOSTIC ONLY - fusion ablation on TRAIN + VALIDATION (never the test set).

Same replay as evaluate.py (SignFusion + ActionController in time, YOLOX at SEAL_RATE_HZ through the
app's SealWorker). The variants are constructor arguments / inputs only: no project file changes.
  current            SignFusion()                                 (p>=0.60 + margin 0.30 + palm gate)
  no_margin          SignFusion(landmark_margin=0)                (p>=0.60 + palm gate)
  before_session     SignFusion(landmark_margin=0, palm_gap=0)    (p>=0.60 only: the rule before this session)
  landmarks_only     SignFusion(), YOLOX off (the app's own YOLOX-off mode)
  yolox_only         SignFusion(), no landmark probabilities
Train: the landmark model learned these recordings -> every landmark-based number is inflated (leak).
"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(r"C:\Users\user\Desktop\SHINOBI-AI")
sys.path.insert(0, str(ROOT))
import evaluate as E  # noqa: E402
import splits as S  # noqa: E402
from shinobi import config  # noqa: E402
from shinobi.classifier import GestureClassifier  # noqa: E402
from shinobi.controller import ActionController  # noqa: E402
from shinobi.fusion import SignFusion  # noqa: E402

OUT = Path(sys.argv[1])
CONFIGS = {
    "current": dict(kw={}, yolox=True, lm=True),
    "no_margin": dict(kw={"landmark_margin": 0.0}, yolox=True, lm=True),
    "before_session": dict(kw={"landmark_margin": 0.0, "palm_gap": 0.0}, yolox=True, lm=True),
    "landmarks_only": dict(kw={}, yolox=False, lm=True),
    "yolox_only": dict(kw={}, yolox=True, lm=False),
}

recs, _, _ = S.scan(config.DATA_DIR)
sets = S.set_of(S.load())
recs = [r for r in recs if r.kind == "single" and sets.get(r.id) in ("train", "validation")]
clf = GestureClassifier()
runner = E.SealRunner()
res = {"per_recording": [], "per_set": {}}
frames = defaultdict(lambda: defaultdict(list))        # set -> config -> [(truth, pred)]
try:
    for r in sorted(recs, key=lambda r: (sets[r.id], r.group, r.id)):
        d = E.load_recording(config.DATA_DIR, r)
        times = np.asarray(d["timestamps"], float)
        aspect = float(d["meta"].get("aspect", 16 / 9))
        probs, _ = E.landmark_probs(clf, d["image_lm"], d["world_lm"], d["present"], aspect)
        vf = E.read_video(E.video_file(config.DATA_DIR, r))
        h, w = vf[0].shape[:2]
        v_idx, exact = E.align_video(times, len(vf))
        results = [runner.run(f, float(times[i])) for f, i in zip(vf, v_idx)]
        hands = [E.hands_from_arrays(*f, w, h) for f in zip(d["image_lm"], d["world_lm"], d["present"])]
        seal_runs = [(av, results[k]) for k, av in E.seal_schedule(times[v_idx])]
        scored = np.flatnonzero(times >= E.SKIP_START)
        row = {"set": sets[r.id], "rec": r.id, "label": r.group, "aligned": "exact" if exact else "approx"}
        for name, c in CONFIGS.items():
            fusion, ctrl = SignFusion(**c["kw"]), ActionController(config.GESTURES)
            j, result, signs, confirmed = 0, None, [], []
            for i, now in enumerate(times):
                while j < len(seal_runs) and seal_runs[j][0] <= now:
                    result = seal_runs[j][1]
                    j += 1
                fused = fusion.update(probs[i] if c["lm"] else None, clf.labels, result if c["yolox"] else None,
                                      hands[i], now, yolox_running=c["yolox"])
                st = ctrl.update(fused.probs, now)
                signs.append(fused.sign)
                if st.confirmed:
                    confirmed.append(st.confirmed)
            pred = [signs[i] for i in scored]
            frames[sets[r.id]][name] += [(r.group, p) for p in pred]
            row[name] = {"recall": round(float(np.mean([p == r.group for p in pred])), 3),
                         "wrong": dict(Counter(p for p in pred if p != r.group).most_common(2)),
                         "confirmed": dict(Counter(confirmed)), "rejected": fusion.rejected}
        res["per_recording"].append(row)
        print(row["set"], row["label"], row["rec"], {k: row[k]["recall"] for k in CONFIGS}, flush=True)
finally:
    runner.close()

for st, by in frames.items():
    out = {}
    for name, pairs in by.items():
        labs = sorted({t for t, _ in pairs} | {p for _, p in pairs})
        per = {}
        for lab in labs:
            tp = sum(1 for t, p in pairs if t == lab and p == lab)
            n_true = sum(1 for t, _ in pairs if t == lab)
            n_pred = sum(1 for _, p in pairs if p == lab)
            per[lab] = {"recall": round(tp / n_true, 3) if n_true else None,
                        "precision": round(tp / n_pred, 3) if n_pred else None, "frames": n_true}
        out[name] = per
    res["per_set"][st] = out
(OUT / "ablation.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
print("written", OUT / "ablation.json")

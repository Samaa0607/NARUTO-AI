"""DIAGNOSTIC ONLY: contact sheets (train vs test frames, hands drawn, AI readings per frame) and a
per-2-second timeline for ram / tiger. Reads recordings; writes PNG/JSON only into the scratchpad."""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(r"C:\Users\user\Desktop\SHINOBI-AI")
sys.path.insert(0, str(ROOT))
import evaluate as E  # noqa: E402
import splits as S  # noqa: E402
from shinobi import config  # noqa: E402
from shinobi.classifier import GestureClassifier  # noqa: E402
from shinobi.seal_detector import SealDetector  # noqa: E402

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
clf = GestureClassifier()
labels = list(clf.labels)
det = SealDetector()
SEALS = {"ram", "snake", "tiger", "dog", "monkey", "boar", "horse"}
CHAINS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12], [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [0, 17]]
COLORS = [(0, 255, 0), (255, 0, 255)]

GROUPS = {
    "ram": ["me_night_20261030_220443", "me_day_20261101_140631", "me_day_20261101_141955"],
    "tiger": ["me_night_20261030_220235", "me_day_20261101_140826", "me_day_20261101_142054"],
    "snake": ["me_night_20261030_220610", "me_day_20261101_141409", "me_day_20261101_142024"],
    "dog": ["me_night_20261030_215059", "me_day_20261101_141440", "me_day_20261101_142126"],
    "clone_seal": ["me_night_20261030_214750", "me_day_20261101_141650", "me_day_20261101_142339"],
    "rasengan_palm": ["me_day_20261030_174647", "me_day_20261030_175251", "me_day_20261101_141718",
                      "me_day_20261101_142407"],
    "idle": ["me_night_20261030_222121", "me_day_20261101_141753", "me_day_20261101_141901"],
}
SET = {"me_day_20261030_175251": "validation"}
REC = {r.id: r for r in S.scan(config.DATA_DIR)[0]}


def load(label, rid):
    d = np.load(config.DATA_DIR / REC[rid].path)
    meta = json.loads(str(d["meta"]))
    img, wld, pres, ts = d["image_lm"], d["world_lm"], d["present"], d["timestamps"]
    vid_idx, lv = [], -1e9                      # video frame j <-> landmark frame vid_idx[j] (same rule as the recorders)
    for i, t in enumerate(ts):
        if t - lv >= 1 / 15:
            vid_idx.append(i)
            lv = t
    probs, _ = E.landmark_probs(clf, img, wld, pres, float(meta.get("aspect", 16 / 9)))
    return img, pres, ts, vid_idx, probs


def frames_of(label, rid):
    cap = cv2.VideoCapture(str(E.video_file(config.DATA_DIR, REC[rid])))
    out = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        out.append(f)
    cap.release()
    return out


def annotate(frame, img, pres, i, probs, label, t, w_out):
    f = frame.copy()
    h, w = f.shape[:2]
    for s in range(2):
        if pres[i][s]:
            pts = (img[i][s][:, :2] * [w, h]).astype(int)
            for ch in CHAINS:
                for a, b in zip(ch, ch[1:]):
                    cv2.line(f, tuple(pts[a]), tuple(pts[b]), COLORS[s], 2)
    yolo = ""
    if label in SEALS or label == "clone_seal":
        ds = [x for x in det.detect(frame, min_score=0.1) if x.sign is not None]
        yolo = f"Y:{ds[0].sign} {ds[0].score:.2f}" if ds else "Y:-"
    pb = probs[i]
    lm = f"L:{labels[int(np.argmax(pb))]} {float(np.max(pb)):.2f}" if pb is not None else "L:no hand"
    f = cv2.resize(f, (w_out, int(w_out * h / w)))
    cv2.rectangle(f, (0, 0), (w_out, 44), (0, 0, 0), -1)
    cv2.putText(f, f"t={t:4.1f}s hands={int(pres[i].sum())}  {yolo}", (4, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
    cv2.putText(f, lm, (4, 37), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
    return f


def sheet(label, rids, cols, w_out, name):
    rows = []
    for rid in rids:
        img, pres, ts, vid_idx, probs = load(label, rid)
        vf = frames_of(label, rid)
        n = min(len(vf), len(vid_idx))
        picks = np.linspace(n * 0.05, n * 0.95, cols).astype(int)
        tiles = [annotate(vf[j], img, pres, vid_idx[j], probs, label, ts[vid_idx[j]], w_out) for j in picks]
        row = np.hstack(tiles)
        st = SET.get(rid, "train" if "20261030" in rid else "test")
        bar = np.zeros((26, row.shape[1], 3), np.uint8)
        cv2.putText(bar, f"{label}  {rid}  [{st}]", (6, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 200, 255), 2)
        rows += [bar, row]
    cv2.imwrite(str(OUT / name), np.vstack(rows))


def timeline(label, rid):
    """Per 2 s: hands share, both-hands share, YOLOX score of the TRUE seal (median), landmark argmax==true."""
    img, pres, ts, vid_idx, probs = load(label, rid)
    vf = frames_of(label, rid)
    yt = {}
    for j in range(0, min(len(vf), len(vid_idx)), 2):
        sc = [x.score for x in det.detect(vf[j], min_score=0.1) if x.sign == label]
        yt[vid_idx[j]] = max(sc) if sc else 0.0
    out = []
    for b0 in np.arange(0, 20, 2.0):
        m = (ts >= b0) & (ts < b0 + 2)
        idx = np.where(m)[0]
        if not len(idx):
            continue
        hs = pres[idx].sum(1)
        lm_ok = [probs[i] is not None and labels[int(np.argmax(probs[i]))] == label for i in idx]
        ys = [yt[i] for i in idx if i in yt]
        out.append({"t": f"{b0:.0f}-{b0 + 2:.0f}s", "hands": round(float((hs > 0).mean()), 2),
                    "both": round(float((hs > 1).mean()), 2), "landmark_ok": round(float(np.mean(lm_ok)), 2),
                    "yolox_true_median": round(float(np.median(ys)), 2) if ys else None,
                    "yolox>=0.70": round(float(np.mean(np.array(ys) >= 0.7)), 2) if ys else None})
    return out


for label, rids in GROUPS.items():
    sheet(label, rids, 6, 300, f"sheet_{label}.png")
for label, rid in [("ram", "me_day_20261101_140631"), ("tiger", "me_day_20261101_140826")]:
    img, pres, ts, vid_idx, probs = load(label, rid)
    vf = frames_of(label, rid)
    n = min(len(vf), len(vid_idx))
    picks = np.linspace(0, n - 1, 16).astype(int)
    tiles = [annotate(vf[j], img, pres, vid_idx[j], probs, label, ts[vid_idx[j]], 400) for j in picks]
    grid = np.vstack([np.hstack(tiles[k:k + 4]) for k in range(0, 16, 4)])
    cv2.imwrite(str(OUT / f"first_{label}_dense.png"), grid)

tl = {f"{lab}/{rid}": timeline(lab, rid) for lab in ("ram", "tiger") for rid in GROUPS[lab]}
(OUT / "timeline.json").write_text(json.dumps(tl, indent=1), encoding="utf-8")
for k, v in tl.items():
    print(k)
    for x in v:
        print("   ", x)
print("written", OUT)

# Phase 3: Random Forest vs MLP, same grouped cross-validation (2026-11-01)

These are cross-validation results on TRAIN, not an independent test. Nothing was selected, retrained or installed.
`models/gesture_model.joblib` is unchanged (md5 `be848524…`). Thresholds, fusion, YOLOX and the test set are untouched.

**Same procedure for both models:**
- the same 43 TRAIN recordings (7621 frames);
- the same 4 condition groups (G1 Oct-30, G2 face level, G3 low camera, G4 sitting back), each held out once;
- train.py's own features, models and augmentation (on the training part only).

Accuracy numbers: `metrics.json` (from `tools/grouped_cv.py`). Inference time: measured on the same folds, one frame at a time, through the app's prediction path (`shinobi/classifier.py`).

## Summary

| | Random Forest | MLP |
|---|---|---|
| macro-F1, pooled | 0.856 | **0.889** |
| accuracy, pooled | 0.838 | **0.871** |
| macro-F1 on G2–G4 (installed model there: 0.639) | 0.877 | **0.901** |
| fold macro-F1, mean ± SD | 0.840 ± **0.051** | **0.859** ± 0.098 |
| worst fold | **0.789** (G1) | 0.775 (G4) |
| inference per frame, median / p90 (app path) | **0.41 / 0.86 ms** (fast forest) | 1.20 / 2.95 ms |
| training time per fold | 23 s | **7 s** |
| app path: clone_seal frames accepted | 99.9% | 100% |
| app path: rasengan_palm frames accepted | 59% | **82%** |
| idle frames wrongly accepted as palm | **0.18% (2)** | 0.9% (12) |

A whole frame (MediaPipe + YOLOX + effects) takes about 70–100 ms. Both models add 1–3% at most, so inference time does not decide between them.

## Per class (pooled out-of-fold)

| class | RF P | RF R | RF F1 | MLP P | MLP R | MLP F1 | better F1 |
|---|---|---|---|---|---|---|---|
| idle | 0.582 | 0.757 | 0.658 | 0.607 | 0.744 | 0.668 | ≈ |
| ram | 0.866 | 0.972 | 0.916 | 0.880 | 0.923 | 0.901 | ≈ RF |
| snake | 0.907 | 0.769 | 0.832 | 0.893 | 0.743 | 0.811 | ≈ RF |
| tiger | 0.982 | 0.780 | 0.869 | 0.879 | 0.841 | 0.859 | ≈ |
| dog | 0.696 | 0.975 | 0.812 | 0.978 | 0.975 | **0.976** | MLP |
| monkey | 0.956 | 0.995 | 0.975 | 0.940 | 0.994 | 0.966 | ≈ |
| boar | 1.000 | 0.609 | 0.757 | 1.000 | 1.000 | **1.000** | MLP |
| horse | 1.000 | 0.958 | **0.978** | 0.991 | 0.753 | 0.855 | RF |
| clone_seal | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | = |
| rasengan_palm | 0.861 | 0.677 | 0.758 | 0.860 | 0.836 | **0.848** | MLP |

**Where they differ:**
- **RF:** loses Boar at the low camera (G3: 0%, called dog). That is also why its Dog precision drops to 0.70.
- **MLP:** loses Horse at face level (G2: 21%, called idle).
- **Both:** fail Snake when sitting back (G4) and old-setup Tiger (G1).

## Recommendation: MLP

1. The MLP is better on the two summary numbers:
   - pooled macro-F1 is +0.033;
   - on the conditions the installed model never saw it is +0.024.
2. It is better on the classes where the app actually uses the landmark model. In the app the landmark model decides only clone_seal and rasengan_palm, while the 7 seals come from YOLOX:
   - equal on Clone Seal;
   - palm accepted 82% vs 59%.
3. Its two weaker points are real:
   - **Less stable across conditions:** the SD is twice as large.
   - **More single idle frames accepted as palm:** 12 vs 2 out of 1112.

   A palm needs about 0.3 s of steady frames to be confirmed. So before installing, the retrained MLP should be replayed through the app (fusion + stabilizer) on the idle recordings, and it should be installed only if it confirms no false Rasengan palm. If it does, the RF is the safe fallback.

**Still needs your approval:**
- Choosing MLP and retraining it on all 43 TRAIN recordings.
- A small explicit option in train.py so it trains that model instead of choosing by itself. Today it would choose by its own recording-level cross-validation.
- The replay check above, before replacing the installed model (backup: `SHINOBI-AI_backup_20261101_190821_phase2_model`).

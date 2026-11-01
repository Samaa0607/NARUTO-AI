# Deployment: MLP landmark model installed (2026-11-01)

## What changed

- `models/gesture_model.joblib` is now the MLP (md5 `ed330ca7…`), copied from `models/experiments/mlp/`. `models/training_report.txt` and `models/confusion_validation.png` were replaced by the MLP's own.
- The previous production model (Random Forest, md5 `be848524…`) is kept twice:
  - `models/previous_production_20261101/` (model, report, confusion PNG)
  - `C:\Users\user\Desktop\SHINOBI-AI_backup_20261101_224739_before_model_experiment\models\` (the original backup, untouched)
- Unchanged: YOLOX, fusion logic, thresholds, gesture definitions, sequence rules, UI, effects, audio, data, test set, exclusions, reports.

## Verification

- **Server start:** the server was restarted. `/api/info` reports `landmark_model: true` and `yolox: true`. `GestureClassifier()` loads `mlp` with 10 labels.
- **Backend tests:** `pytest -q` → 225 passed.
- **Browser tests** (real site `http://127.0.0.1:8000`, Edge, fake camera playing the user's recordings):

  | test | result |
  |---|---|
  | Live Fire Style | 10/10 |
  | Live Chidori | 10/10 |
  | Practice Fire Style | 9/9 |
  | Practice Chidori | 9/9 on re-run. The first run failed one check because a late screenshot let the looping video start a 2nd run. The same artefact was seen earlier with the old model. |
  | Practice Shadow Clone | 9/9 |
  | Practice Rasengan | 9/9 |
  | Wrong order (no jutsu, progress kept) | 5/5 |
  | Sounds and activation order, Shadow Clone + Rasengan | 14/14 |
  | Sequence rules: wrong sign keeps progress | 6/6 |
  | Sequence rules: wrong attempts restart the 7 s | 11/11 |
  | Sequence rules: slow mistakes | 11/11 |
  | Sequence rules: timeout | 8/8 |
  | Sequence rules: Practice retry | 11/11 |

## Old vs new by camera condition

Grouped cross-validation, on the conditions the old model never saw:

| condition | landmark macro-F1 old → MLP | notable recall changes | app: Clone Seal accepted | app: Rasengan palm accepted |
|---|---|---|---|---|
| face level | 0.646 → 0.826 | ram 0.54→0.94, snake 0.36→1.00, tiger 0.53→0.96, monkey 0.16→1.00; horse 0.38→0.21 (YOLOX decides horse in the app) | 99% → 100% | 100% → 100% |
| low camera | 0.705 → 1.000 | monkey 0→1.00, boar 0→1.00, snake 0.72→1.00 | 100% → 100% | 100% → 100% |
| far | 0.498 → 0.775 | ram 0.01→0.89, tiger 0→1.00; snake still 0.01 (both) | **43% → 100%** | 85% → 100% |

**Test set** (17 valid recordings, `evaluate.py`; not fully independent, see `comparison.md`):
- App-level macro-F1 0.515 → 0.622.
- Clone Seal 6% → 100%.
- False jutsu activations 0 → 0.
- No wrong sign confirmations on valid idle recordings.

## Regressions

- **None found at app level.** The 7 seals are decided by YOLOX (unchanged), so their app behaviour is identical.
- **Landmark-path-only weak spots:** Horse at face level (one recording) and Idle recall on the held-out OK-sign recording. Neither changes the app's decision, and no false activations were measured.
- **Real-webcam check:** the angle/distance check was not done with a live person. It was measured on the recorded conditions (grouped CV) and in the browser with recorded video as the camera. The owner should try the live site with her own camera.

## Rollback

```
copy models\previous_production_20261101\gesture_model.joblib models\gesture_model.joblib
```

Then restart the server (`.venv\Scripts\python.exe -m shinobi.server`). The copy in `previous_production_20261101` has the old md5 `be848524…`.

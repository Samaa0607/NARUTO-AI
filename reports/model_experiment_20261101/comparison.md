# Model experiment: production vs Random Forest vs MLP (2026-11-01)

**Nothing was deployed.**
- The production model `models/gesture_model.joblib` is unchanged (md5 `be848524…` before and after).
- Backup: `C:\Users\user\Desktop\SHINOBI-AI_backup_20261101_224739_before_model_experiment`.
- Thresholds, fusion, YOLOX, the sequences, the UI, the effects and the audio were not touched.

## What was done

- **Two experimental models,** trained with `train.py --model-type random_forest|mlp` (a new option; without it train.py behaves as before):
  - `models/experiments/random_forest/gesture_model.joblib`
  - `models/experiments/mlp/gesture_model.joblib`
- **Training data:** the 43 TRAIN recordings only, with the same features, augmentation and settings as the production model.
- **Evaluation:** all three models with the same `evaluate.py run --sets test,validation`, on the existing recording-level split:
  - test: 22 recordings, 5 excluded for invalid labels, so 17 scored;
  - validation: 3 recordings.

  Each report folder is `reports/model_experiment_20261101/<model>/<time>/` (summary.md, metrics.json, confusion PNGs).
- **No recording is in two sets.** The frames of a recording always stay together, and `evaluate.py` refuses to score a model on recordings it was trained on.

**How independent the test set is:** the old test set is not fully independent. It was inspected in the diagnosis, and the 27 Session-1 training recordings were made the same day, in the same room and light. Its numbers are therefore optimistic for all models trained on Session 1 (RF, MLP), not for production. It has no valid Rasengan palm recording, and only 1 valid Ram and 1 valid Tiger recording. The validation set has only idle and Rasengan palm.

## Results on test (17 valid recordings)

| | production (RF, 16 recordings) | experimental RF (43) | experimental MLP (43) |
|---|---|---|---|
| landmark model alone: accuracy / macro-F1 | 0.737 / 0.712 | 0.861 / 0.820 | **0.872 / 0.845** |
| app decision (fused): accuracy / macro-F1 | 0.579 / 0.515 | **0.695 / 0.622** | 0.693 / **0.622** |
| false jutsu activations (20 single-sign recordings, 6.65 min) | 0 | 0 | 0 |
| wrong sign confirmations on valid idle recordings | 0 | 0 | 0 |
| landmark model time per frame (median / p90) | 0.80 / 0.92 ms | 0.84 / 1.00 ms | 1.32 / 1.55 ms |
| YOLOX time per frame (median, same for all) | ~31 ms | ~32 ms | ~32 ms |

### App decision (fused) per class: precision / recall / F1

| class | production | RF | MLP | frames |
|---|---|---|---|---|
| idle | 0.31 / 1.00 / 0.47 | 0.38 / 1.00 / 0.55 | 0.38 / 0.99 / 0.55 | 1034 |
| ram | 1.00 / 0.23 / 0.38 | same | same | 288 |
| snake | 1.00 / 0.24 / 0.39 | same | same | 674 |
| tiger | 1.00 / 0.07 / 0.13 | same | same | 314 |
| dog | 1.00 / 0.13 / 0.22 | same | same | 675 |
| monkey | 1.00 / 0.90 / 0.95 | same | same | 599 |
| boar | 1.00 / 0.96 / 0.98 | same | same | 605 |
| horse | 1.00 / 1.00 / 1.00 | same | same | 687 |
| **clone_seal** | 1.00 / **0.06** / 0.12 | 1.00 / **1.00** / 1.00 | 1.00 / **1.00** / 1.00 | 680 |
| rasengan_palm | no valid test recording | – | – | 0 |

The 7 seals are decided by YOLOX in the app, so their fused numbers are identical for all three models. The real gain is **Clone Seal: 6% → 100%** of frames, and the controller confirmed it in both recordings (production: none).

### Landmark model alone per class: precision / recall / F1

| class | production | RF | MLP |
|---|---|---|---|
| idle | 0.39 / 0.96 / 0.55 | 0.77 / 0.98 / 0.86 | 0.85 / 0.96 / 0.91 |
| ram | 0.77 / 0.91 / 0.83 | 0.56 / 0.88 / 0.69 | 0.63 / 0.91 / 0.74 |
| snake | 1.00 / 0.03 / 0.06 | 1.00 / 0.94 / 0.97 | 1.00 / 0.93 / 0.97 |
| tiger | 0.82 / 0.75 / 0.78 | 0.98 / 0.38 / 0.55 | 0.95 / 0.55 / 0.70 |
| dog | 0.70 / 0.97 / 0.82 | 0.67 / 0.96 / 0.79 | 0.64 / 0.99 / 0.78 |
| monkey | 0.89 / 1.00 / 0.94 | 0.97 / 1.00 / 0.99 | 0.99 / 0.89 / 0.94 |
| boar | 1.00 / 0.39 / 0.56 | 1.00 / 0.42 / 0.59 | 1.00 / 0.41 / 0.59 |
| horse | 1.00 / 0.78 / 0.88 | 1.00 / 0.91 / 0.95 | 1.00 / 0.98 / 0.99 |
| clone_seal | 1.00 / 0.95 / 0.98 | 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 |

**Both new models are worse than production on Tiger** (RF 0.38, MLP 0.55, production 0.75 recall; Tiger is mostly called Ram). This is a single valid recording. It does not change the app, because YOLOX decides Tiger.

## Validation (3 recordings: idle ×2, Rasengan palm ×1)

| | production | RF | MLP |
|---|---|---|---|
| fused (app) | 100% | 100% | 100% |
| landmark model alone: macro-F1 | 1.000 | 0.996 | 0.992 |
| idle frames read as another sign (landmark model alone) | 0% | 2% | 3% |
| idle sign confirmations / palm confirmed | none / yes | none / yes | none / yes |

## False activations

- **No model fired a jutsu** on any single-sign recording.
- On the valid idle recordings (5) **no model confirmed any sign**.
- The MLP sent 6 single idle frames to rasengan_palm in the fused test output. They were scattered, and the stabilizer confirmed none of them.
- All three models confirm Rasengan palm on the excluded recording `141753`, which really shows an open palm.

## Speed

- The landmark model adds about 1 ms per frame. YOLOX (~31 ms) and MediaPipe dominate.
- The whole AI frame rate measured in the browser tests on this machine was 6–10 fps. A different landmark model cannot change it measurably.

## Recommendation

On this evidence both experimental models are a clear improvement over production in the app:
- Clone Seal goes from 6% to 100%.
- Landmark macro-F1 goes from 0.71 to 0.82–0.85.
- There are no new false activations.

**RF and MLP are tied in the app** (fused macro-F1 0.622 both).

| | Random Forest | MLP |
|---|---|---|
| landmark macro-F1 on test | 0.820 | **0.845** |
| grouped CV macro-F1 | 0.856 | **0.889** |
| stability across conditions | **more stable** | less stable |
| scattered idle frames read as palm | **fewer** | more |
| speed | slightly faster | slightly slower |

**Recommendation: MLP.** It is better on the two measures that do not depend on YOLOX, and its scattered palm frames never became a confirmation. Choose RF if you prefer stability.

Either way, nothing is installed until you approve. Installing means copying the chosen file over `models/gesture_model.joblib` (the backup is ready) and restarting the server.

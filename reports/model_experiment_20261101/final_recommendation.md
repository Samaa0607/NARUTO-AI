# Final recommendation: deploy the MLP landmark model (2026-11-01)

**Status:** recommendation only. The production model `models/gesture_model.joblib` is unchanged (md5 `be848524…`). Deployment waits for the owner's approval.

## Final verification: grouped cross-validation, re-run

The re-run is in `reports/model_experiment_20261101/2026-11-01_232547_grouped_cv/`. It used the same procedure as Phase 2 and reproduced the same numbers.

| | RF | MLP |
|---|---|---|
| pooled macro-F1 | 0.856 | **0.889** |
| fold G1, Oct-30 | 0.789 | **0.834** |
| fold G2, face level | **0.902** | 0.826 |
| fold G3, low camera | 0.859 | **1.000** |
| fold G4, sitting back | **0.809** | 0.775 |
| on G2–G4, vs installed model 0.639 | 0.877 | **0.901** |

**MLP stays competitive across the folds:**
- It is best in 2 of 4 folds and best on the pooled score.
- In the other two it is within 0.08 and 0.03.

## Regression check per gesture

Landmark-model recall on G2–G4, the conditions the installed model never saw (installed → MLP):

| gesture | installed | MLP | comment |
|---|---|---|---|
| ram | 0.48 | 0.94 | better |
| snake | 0.35 | 0.66 | better |
| tiger | 0.49 | 0.99 | better |
| monkey | 0.07 | 1.00 | better |
| boar | 0.44 | 1.00 | better |
| dog | 1.00 | 1.00 | equal |
| clone_seal | 1.00 | 1.00 | equal |
| rasengan_palm | 1.00 | 1.00 | equal |
| horse | 0.72 | **0.64** | lower: one recording (G2 face level, 21%). On the test set MLP horse is 0.98 vs installed 0.78 |
| idle | 0.80 | **0.74** | lower: mostly the OK-sign recording when held out |

**The two lower numbers do not cause a regression in the app:**
- **Horse:** in the app it is decided by YOLOX, not by the landmark model, so the website-level Horse result is identical (fused recall 1.00 for all models on test).
- **Idle:** the website-level effect is the false-trigger rate.
  - On test and validation no model confirmed any sign on a valid idle recording, and no model fired a false jutsu (0 in 6.65 min).
  - In grouped CV, 12 of 1112 idle frames passed the palm rules as single frames (RF: 2), and none of them would be held long enough to confirm.

**Where the landmark model matters in the app (clone_seal, rasengan_palm):**
- Clone Seal: website-level recall on test goes from 0.06 (installed) to 1.00. In grouped CV it is accepted 100% in every condition, far camera included (installed: 43%).
- Rasengan palm: accepted 82% in grouped CV (RF 59%; 100% in every Nov-1 condition).

## Recommendation

**Deploy the MLP** (`models/experiments/mlp/gesture_model.joblib`):
- It has the best standalone accuracy on test (macro-F1 0.845) and in grouped CV (0.889).
- It matches RF at website level (fused macro-F1 0.622) and on Clone Seal (100%).
- It accepts more true Rasengan palms.
- It causes no website-level regression in any gesture and no false activations.

Its known weak spots are Horse at face level for the landmark path only, and Snake when sitting back for both models. Neither affects the app's decision, because YOLOX decides those seals.

**Deployment, after approval:**
1. Copy the MLP file over `models/gesture_model.joblib`. The current file is backed up in `SHINOBI-AI_backup_20261101_224739_before_model_experiment`.
2. Restart the server.
3. Re-run the Live/Practice browser tests and the app-level replay on the idle recordings.

**Rollback:** copy the backup file back and restart.

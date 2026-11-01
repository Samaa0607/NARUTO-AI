# Phase 2: condition-grouped cross-validation of the landmark model (2026-11-01)

**These are cross-validation results on the TRAIN set, not independent test results.** The test set and the
validation set were not used. Nothing was trained for real or installed. `models/gesture_model.joblib` is
unchanged (md5 `be848524…` before and after).

- Tool: `tools/grouped_cv.py`. It uses train.py's own loading, features, models and augmentation.
- Raw numbers: `metrics.json`. Confusion matrices: `confusion_*.png`.

## Setup

- **Data:** the 43 TRAIN recordings, 7621 frames (every 2nd frame with a hand, as in train.py).
- **Groups (whole recording conditions):**

  | group | recordings | frames | notes |
  |---|---|---|---|
  | G1 | 16 | 2535 | everything from 2026-10-30 |
  | G2 | 10 | 1772 | Nov-1, camera at face level |
  | G3 | 10 | 2017 | Nov-1, low camera |
  | G4 | 7 | 1297 | Nov-1, sitting back; no monkey / boar / horse |

- **Each fold** trains on 3 groups and is scored on the 4th:
  - the frames of a recording never leave their group;
  - augmentation (mirror + jitter) is applied only to the training part;
  - the held-out frames are originals only.
- **Models:** train.py's two existing models, unchanged:
  - Random Forest (300 trees, `class_weight="balanced"`);
  - MLP (128-64, early stopping).
- **Baseline:** the installed model (a Random Forest trained on the 16 Oct-30 recordings), scored on G2–G4, the groups it never saw.

## Results (all four held-out groups pooled)

| | Random Forest | MLP |
|---|---|---|
| macro-F1 | **0.856** | **0.889** |
| accuracy | 0.838 | 0.871 |
| macro-F1 per held-out group: G1 / G2 / G3 / G4 | 0.789 / 0.902 / 0.859 / 0.809 | 0.834 / 0.826 / 1.000 / 0.775 |
| mean ± SD over the 4 folds (worst fold) | 0.840 ± 0.051 (0.789) | 0.859 ± 0.098 (0.775) |

### Per class (pooled)

| class | RF precision | RF recall | RF F1 | MLP precision | MLP recall | MLP F1 | frames |
|---|---|---|---|---|---|---|---|
| idle | 0.582 | 0.757 | 0.658 | 0.607 | 0.744 | 0.668 | 1112 |
| ram | 0.866 | 0.972 | 0.916 | 0.880 | 0.923 | 0.901 | 726 |
| snake | 0.907 | 0.769 | 0.832 | 0.893 | 0.743 | 0.811 | 739 |
| tiger | 0.982 | 0.780 | 0.869 | 0.879 | 0.841 | 0.859 | 709 |
| dog | 0.696 | 0.975 | 0.812 | 0.978 | 0.975 | 0.976 | 720 |
| monkey | 0.956 | 0.995 | 0.975 | 0.940 | 0.994 | 0.966 | 627 |
| boar | 1.000 | 0.609 | 0.757 | 1.000 | 1.000 | 1.000 | 575 |
| horse | 1.000 | 0.958 | 0.978 | 0.991 | 0.753 | 0.855 | 566 |
| clone_seal | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 771 |
| rasengan_palm | 0.861 | 0.677 | 0.758 | 0.860 | 0.836 | 0.848 | 1076 |

### Confusion matrices

Rows = true class, columns = predicted. Column order: idle, ram, snake, tiger, dog, monkey, boar, horse, clone_seal, rasengan_palm.

    Random Forest                                  MLP
    idle     842   1  58   2  89   2   0   0   0 118     827   9  66  49  15   1   0   4   0 141
    ram       12 706   0   8   0   0   0   0   0   0      23 670   0  33   0   0   0   0   0   0
    snake    171   0 568   0   0   0   0   0   0   0     169   0 549   0   0  21   0   0   0   0
    tiger     48 108   0 553   0   0   0   0   0   0      28  82   0 596   0   0   0   0   0   3
    dog        0   0   0   0 702  18   0   0   0   0       0   0   0   0 702  18   0   0   0   0
    monkey     1   0   0   0   2 624   0   0   0   0       0   0   0   0   1 623   0   0   0   3
    boar       0   0   0   0 216   9 350   0   0   0       0   0   0   0   0   0 575   0   0   0
    horse     24   0   0   0   0   0   0 542   0   0     140   0   0   0   0   0   0 426   0   0
    clone     0   0   0   0   0   0   0   0 771   0       0   0   0   0   0   0   0   0 771   0
    palm     348   0   0   0   0   0   0   0   0 728     176   0   0   0   0   0   0   0   0 900

### Recall per camera condition (RF / MLP)

| class | G1 Oct-30 | G2 face level | G3 low camera | G4 sitting back |
|---|---|---|---|---|
| idle | 0.72 / 0.74 | **0.29 / 0.28** | 1.00 / 1.00 | 1.00 / 0.83 |
| ram | 0.93 / 0.87 | 0.95 / 0.94 | 1.00 / 1.00 | 1.00 / 0.89 |
| snake | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 | **0.10 / 0.01** |
| tiger | **0.32 / 0.33** | 0.99 / 0.96 | 1.00 / 1.00 | 0.75 / 1.00 |
| dog | 0.89 / 0.89 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 |
| monkey | 1.00 / 0.98 | 0.99 / 1.00 | 0.99 / 1.00 | – |
| boar | 1.00 / 1.00 | 1.00 / 1.00 | **0.00** / 1.00 | – |
| horse | 1.00 / 1.00 | 0.86 / **0.21** | 1.00 / 1.00 | – |
| clone_seal | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 |
| rasengan_palm | **0.34 / 0.67** | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 |

### What the app would do with the landmark path

Rules unchanged: p ≥ 0.60, margin ≥ 0.30, and the open-palm gate for the palm.

| | Random Forest | MLP | installed model (G2–G4 only) |
|---|---|---|---|
| clone_seal frames accepted | 99.9% | 100% | 82% (far camera: **43%**) |
| rasengan_palm frames accepted | 59% (G1 old palms 17%, Nov-1 100%) | 82% (G1 64%, Nov-1 100%) | 95% |
| idle frames wrongly accepted as palm / clone | 0.18% (2 frames) | 0.9% (12 frames) | 0.18% |
| seal frames wrongly accepted as palm / clone | 0% | 0.04% | 0% |

These are single frames. In the app a sign also has to be held through the stabilizer, so scattered frames like these are normally not confirmed. That should be measured with the replay in Phase 3.

### Before / after on the same frames (G2–G4, which the installed model never saw)

| | installed model | RF (grouped CV) | MLP (grouped CV) |
|---|---|---|---|
| macro-F1 | 0.639 | 0.877 | 0.901 |
| recall: ram / snake / tiger | 0.48 / 0.35 / 0.50 | 0.99 / 0.69 / 0.91 | 0.94 / 0.66 / 0.99 |
| recall: monkey / boar / horse | 0.07 / 0.44 / 0.72 | 0.99 / 0.44 / 0.94 | 1.00 / 1.00 / 0.64 |
| recall: dog / clone_seal / rasengan_palm / idle | 1.00 / 1.00 / 1.00 / 0.80 | 1.00 / 1.00 / 1.00 / 0.80 | 1.00 / 1.00 / 1.00 / 0.75 |

## Reading the results

1. **More conditions help a lot on unseen conditions.** On G2–G4, macro-F1 goes from 0.64 (installed model) to 0.88–0.90 (models that saw the other conditions). This is a cross-validation estimate, not a test score.
2. **The MLP is better on average** (pooled 0.889 vs 0.856). It fixes Boar at the low camera, where the RF calls it dog (216 frames), and it accepts more of the old-style palms.
3. **The RF is more stable.** Its SD is half the MLP's, its worst fold is better, and it gives fewer idle frames accepted as palm (2 vs 12). The MLP loses Horse at face level (21%, called idle).
4. **Weak spots seen in both models:**
   - **Snake when sitting back (G4: 1–10%).** It is the only far Snake recording, so when it is held out no far Snake is left in training.
   - **Old-setup Tiger (G1: 32%).** Called ram.
   - **Old-setup palms (G1).** Called idle.
   - **The OK-sign idle (G2: 28–29% recall).** No other OK-sign recording is left in training when it is held out. Most of those frames are called palm, but the app's rules and palm gate stop almost all of them.
   - **Idle precision is low (0.58–0.61)** because unsure sign frames fall back to idle. That is the safe direction (no wrong sign), but it costs recall.
5. **Clone Seal is solved for the landmark path in these conditions:** 100% accepted, including the far camera, where the installed model accepted only 43%.

## Limitations

- Same person, two days, one room. This says nothing about other users, night use for Nov-1-style data, or side angles.
- Most class-by-group cells are **one recording**, so a single bad recording swings a number from 100% to 0% (boar G3, snake G4, horse G2). The fold SD (0.05–0.10) reflects that.
- G4 has no monkey / boar / horse.
- Each fold trains on 3 of 4 groups. The final model, trained on all 4, will have seen every condition, so these estimates are not a final accuracy.
- The landmark model only drives clone_seal and rasengan_palm in the app. The 7 seals stay YOLOX's, so their app behaviour does not change with this model (see Phase 4).
- train.py picks the model by its own cross-validation **by recording** (validation has no seals). It may not pick the same model as this grouped cross-validation. Using the grouped-CV choice would need a small, explicit option in train.py (approval needed).

## Recommendation for Phase 3 (needs approval)

- Retrain on all 43 TRAIN recordings with the **MLP**. It has the best average and it fixes Boar at the low camera and the old-style palms.
- In Phase 3, also measure its idle false triggers in the app replay (with the stabilizer) before installing.
- If you prefer stability over the average, the RF is the safe alternative.
- Either way, the old model stays backed up and nothing is installed before you see the before/after numbers.

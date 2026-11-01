# Session 1 inspection, dry-run assignment and revised training plan (2026-11-01)

Inspection and planning only. Nothing was recorded, trained or changed.
- `data/splits.json` md5 is `0ae4d596…` before and after.
- The model, thresholds, fusion, YOLOX, the test set and the exclusions are untouched.
- Session 2 and session 3 are cancelled by the user. No new recordings will be made.

## 1. The 27 new recordings by gesture

| gesture | A (face level) | B (low, looking up) | A-far (sitting back) | total |
|---|---|---|---|---|
| ram | 1 | 1 | 1 | 3 |
| snake | 1 | 1 | 1 | 3 |
| tiger | 1 | 1 | 1 | 3 |
| dog | 1 | 1 | 1 | 3 |
| monkey | 1 | 1 | – | 2 |
| boar | 1 | 1 | – | 2 |
| horse | 1 | 1 | – | 2 |
| clone_seal | 1 | 1 | 1 | 3 |
| rasengan_palm (one hand: right / left / right) | 1 | 1 | 1 | 3 |
| idle (OK sign / fists and claws / pointing and face) | 1 | 1 | 1 | 3 |
| **total** | 10 | 10 | 7 | **27** |

All recordings are from the same person ("me"), on 2026-11-01 between 16:28 and 17:49, in daylight, in one room.

## 2. Proposed TRAIN assignment (all 27, by id)

Quality, plus how the **current** system does on each recording. The installed landmark model and YOLOX have never seen these recordings, so this is a fair look at the current system. It is not a test: these recordings become training data.

- "Hand size" is the hands' extent in frame heights.
- lm = current landmark model, top class correct.
- yolox = YOLOX alone.
- fused = the app's decision.

| # | id | gesture | camera | frames (20 s) | hands | both hands | hand size | lm | yolox | fused | confirmed by the app |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | me_day_20261101_162853 | ram | A | 350 | 100% | 95% | 0.30 | 55% | 99% | 98% | yes |
| 2 | me_day_20261101_163100 | snake | A | 379 | 100% | 100% | 0.21 | 35% | 77% | 69% | yes |
| 3 | me_day_20261101_163253 | tiger | A | 372 | 100% | 100% | 0.26 | 51% | 100% | 100% | yes |
| 4 | me_day_20261101_163553 | dog | A | 372 | 100% | 100% | 0.28 | 100% | 100% | 100% | yes |
| 5 | me_day_20261101_163747 | monkey | A | 366 | 100% | 94% | 0.39 | 16% | 100% | 100% | yes |
| 6 | me_day_20261101_164012 | boar | A | 348 | 100% | 100% | 0.25 | 100% | 100% | 100% | yes |
| 7 | me_day_20261101_164127 | horse | A | 355 | 100% | 100% | 0.53 | 38% | 100% | 100% | yes |
| 8 | me_day_20261101_164328 | clone_seal | A | 358 | 100% | 100% | 0.32 | 100% | – | 100% | yes |
| 9 | me_day_20261101_164627 | rasengan_palm | A | 330 | 100% | 0% | 0.25 | 100% | – | 100% | yes |
| 10 | me_day_20261101_164911 | idle (OK sign) | A | 311 | 100% | 22% | 0.37 | 29% | – | 100% idle | nothing (correct) |
| 11 | me_day_20261101_170452 | ram | B | 348 | 100% | 100% | 0.36 | 98% | 100% | 100% | yes |
| 12 | me_day_20261101_170616 | snake | B | 351 | 100% | 100% | 0.28 | 70% | 79% | 72% | yes |
| 13 | me_day_20261101_170732 | tiger | B | 348 | 100% | 100% | 0.43 | 100% | 83% | 74% | yes |
| 14 | me_day_20261101_171314 | dog | B | 347 | 100% | 100% | 0.41 | 100% | **7%** | **6%** | once |
| 15 | me_day_20261101_171552 | monkey | B | 454 | 100% | 100% | 0.47 | 0% | 100% | 100% | yes |
| 16 | me_day_20261101_171821 | boar | B | 450 | 100% | 100% | 0.42 | **0%** | **0%** | **0%** | **no** |
| 17 | me_day_20261101_172019 | horse | B | 430 | 100% | 100% | 0.53 | 100% | 100% | 100% | yes |
| 18 | me_day_20261101_172325 | clone_seal | B | 435 | 100% | 100% | 0.37 | 100% | – | 100% | yes |
| 19 | me_day_20261101_172516 | rasengan_palm | B | 417 | 100% | 0% | 0.32 | 100% | – | 100% | yes |
| 20 | me_day_20261101_172732 | idle (fists, claws) | B | 449 | 100% | 100% | 0.67 | 100% | – | 100% idle | nothing (correct) |
| 21 | me_day_20261101_173331 | ram | A-far | 399 | 100% | 100% | 0.19 | **1%** | 64% | 52% | yes |
| 22 | me_day_20261101_173557 | snake | A-far | 381 | 100% | 100% | 0.26 | **0%** | **0%** | **0%** | **no** |
| 23 | me_day_20261101_173745 | tiger | A-far | 382 | 100% | 100% | 0.22 | **1%** | 99% | 98% | yes |
| 24 | me_day_20261101_173907 | dog | A-far | 379 | 100% | 99% | 0.23 | 100% | 98% | 97% | yes |
| 25 | me_day_20261101_174201 | clone_seal | A-far | 363 | 100% | 100% | 0.23 | 100% | – | 47% | **no** |
| 26 | me_day_20261101_174404 | rasengan_palm | A-far | 342 | 100% | 0% | 0.20 | 100% | – | 85% | yes |
| 27 | me_day_20261101_174911 | idle (pointing, face) | A-far | 343 | 100% | 94% | 0.28 | 100% | – | 100% idle | nothing (correct) |

**Quality:**
- Hands were seen in 100% of the frames of every recording.
- Every recording lasts 20 s (15–23 fps).
- Every video is aligned with its landmarks.
- A frame from the middle of each recording shows the right gesture.
- Every Rasengan palm uses one hand (both hands seen: 0%).
- The idle OK sign is a real OK sign.
- The user reviewed six frames of each recording before keeping it.

## 3. Dry-run report

Command:

    python tools/assign_recordings.py --log reports/training_sessions/session1_20261101_155047.json

Result: 27 to assign, 0 refused, nothing written.

Independent in-memory check (on a copy of splits.json; nothing written):
- None of the 27 ids is in splits.json or in evaluation_exclusions.json.
- Entries 41 → 68. **All 41 existing entries are byte-for-byte identical** after the simulated assignment.
- Sets before: train 16 / validation 3 / test 22. After: train 43 / validation 3 / test 22.
- The 5 excluded recordings stay in test.
- The only recording on disk without a set is the rejected snake `me_day_20261101_140757` (0% hands). It stays unassigned, so it is never used.

## 4. Revised training plan (existing recordings only)

### Data after the assignment

| gesture | train recordings | train frames with hands | train conditions | validation | old test (valid + excluded) |
|---|---|---|---|---|---|
| idle | 7 | 2217 | Oct-30 night, Nov-1 A / B / A-far | 2 (Oct-30 night) | 3 + 1 |
| ram | 4 | 1451 | Oct-30 night, Nov-1 A / B / A-far | 0 | 1 + 1 |
| snake | 4 | 1475 | same 4 | 0 | 2 + 0 |
| tiger | 4 | 1417 | same 4 | 0 | 1 + 1 |
| dog | 4 | 1438 | same 4 | 0 | 2 + 0 |
| monkey | 4 | 1254 | Oct-30 night (2), Nov-1 A / B | 0 | 2 + 0 |
| boar | 3 | 1150 | Oct-30 night, Nov-1 A / B | 0 | 2 + 0 |
| horse | 3 | 1131 | Oct-30 night, Nov-1 A / B | 0 | 2 + 0 |
| clone_seal | 4 | 1540 | Oct-30 night, Nov-1 A / B / A-far | 0 | 2 + 0 |
| rasengan_palm | 6 | 2149 | Oct-30 day (3), Nov-1 A / B / A-far | 1 (Oct-30 day) | 0 + 2 |

### Strategy

1. **Choose without a validation set, by condition-grouped cross-validation on TRAIN.**
   - The validation set has no seal at all, so it cannot choose anything for 8 of the 10 gestures.
   - Groups are whole recording conditions: G1 = Oct-30, G2 = Nov-1 A, G3 = Nov-1 B, G4 = Nov-1 A-far.
   - Each fold trains on 3 groups and is scored on the unseen 4th. That is the closest thing to "a new camera setup" we can measure.
   - No frames of one recording are ever split.
   - Augmentation (mirror, jitter) stays inside the training part of each fold, as train.py already does.
2. **Model:** only the two existing model types in train.py (random forest, MLP), no architecture change. Pick the one with the best grouped-CV macro-F1. Report per-class recall too, especially for clone_seal and rasengan_palm.
   - Note: train.py already falls back to cross-validation by recording when validation lacks signs (3 folds here). Grouping by condition is stricter. It can be run as a separate report script, so train.py does not have to change.
3. **Class imbalance is mild** (largest/smallest = 2217/1131 ≈ 2:1). The random forest already uses `class_weight="balanced"`. No resampling is needed.
4. **The existing validation set** (idle ×2, palm ×1) stays as it is. It is used only as an extra sanity check (false alarms on idle, palm accepted), not to choose.
5. **Fusion and thresholds** stay as they are in this plan (your rule). See the impact in section 5.
6. **Final evaluation:** once, after everything is frozen, on the old test holdout. That is 17 valid recordings, with the results shown both with and without the 5 exclusions. The caveats are in section 5.
7. **Leakage safeguards:**
   - Whole recordings and whole condition groups are held out.
   - The test set is never loaded by train.py.
   - Nothing is tuned on the test set.
   - The installed model is backed up before it is replaced.

## 5. Limitations and expected impact

- **Retraining the landmark model changes the app only for clone_seal and rasengan_palm.**
  - YOLOX owns the 7 seals in fusion.
  - Session 1 shows the seal failures are on YOLOX's side, and a better landmark model cannot fix them without a fusion change:
    - dog at a low angle: 6%;
    - boar at a low angle: 0%;
    - snake far away: 0%;
    - ram far away: 52%.
  - In #14 the current landmark model is already 100% right while the app says 6%.
- **Expected gains:**
  - Clone Seal: better confidence at new distances and angles (#25: right top class, but only 47% fused and no confirmation).
  - Rasengan palm: 6 one-hand recordings over 4 conditions instead of 3 from one sitting.
  - Landmark accuracy for ram / tiger / snake / monkey / horse in the new conditions (currently 0–55% there).
- **Coverage gaps:**
  - one person only;
  - one room;
  - daylight dominates;
  - night exists only from Oct 30 (no palm at night);
  - no side angle;
  - no close-up low angle.
  - Other users, night use and side angles are untested and may be weaker.
- **Evaluation limits:**
  - The old holdout was recorded the same day, in the same room and light as session 1, so its numbers will be optimistic.
  - It was also inspected during the diagnosis (nothing was tuned on it).
  - Ram and tiger have 1 valid recording each, so their numbers are noisy.
  - **Rasengan palm has no valid independent test recording at all.** Its quality can only be estimated by cross-validation.
  - Final numbers must be reported as "best available, not fully independent". An unbiased number needs new recordings, which are out of scope now.
- One observation, not a test: the OK sign (#10) did not trigger the Rasengan palm with the current model and palm gate.

## 6. Recommendation

1. Approve the assignment of the 27 recordings to TRAIN, i.e. the same command with `--apply`. It checks again that the 41 old entries are unchanged.
2. Approve these steps:
   - back up the installed model;
   - run the condition-grouped cross-validation report;
   - retrain the landmark model on TRAIN only with train.py.
   Nothing else changes: same architectures, YOLOX, thresholds and fusion.
3. Then decide whether to test a fusion change with the same grouped cross-validation, never with the test set. In that change a confident landmark answer could confirm a seal when YOLOX is silent. It is the only way to fix the dog/boar/snake failures above.
4. Last, run the one final evaluation on the 17 valid holdout recordings and a live check in the app, reported with the limits above.

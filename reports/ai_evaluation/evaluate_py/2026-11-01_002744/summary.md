# SHINOBI AI - evaluation report (2026-11-01T00:27:44)

**AI evaluation 2026-11-01 (run A: installed landmark model; leakage guard on)**

> **NOT A FINAL RESULT.** No test recordings were evaluated in this run, so none of the numbers below is the honest test result. See the warnings at the end.

> No TEST recordings exist (data/splits.json: 16 train, 3 validation, 0 test). Validation numbers were used to choose the model: not a final result. YOLOX numbers on train recordings are on data YOLOX never trained on, but the thresholds were tuned while these recordings existed.

## 1. What was measured

- **validation** (3 recordings): VALIDATION set: used to choose the landmark model and to tune thresholds. Useful, but NOT the final result.
  - me_night_20261030_222524, me_night_20261030_222754, me_day_20261030_175251
- **train** (16 recordings): TRAIN set: the landmark model learned from these (its numbers are skipped here). YOLOX never saw any of our recordings, so YOLOX and fused-without-landmark-model numbers are still on unseen data, but this is NOT the agreed test set.
  - me_night_20261030_221934, me_night_20261030_222121, me_night_20261030_222258, me_night_20261030_222645, me_night_20261030_220443, me_night_20261030_220610, me_night_20261030_220235, me_night_20261030_215059, me_night_20261030_215447, me_night_20261030_215808, me_night_20261030_220743, me_night_20261030_220040, me_night_20261030_214750, me_day_20261030_174647, me_day_20261030_174917, me_day_20261030_175113

- Landmark model: `C:\Users\user\Desktop\SHINOBI-AI\models\gesture_model.joblib` - used (random_forest, trained on 16 train recordings, created 2026-10-31T14:36:03).
- YOLOX: `yolox_nano.onnx`, pretrained elsewhere, never trained on our recordings - used.
- Fused = what the app decides: YOLOX + hands + landmark classifier.
- Frames: the first 0.5 s of every single-sign session are not scored (the countdown is not saved; this skips fusion's start-up, see docs/14_evaluation.md). The replay itself starts at 0 s.
- Replay of YOLOX like the app: at most 10 runs per second on the newest saved video frame, each result usable 0.06 s after its frame. The saved video has ~10 frames per second, so the replay ran YOLOX 8.9 times per second (median).
- Thresholds (shinobi/config.py): SEAL_MIN_SCORE 0.7, SEAL_NO_HAND_SCORE 0.85, SEAL_CONFIRM 2, LANDMARK_MIN_PROB 0.6, CONF_ON 0.75, HOLD_SECONDS 0.3.

## 2. Results at a glance (frame level)

| set | recogniser | recordings | frames | accuracy | macro-F1 | balanced accuracy |
|---|---|---|---|---|---|---|
| validation | landmarks | 3 | 1088 | 100.0% | 1.000 | 100.0% |
| validation | yolox | 3 | 552 | 99.8% | 0.999 | 99.8% |
| validation | fused | 3 | 1088 | 100.0% | 1.000 | 100.0% |
| train | landmarks | - | 0 | not run (see section 3) | - | - |
| train | yolox | 16 | 3129 | 99.7% | 0.996 | 99.4% |
| train | fused | - | 0 | not run (see section 3) | - | - |

accuracy = share of frames named correctly. macro-F1 / balanced accuracy give every sign the same weight, so a sign the recogniser never gets right pulls them down even if it has few frames.

## 3. Details per set and recogniser

### landmarks - validation set

_landmark classifier alone (frames where MediaPipe found a hand)_

From 3 recordings: me_day_20261030_175251, me_night_20261030_222524, me_night_20261030_222754

| sign | precision | recall | F1 | frames (true) | frames (said) |
|---|---|---|---|---|---|
| idle | 100.0% | 100.0% | 1.000 | 731 | 731 |
| rasengan_palm | 100.0% | 100.0% | 1.000 | 357 | 357 |

```
true / said       idle    ram  snake  tiger    dog monkey   boar  horse  clone   palm
idle               731      0      0      0      0      0      0      0      0      0
rasengan_palm        0      0      0      0      0      0      0      0      0    357
```

![landmarks validation](confusion_landmarks_validation.png)

Time per frame: median 0.81 ms, p90 1.47 ms (measured while other programs shared the CPU: not a final speed).

### yolox - validation set

_YOLOX alone (saved video frames; best seal >= SEAL_MIN_SCORE, no hand check, no 2-in-a-row)_

From 3 recordings: me_day_20261030_175251, me_night_20261030_222524, me_night_20261030_222754

| sign | precision | recall | F1 | frames (true) | frames (said) |
|---|---|---|---|---|---|
| idle | 100.0% | 99.8% | 0.999 | 552 | 551 |
| horse | 0.0% | - | - | 0 | 1 |

```
true / said       idle    ram  snake  tiger    dog monkey   boar  horse
idle               364      0      0      0      0      0      0      1
rasengan_palm      187      0      0      0      0      0      0      0
```

YOLOX has no class for idle, clone_seal or rasengan_palm: for those recordings the right answer is `idle` (no seal).

![yolox validation](confusion_yolox_validation.png)

Time per YOLOX run: median 38.8 ms, p90 49.3 ms (measured while other programs shared the CPU: not a final speed).

### fused - validation set

_fused, as in the app (SignFusion replayed in time: hands + classifier + YOLOX at SEAL_RATE_HZ)_

From 3 recordings: me_day_20261030_175251, me_night_20261030_222524, me_night_20261030_222754

| sign | precision | recall | F1 | frames (true) | frames (said) |
|---|---|---|---|---|---|
| idle | 100.0% | 100.0% | 1.000 | 731 | 731 |
| rasengan_palm | 100.0% | 100.0% | 1.000 | 357 | 357 |

```
true / said       idle    ram  snake  tiger    dog monkey   boar  horse  clone   palm
idle               731      0      0      0      0      0      0      0      0      0
rasengan_palm        0      0      0      0      0      0      0      0      0    357
```

![fused validation](confusion_fused_validation.png)

Time per frame: median 0.08 ms, p90 0.13 ms (measured while other programs shared the CPU: not a final speed).

### landmarks - train set

_landmark classifier alone (frames where MediaPipe found a hand)_

No frames: trained on this recording

### yolox - train set

_YOLOX alone (saved video frames; best seal >= SEAL_MIN_SCORE, no hand check, no 2-in-a-row)_

From 16 recordings: me_day_20261030_174647, me_day_20261030_174917, me_day_20261030_175113, me_night_20261030_214750, me_night_20261030_215059, me_night_20261030_215447, me_night_20261030_215808, me_night_20261030_220040, me_night_20261030_220235, me_night_20261030_220443, me_night_20261030_220610, me_night_20261030_220743, me_night_20261030_221934, me_night_20261030_222121, me_night_20261030_222258, me_night_20261030_222645

| sign | precision | recall | F1 | frames (true) | frames (said) |
|---|---|---|---|---|---|
| idle | 99.4% | 100.0% | 0.997 | 1552 | 1562 |
| ram | 100.0% | 98.4% | 0.992 | 192 | 189 |
| snake | 100.0% | 97.4% | 0.987 | 194 | 189 |
| tiger | 100.0% | 99.5% | 0.997 | 190 | 189 |
| dog | 100.0% | 99.5% | 0.997 | 198 | 197 |
| monkey | 100.0% | 100.0% | 1.000 | 437 | 437 |
| boar | 100.0% | 100.0% | 1.000 | 175 | 175 |
| horse | 100.0% | 100.0% | 1.000 | 191 | 191 |

```
true / said       idle    ram  snake  tiger    dog monkey   boar  horse
idle               788      0      0      0      0      0      0      0
ram                  3    189      0      0      0      0      0      0
snake                5      0    189      0      0      0      0      0
tiger                1      0      0    189      0      0      0      0
dog                  1      0      0      0    197      0      0      0
monkey               0      0      0      0      0    437      0      0
boar                 0      0      0      0      0      0    175      0
horse                0      0      0      0      0      0      0    191
clone_seal         187      0      0      0      0      0      0      0
rasengan_palm      577      0      0      0      0      0      0      0
```

YOLOX has no class for idle, clone_seal or rasengan_palm: for those recordings the right answer is `idle` (no seal).

![yolox train](confusion_yolox_train.png)

Time per YOLOX run: median 30.61 ms, p90 35.55 ms (measured while other programs shared the CPU: not a final speed).

### fused - train set

_fused, as in the app (SignFusion replayed in time: hands + classifier + YOLOX at SEAL_RATE_HZ)_

No frames: trained on this recording

## 4. Every recording

| set | recording | sign | hands found | landmarks | yolox | fused | signs confirmed by the controller | jutsu fired |
|---|---|---|---|---|---|---|---|---|
| validation | me_night_20261030_222524 | idle | 100.0% | 100.0% | 99.4% | 100.0% | - | none |
| validation | me_night_20261030_222754 | idle | 100.0% | 100.0% | 100.0% | 100.0% | - | none |
| validation | me_day_20261030_175251 | rasengan_palm | 100.0% | 100.0% | 100.0% | 100.0% | rasengan_palm | none |
| train | me_night_20261030_221934 | idle | 25.2% | skipped | 100.0% | skipped | - | none |
| train | me_night_20261030_222121 | idle | 94.4% | skipped | 100.0% | skipped | - | none |
| train | me_night_20261030_222258 | idle | 97.2% | skipped | 100.0% | skipped | - | none |
| train | me_night_20261030_222645 | idle | 98.4% | skipped | 100.0% | skipped | - | none |
| train | me_night_20261030_220443 | ram | 100.0% | skipped | 98.4% | skipped | - | none |
| train | me_night_20261030_220610 | snake | 100.0% | skipped | 97.4% | skipped | - | none |
| train | me_night_20261030_220235 | tiger | 100.0% | skipped | 99.5% | skipped | - | none |
| train | me_night_20261030_215059 | dog | 100.0% | skipped | 99.5% | skipped | - | none |
| train | me_night_20261030_215447 | monkey | 35.8% | skipped | 100.0% | skipped | - | none |
| train | me_night_20261030_215808 | monkey | 93.3% | skipped | 100.0% | skipped | - | none |
| train | me_night_20261030_220743 | boar | 100.0% | skipped | 100.0% | skipped | - | none |
| train | me_night_20261030_220040 | horse | 100.0% | skipped | 100.0% | skipped | - | none |
| train | me_night_20261030_214750 | clone_seal | 100.0% | skipped | 100.0% | skipped | - | none |
| train | me_day_20261030_174647 | rasengan_palm | 100.0% | skipped | 100.0% | skipped | - | none |
| train | me_day_20261030_174917 | rasengan_palm | 100.0% | skipped | 100.0% | skipped | - | none |
| train | me_day_20261030_175113 | rasengan_palm | 100.0% | skipped | 100.0% | skipped | - | none |

"signs confirmed" = what the GestureStabilizer accepted (held long enough); holding one sign should confirm exactly that sign once.

## 5. Jutsu (sequence level)

**Single-sign sessions replayed through the controller:** 3 sessions, 1.0 minutes, **0 jutsu fired** (should be 0: one held sign can never complete a 4-sign jutsu).

**Guided sequence takes:** none recorded yet (data/sequences is empty). Record them with `record_sequences.py`, run `python evaluate.py splits`, then evaluate again.

## 6. Warnings and caveats

- Signs without any test recording yet: idle, ram, snake, tiger, dog, monkey, boar, horse, clone_seal, rasengan_palm. They have no honest test number.
- Only one recording evaluated for: boar, clone_seal, dog, horse, ram, snake, tiger. One recording = one person, one day, one light: treat those numbers as a smoke test.
- All evaluated recordings come from day 2026-10-30, night 2026-10-30: nothing here says how the app does in other light or on other days.
- YOLOX sees the saved 480p reference video (mp4), not the live 720p camera frame: pixels differ a little from the app's.
- Hands come from the landmarks saved while recording (MediaPipe on the live 720p frame), as the app would have them; MediaPipe itself is not re-run.

## 7. How to read this report

- **Precision** of a sign: when the recogniser said it, how often was it right? Low = effects fire by mistake.
- **Recall** of a sign: of the frames that really were that sign, how many were found? Low = you do the sign and nothing happens.
- **Confusion matrix**: rows = the sign that was really recorded, columns = what was said. The outlined cell is the right answer; everything else in the row is a mistake.
- **Frame level** numbers are strict: a single wrong frame counts. The app smooths over frames, which is why section 5 (what the user actually sees) matters too.
- Numbers from few recordings move a lot: one recording per sign is a smoke test, not a measurement.
- More: docs/14_evaluation.md.

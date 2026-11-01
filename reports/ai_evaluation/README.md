# SHINOBI AI — AI evaluation report (2026-11-01)

> **There is no held-out TEST set yet.** `data/splits.json` holds 19 recordings: 16 train, 3 validation, **0 test**,
> and there are no guided sequence takes (`data/sequences/` does not exist). So **no number in this report is a final
> test result.** Every section says which recordings it comes from and how much it can be trusted. Read the grades
> below first.

| evidence grade | what it is | used for |
|---|---|---|
| **Held-out, validation** | the 3 validation recordings (2 idle, 1 rasengan_palm). The landmark model never learned from them, but they were used to choose it. | landmark classifier and fused, sections 2a and 2c |
| **Never trained** | 10 clips that are in no split and that nothing ever learned from: 4 claw hand, 4 OK sign (old labels `chidori` and `fire`, which the splits ignore) and 2 two-open-palms (`data/_discarded`) | false positives and false activations, sections 2 and 3 |
| **Unseen by YOLOX** | the 16 train recordings. YOLOX was trained elsewhere and never on our data, but its thresholds were tuned while these recordings existed, so this is validation-grade, not test. | YOLOX, section 2b; the fused seal path, section 2c |
| **Cross-validation** | leave-one-recording-out (LORO) for the landmark classifier: each recording is scored by a model refitted without it, in memory only | landmark classifier, section 2a |
| **Spliced / simulated** | performances cut together from the recordings above, plus a simulation of the matcher alone | sequence level, section 3 |

Files: `metrics.json` (all numbers), `parts/*.json` (raw output of each part), the PNGs named below,
`evaluate_py/2026-11-01_002744/` (run A) and `evaluate_py_yolox_path/2026-11-01_003038/` (run B).
Run B is `evaluate.py` without the landmark model. The tool: `tools/evaluate_pipeline.py` (section 6).

---

## 1. Data and splits

All recordings are from **one person ("me"), on 2026-10-30, with one webcam**. Each is about 20 s long, with hand
landmarks at about 17 frames/s and a saved video at about 10 frames/s.

| sign | recordings | set (data/splits.json) | lighting |
|---|---|---|---|
| idle (hands visible, no sign) | 6 | 4 train, **2 validation** | night |
| ram, snake, tiger, dog, boar, horse | 1 each | train | night |
| monkey | 2 | train | night |
| clone_seal | **1** | train | night |
| rasengan_palm | 4 | 3 train, **1 validation** | day |
| *never trained:* claw hand | 4 | not in the splits (old label `chidori`) | day |
| *never trained:* OK sign | 4 | not in the splits (old label `fire`) | day |
| *never trained:* two open palms | 2 | `data/_discarded` (recorded under a wrong name) | day |

- **Landmark model:** `models/gesture_model.joblib`, a random forest trained by `train.py` on the 16 train
  recordings. Its `training_report.txt` says validation could not compare the models fairly, so the default was
  used. It decides **clone_seal** and **rasengan_palm** in the app.
- **YOLOX:** `models/yolox_nano.onnx`, pretrained by Kazuhito00 / NARUTO-HandSignDetection and **never trained on
  our recordings**. It decides the **7 official seals**. The licence of its weights and training data is unclear
  (personal and educational use only; see `models/THIRD_PARTY_YOLOX.md`).
- **Thresholds** (`shinobi/config.py`): SEAL_MIN_SCORE 0.70, SEAL_CONFIRM 2, LANDMARK_MIN_PROB 0.60, CONF_ON 0.75,
  HOLD_SECONDS 0.30, SEQUENCE_MAX_GAP 7.0 s (Live; none in Practice), COOLDOWN_SECONDS 1.5.
- **Scoring:** the first 0.5 s of every session are not scored, as in `evaluate.py`.

---

## 2. Per-sign metrics (frame level)

### 2a. Landmark classifier (decides clone_seal and rasengan_palm in the app)

**Held-out validation, installed model** (run A, 3 recordings, 1088 frames). It is perfect, but these recordings
chose the model and only 2 classes exist:

| sign | precision | recall | F1 | support (frames) |
|---|---|---|---|---|
| idle | 1.000 | 1.000 | 1.000 | 731 |
| rasengan_palm | 1.000 | 1.000 | 1.000 | 357 |

Confusion: `evaluate_py/2026-11-01_002744/confusion_landmarks_validation.png`.

**Leave-one-recording-out, all 19 recordings** (`parts/loro.json`, `confusion_landmarks_loro.png`). Only signs with
**two or more** recordings can be estimated: idle, monkey and rasengan_palm (3640 frames).

| sign | precision | recall | F1 | support |
|---|---|---|---|---|
| idle | 0.974 | 0.966 | 0.970 | 1824 |
| monkey | 0.940 | **0.628** | 0.753 | 427 |
| rasengan_palm | 0.991 | 1.000 | 0.996 | 1389 |
| **all three** | accuracy 0.939 | macro-F1 0.906 | balanced accuracy 0.865 | 3640 |

- **Monkey:** the held-out recording `me_night_20261030_215447` was named *dog* in 112 of 122 frames. The landmark
  classifier alone does not generalise across monkey recordings. In the app YOLOX decides monkey, so this does not
  change the app's monkey decisions.
- **Signs with one recording** (ram, snake, tiger, dog, boar, horse, **clone_seal**): when their only recording is
  held out, the sign is absent from training, so its frames cannot be right. These rows only show what each is
  mistaken for (e.g. clone_seal → idle 47 %, ram 39 %, tiger 14 %). **clone_seal has no honest accuracy estimate of
  any kind.**

**Never-trained negatives**: the right answer for every frame is idle.

| clips | frames | said idle | said rasengan_palm |
|---|---|---|---|
| claw hand (4) | 1322 | 98.3 % | 22 frames (1.7 %) |
| **OK sign (4)** | 1286 | 16.4 % | **1075 frames (83.6 %)** |
| two open palms (2) | 659 | 100 % | 0 |

### 2b. YOLOX seal detector (decides the 7 official seals in the app)

**On the 16 train recordings**, which YOLOX never trained on (run A, 3129 scored video frames). This is YOLOX
alone: the best seal with score ≥ 0.70, with no hand check and no 2-in-a-row rule.

| sign | precision | recall | F1 | support |
|---|---|---|---|---|
| ram | 1.000 | 0.984 | 0.992 | 192 |
| snake | 1.000 | 0.974 | 0.987 | 194 |
| tiger | 1.000 | 0.995 | 0.997 | 190 |
| dog | 1.000 | 0.995 | 0.997 | 198 |
| monkey | 1.000 | 1.000 | 1.000 | 437 |
| boar | 1.000 | 1.000 | 1.000 | 175 |
| horse | 1.000 | 1.000 | 1.000 | 191 |
| no seal (idle, clone_seal, palm frames) | 0.994 | 1.000 | 0.997 | 1552 |
| **all** | accuracy **0.997** | macro-F1 **0.996** | balanced accuracy 0.994 | 3129 |

- **Mistakes:** YOLOX never named the wrong seal. Every miss became "no seal" (3 ram, 5 snake, 1 tiger, 1 dog
  frame).
- **Held-out validation** (552 frames): 99.8 % (one *horse* frame on an idle recording).
- **Never-trained negatives:** 2 seal frames out of 2343 (0.09 %; one *snake* on an OK sign, one *horse* on idle).
  Neither was ever confirmed.
- **Speed:** median 30.6 ms per run, p90 35.6 ms (offline, 3217 runs; the CPU was shared, see section 4).
- Confusion: `evaluate_py/2026-11-01_002744/confusion_yolox_train.png` and `confusion_yolox_validation.png`.

### 2c. Fused decision, as the app makes it (SignFusion + stabilizer → confirmed signs)

**Held-out validation, installed model** (run A, 1088 frames):
- Every frame was right: idle 731/731, rasengan_palm 357/357.
- The stabilizer confirmed rasengan_palm once, 0.48 s after the start, and confirmed nothing on the idle
  recordings. No jutsu fired.

**Seal path on the seal recordings** (run B: fusion **without** the landmark model, because the installed model was
trained on these recordings). This is the closest honest proxy for the app's seal decisions; the 2-in-a-row and
hand checks make recall slightly lower than YOLOX alone.

| sign | precision | recall | F1 | support | first confirmation | wrong confirmations |
|---|---|---|---|---|---|---|
| ram | 1.000 | 0.977 | 0.988 | 346 | 0.62 s | 0 |
| snake | 1.000 | 0.960 | 0.980 | 350 | 0.57 s | 0 |
| tiger | 1.000 | 0.993 | 0.997 | 307 | 0.66 s | 0 |
| dog | 1.000 | 0.991 | 0.995 | 334 | 0.70 s | 0 |
| monkey | 1.000 | 0.985 | 0.992 | 668 | 0.65–0.70 s | 0 |
| boar | 1.000 | 1.000 | 1.000 | 339 | 0.59 s | 0 |
| horse | 1.000 | 1.000 | 1.000 | 338 | 0.61 s | 0 |

- Run B cannot name clone_seal or rasengan_palm, so its overall line (accuracy 0.738, macro-F1 0.762) is not a
  quality number. Use the per-seal rows.
- Confusion: `evaluate_py_yolox_path/2026-11-01_003038/confusion_fused_train.png`.

**Never-trained negatives, installed model** (`parts/negatives.json`):

| clips | duration | fused said idle | fused said rasengan_palm | signs confirmed |
|---|---|---|---|---|
| claw hand (4) | 80 s | 99.6 % | 5 frames (0.4 %) | none |
| **OK sign (4)** | 80 s | 24.9 % | **966 of 1286 frames (75.1 %)** | **rasengan_palm in 4 of 4 clips** |
| two open palms (2) | 40 s | 100 % | 0 | none |
| idle, held-out validation (2) | 40 s | 100 % | 0 | none |

---

## 3. Sequence level (current matcher)

The current matcher keeps a counter per jutsu. A wrong sign keeps the progress. Live has a 7 s limit between
confirmed steps; Practice has none.

No guided takes exist, so performances are **spliced** from the recordings (`parts/sequences.json`):
- 1.5 s of idle lead-in, then each sign held 1.6–2.6 s, with **0.4–1.2 s of idle between signs**, then 3 s of idle.
- Windows are chosen at random.
- The held-out recording is used where one exists (idle, rasengan_palm). Everything else comes from train
  recordings.

### True activations, 40 performances per jutsu and mode

| jutsu | signs decided by | Live | Practice | wrong jutsu | last sign → activation (median / p90 / max) |
|---|---|---|---|---|---|
| Fire Style | YOLOX ×4 | **40/40** (40/40 without landmark model) | 40/40 (40/40) | 0 | 0.74 / 0.89 / 1.27 s |
| Chidori | YOLOX ×4 | **40/40** (40/40) | 40/40 (40/40) | 0 | 0.75 / 0.81 / 0.84 s |
| Shadow Clone | YOLOX ×3 + landmarks (clone_seal: **its training recording**) | **40/40** | 40/40 | 0 | 0.45 / 0.48 / 0.51 s |
| Rasengan | landmarks (clone_seal: training rec.; palm: held-out rec.) + YOLOX ×2 | **40/40** | 40/40 | 0 | 0.48 / 0.51 / 0.53 s |

- "last sign → activation" is measured from the first frame of the last sign. It is the hold plus the
  confirmation: YOLOX needs 2 results in a row, then the 0.3 s hold.
- In every trial the first four confirmed signs were exactly the sequence.
- **All four back to back** (Live, 25 streams in random order, 2–4 s apart): **100 of 100** fired as expected,
  0 missed, **0 wrong or extra activations**.

**Unsure:** these 100 % rates are an upper bound for *these* recordings, not a claim for new users. Real transitions
between seals (hands moving through other shapes) are not in the data. Clone_seal frames come from the very
recording its model learned from.

### False activations (a jutsu fires that the user did not perform)

| footage | mode | activations | exposure | rate |
|---|---|---|---|---|
| never-trained negatives + held-out idle (claw, OK sign, two palms, idle) | Live | **0** | 4.0 min | 0 / h (95 % upper bound **45 / h**) |
| same | Practice (each jutsu) | **0** | 4.0 min each | 0 / h (≤ 45 / h) |
| random signs, spliced from the recordings (399 confirmed signs) | Live | **0** | 20.0 min | 0 / h (≤ 9 / h) |
| same | Practice | Fire 14, Chidori 12, Shadow Clone 12, Rasengan 10 | 20.0 min each | 30–42 / h, **by design** |
| matcher alone, random signs every 1.8–3.6 s (perfect recognition, 200 h simulated) | Live | 1.34–1.46 per jutsu | 200 h | **5.5 / h** in total |
| same, **previous rule** (a wrong sign reset the chain), for comparison | Live | 0.26–0.33 per jutsu | 200 h | **1.2 / h** in total |
| same | Practice | ~37 per jutsu | 200 h | ~37 / h, by design |

- **Wrong-jutsu activations:** 0 in all 480 single-jutsu performances and in the 100 mixed ones.
- The rule approved on 2026-11-01 (a wrong sign keeps the progress) makes chance completions about **4.7×**
  more likely in Live than the previous rule when someone makes signs in no particular order. Recognition is
  assumed perfect in that simulation (**unsure**: real rates depend on how often wrong signs are confirmed).
- In Practice a jutsu completes whenever its four signs appear in order, however long it takes. That is what
  Practice is for, but random signing completes it about every 1.5–2 min.

---

## 4. Speed: FPS and per-stage timings (the real server)

**Setup** (`parts/fps.json`, `fps_stages.png`):
- `python -m shinobi.server --port 8003`, fed the 1280×720 camera fixtures at 15 fps over the WebSocket like a
  browser (one frame in flight, JPEG 80).
- The fixtures are the user's recordings spliced into the four sequences; each jutsu fires twice.
- Measured 2026-11-01 00:51 on this 8-core machine **while other agents were running builds and tests**.

All values in ms, as median / p90; "capacity" is 1000 / median total.

| condition | frames | answered fps | total | capacity | decode | hands | model | fx | encode | YOLOX (thread) | segmentation (thread) | round trip |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| no effect | 596 | 11.9 | 66 / 92 | 15.1 | 8.4 / 9.4 | 45.6 / 71.7 | 0.9 / 1.4 | 0 | 9.3 / 9.9 | 32.4 / 37.7 | – | 84 / 110 |
| Fire | 126 | 9.6 | 90 / 125 | 11.2 | 8.3 / 8.8 | 43.5 / 70.4 | 0.1 / 1.3 | 28.2 / 39.5 | 9.2 / 9.9 | 32.5 / 40.0 | – | 107 / 141 |
| Chidori | 129 | 9.8 | 97 / 133 | 10.4 | 8.2 / 9.0 | 38.1 / 71.4 | 0.5 / 1.1 | 32.6 / 49.9 | 9.3 / 10.1 | 32.9 / 40.5 | – | 115 / 152 |
| Shadow Clone (10 clones) | 161 | 9.3 | 87 / 121 | 11.5 | 8.5 / 8.9 | 46.2 / 70.6 | 0.7 / 1.3 | 19.1 / 39.3 | 9.7 / 11.1 | 39.1 / 44.6 | 46.4 / 71.2 | 107 / 140 |
| Rasengan | 161 | 12.0 | 63 / 106 | 15.8 | 8.7 / 10.1 | 31.2 / 61.3 | 0.1 / 1.3 | 11.6 / 27.1 | 9.1 / 10.4 | 33.0 / 41.3 | – | 81 / 127 |

- **Hand tracking** (MediaPipe, 31–46 ms) is the largest cost. YOLOX and segmentation run on their own threads at
  the same time, so they are not added to the total.
- **Chidori** is the most expensive effect (33 ms median for effect drawing).
- **Unsure:**
  - All speeds are relative: the CPU was shared.
  - Another agent changed the effects code and `engine.py` between 00:25 and 00:31, just before this measurement
    (the file times are in `parts/fps.json`). The engine now starts effects *staged*, so "during effect" frames
    include the new build-up stages as well as the main effect.
  - The landmark model adds about 0.8 ms per frame (offline, median).

---

## 5. Limitations (read before quoting any number)

1. **No test set.** The protocol in `splits.py` (one test recording per sign, from a day and lighting no train
   recording uses) has not been recorded yet. Every number here is validation-grade or weaker.
2. **One person, one day, one camera.** Seals and idle were recorded at night and the palm in the day. There is
   one recording per seal, about 20 s each. Nothing here says how the AI works for other people, rooms or cameras.
3. **clone_seal:** a single recording, and it is in train. There is **no honest accuracy estimate**. Shadow Clone
   and Rasengan sequence results reuse that recording.
4. **rasengan_palm false positives:** an OK sign is called palm in **75 %** of frames, and palm was confirmed in
   **4 of 4** OK-sign clips. A claw hand rarely (0.4 %); two open palms never. All palm recordings share one day
   and one lighting. A Rasengan still needs clone_seal → dog → horse first, so this alone fired nothing.
5. **Landmark classifier on seals:** LORO recall for monkey is only 0.63, and other seals cannot be estimated. The
   app relies on YOLOX for seals. With the landmark model in the loop, it could still confuse a seal with
   clone_seal or palm on unseen data, and **that cannot be measured** until held-out seal recordings exist.
6. **YOLOX:** it was never trained on our data, but the thresholds were tuned with these recordings present. Its
   weights and training data are not clearly licensed.
7. **Spliced sequences:** transitions are idle gaps, so spurious confirmations while the hands move between seals
   are not measured. The 100 % activation rates are upper bounds for these recordings.
8. **Short negative exposure:** 4 min of never-trained negatives and 20 min of random streams. The 95 % upper
   bounds are wide (45 / h and 9 / h).
9. **Chance completions:** the approved rule (a wrong sign keeps the progress) raises them: about 5.5 / h in Live
   with random signing vs about 1.2 / h under the previous rule (simulation with perfect recognition). In Practice,
   random signing completes a jutsu every 1.5–2 min, by design.
10. **FPS:** measured on a shared CPU, with effect code that had just changed. Treat it as relative.
11. **Browser tests are not an independent evaluation:** the e2e camera fixtures are built from the same train
    recordings.

**What to record next for a real test:**
- One new recording per sign on another day and lighting. `python evaluate.py splits` will put it in *test*
  automatically.
- At least 3 more clone_seal recordings.
- Guided sequence takes per jutsu, correct and negative (`record_sequences.py`).
- OK-sign and open-hand footage as negatives for rasengan_palm.
- If possible, a second person.

---

## 6. How train/test separation was ensured, and how to reproduce

- **evaluate.py's leakage guard.** The landmark model stores its `train_sessions`. `evaluate.py` skips the
  landmark and fused scoring on any of those recordings, so in run A the landmark model was scored only on the 3
  validation recordings. Run B uses **no** landmark model at all.
- **LORO.** Each recording is scored by a random forest refitted without it, with `train.py`'s own features,
  augmentation and settings. This happens in memory; nothing is saved and the installed model is untouched.
- **Never-trained clips.** Their labels are ignored by `splits.py` and `train.py` (`chidori`, `fire`), or they sit in
  `data/_discarded`, which nothing reads. No model ever learned from them.
- **Nothing was written** into `data/`, `models/` or `data/splits.json`. The YOLOX results of each clip were cached
  outside the repository, because the clips show the user.

Commands (from the project folder; `CACHE` = a folder outside the repository):

```
python evaluate.py run --sets validation,train --out reports/ai_evaluation/evaluate_py
python evaluate.py run --sets validation,train --model none --recognizers fused --out reports/ai_evaluation/evaluate_py_yolox_path
python tools/evaluate_pipeline.py negatives --cache CACHE
python tools/evaluate_pipeline.py loro
python tools/evaluate_pipeline.py sequences --cache CACHE
python tools/evaluate_pipeline.py montecarlo
python -m shinobi.server --port 8003        # in another terminal, then:
python tools/evaluate_pipeline.py fps --url ws://127.0.0.1:8003/ws --fixtures <folder with the e2e .y4m fixtures>
python tools/evaluate_pipeline.py figures
python tools/evaluate_pipeline.py summary   # metrics.json
```

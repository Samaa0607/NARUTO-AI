# Diagnostic report: why the independent evaluation scored low (2026-11-01)

Diagnostic only. Nothing was changed: the model, thresholds, fusion logic, jutsu sequences, recordings and
`data/splits.json` are untouched (`splits.json` md5 `0ae4d596…` before and after every script). No
retraining. No recording was moved, relabelled or deleted. Every script only reads the data and writes into
this folder (`scripts/`, `evidence/`).

The test set was used only to explain *why* a sign failed. It was not used to choose any threshold,
rule or configuration, and no new accuracy is claimed here.

## 1. Findings in short

1. **Three of the 22 test recordings do not show what their label says.**
   - `tiger/me_day_20261101_140826`: no Tiger at all. She holds a phone and touches her face for all 20 s.
   - `ram/me_day_20261101_140631`: Ram only for the first ~9 s. Then no hands (10–14 s), then a hand on her mouth.
   - `idle/me_day_20261101_141753`: this was meant to show an OK sign. It shows open palms with spread fingers, which is the Rasengan palm.
   - The first two were recorded by the old recorder version, before the 14:12:57 fix, when it ran ahead without waiting for her.
2. **The Rasengan palm was performed with two hands in both test recordings** (two hands in 83% of frames).
   - The definition ("one hand: open palm toward camera") and all 4 training/validation palm recordings use one hand (two hands in 0% of frames).
   - The classifier reads two open palms as `idle`. On the one-palm seconds it is right (p 0.95–1.00).
3. **The camera setup changed between training and test.**
   - Training (Oct 30): camera at face level, facing her.
   - Test (Nov 1): camera low and tilted up (ceiling and window visible), bright window light.
   - YOLOX was never trained on our data, yet its Ram/Tiger/Snake/Dog scores collapse on Nov 1. So the conditions changed, not just our model.
   - Monkey, Boar and Horse stay at 90–100%.
4. **The two models fail on different signs, but fusion listens to only one of them per sign.**
   - YOLOX owns the 7 seals. On correctly performed test recordings the landmark model was right on Ram 91%, Tiger 75% and Dog 95–100%, where YOLOX was at 0–27%.
   - The landmark model is wrong on Snake (0–6%) and on one Boar recording (3.5%), where YOLOX is right.
5. **Clone Seal is rejected mainly by the old `LANDMARK_MIN_PROB = 0.60`, not by the new margin rule.**
   - The classifier ranks clone_seal first in 95% of frames, but only with p ≈ 0.47 (runner-up: tiger).
   - In the test recordings the top hand of the seal is cut off at the top edge of the frame.
   - Only one clone_seal recording exists outside the test set (in train).
6. **There is too little data to measure anything outside the test set.**
   - Every sign has 1 training recording (monkey 2, palm 3, idle 4), all from one session.
   - Validation has only idle ×2 and palm ×1. So no threshold or fusion rule can be chosen fairly today.

## 2. Priority 1: Clone Seal and the fusion rules

### 2.1 How the landmark path decides (shinobi/fusion.py, unchanged)

A landmark sign (clone_seal, rasengan_palm) is used only when all of these hold:
- the classifier's top class is that sign;
- `p >= LANDMARK_MIN_PROB (0.60)`;
- the margin over the runner-up is `>= LANDMARK_MIN_MARGIN (0.30)` (added this session);
- for the palm only: the 3D open-palm gate passes (`PALM_MIN_THUMB_GAP 0.60`, added this session).

Then the GestureStabilizer must hold it (EMA ≥ 0.75) before a step counts.

### 2.2 Ablation on train + validation only (scripts/ablation.py, evidence/ablation.json)

Same replay as `evaluate.py` (SignFusion + ActionController in time, YOLOX through the app's SealWorker).
The variants are passed as constructor arguments only. Frame recall per class:

| set | class | current | no margin | before session (no margin, no gate) | landmarks only (app's YOLOX-off mode) | YOLOX only |
|---|---|---|---|---|---|---|
| train* | clone_seal | 100% | 100% | 100% | 100% | 0% |
| train* | rasengan_palm | 100% | 100% | 100% | 100% | 0% |
| train* | ram / tiger / snake / dog | 97.7 / 99.3 / 96.0 / 99.1% | same | same | 98.3 / 99.3 / 100 / 97.0% | 97.7 / 99.3 / 96.0 / 99.1% |
| train* | monkey / boar / horse | 98.5 / 100 / 100% | same | same | 63.0 / 99.4 / 100% | 98.5 / 100 / 100% |
| train* | idle (precision) | 97.5% | 97.5% | 97.5% | 84.2% | 49.7% |
| validation | rasengan_palm (1 rec) | 100% | 100% | 100% | 100% | 0% |
| validation | idle (2 rec) | 100% | 100% | 100% | 100% | 100% |

\* The landmark model learned these training recordings, so every landmark-based train number is inflated (evaluate.py refuses to score them for that reason). Only the YOLOX-only column is fair on train.

- The margin rule rejected **0 frames** in all 19 train + validation recordings. Every config confirmed exactly the right sign once per recording.
- So on train + validation the rule changes nothing: no damage, and no measurable benefit.
- **Clone seal cannot be measured on train + validation.** Its only non-test recording is in train, which the model memorized. Validation has none.

### 2.3 Why clone_seal is rejected (test used only to explain; evidence/diagnosis.json part B)

Clone seal test frames: 696.

| step | share of frames |
|---|---|
| classifier's top class = clone_seal | 95.3% |
| … and p ≥ 0.60 (the rule before this session) | 8.1% of those |
| … and margin ≥ 0.30 (current rule) | 6.6% of those |
| median p(clone_seal) / median margin | 0.47 / 0.065 |
| top class when wrong | tiger (33 frames) |
| signs confirmed by the controller | none, in both recordings |

- About 92% of the loss comes from the old 0.60 threshold. The new margin rule removes another ~1.5 points.
- The scattered frames that pass are too few to hold the stabilizer, so the step never confirms.
- The cause is low classifier confidence on new conditions:
  - Only 1 training recording (one framing, one session).
  - In both test recordings the camera points at her chest. The horizontal top hand sits at the frame's top edge and is partly cut off (`evidence/sheet_clone_seal.png`; hand centre y = 0.33/0.39 vs 0.55 in training). MediaPipe has to guess the hidden finger positions.

### 2.4 Rasengan palm (test used only to explain)

- Test palm frames: 688. The classifier picks rasengan_palm in 16.9% of them and **idle in 572 frames (83%)**.
- When it picks the palm: p 0.98, margin 0.97, gate passes 100%. So the margin rule and the gate are not the cause.
- The cause is the second hand (`evidence/sheet_rasengan_palm.png`):
  - In the test she shows two open palms.
  - The features include the second hand and the between-hands block. Training never had a two-hand palm, and idle training includes two-hands-raised poses.
- **The OK-vs-palm question is still untested.** The 17% "palm on idle" false positives come from `idle/141753`. That recording shows open palms, not an OK sign (`evidence/idle_ok_close.png`), so most of them are correct readings of a real palm. No recording in the set shows a real OK sign.

### 2.5 Does the margin rule damage other gestures?

No.
- It only acts on frames whose top class is clone_seal or rasengan_palm, and only removes a landmark claim.
- The 7 seals come from YOLOX and are not affected.
- On the 7 seal classes, no config produced a landmark output. On test idle frames the palm outputs are 17.1% in every config: the margin rule and the gate neither add nor remove them. On train + validation it never fired.
- Its only measurable effect is the small extra Clone Seal loss on the new data (8.1% → 6.6% of top-class frames).

**Recommendation:** leave it for now. Decide on it with a real validation set (section 6), not with these test numbers.

## 3. Priority 2: recording quality of the first-round Ram and Tiger

Evidence: `evidence/first_ram_dense.png`, `evidence/first_tiger_dense.png`, `evidence/sheet_ram.png`,
`evidence/sheet_tiger.png`, `evidence/timeline.json` (per 2 s).

| question | Ram 140631 (1st round) | Tiger 140826 (1st round) | Ram 141955 (2nd) | Tiger 142054 (2nd) |
|---|---|---|---|---|
| sign performed correctly? | yes for 0–9 s, then **no sign** (no hands 10–14 s, hand on mouth 14–20 s) | **no: no Tiger at any time** (phone in hand, touching face) | yes, whole recording | yes, whole recording |
| both hands visible to MediaPipe | 3% of frames (hands overlap from the low angle) | 9% | 11% | 23% |
| camera angle | low, looking up; hands in front of the face | low, off to the side; she is looking at the phone | low, looking up | low, looking up |
| useful frames | ~40–45% (about 8–9 s of 20 s) | **0%** | ~100% | ~100% |
| label matches the content? | half of it | **no** (the content is idle) | yes | yes |
| YOLOX true-seal score ≥ 0.70 | 14% | 0% | 27% | 11% |
| landmark top class correct | 33.5% | 1.8% | 91.3% | 75.2% |
| fused (app) | 7.8% | 0.0% | 23.3% | 6.7% |

- Both first-round recordings were saved by the old recorder version (before the resume at 14:12:57). That version counted down whether or not she was ready, and only checked that *a hand* was visible, not that the sign was made.
- The hands check passed (72% / 81%) because her hands were visible holding the phone or touching her face. The current recorder waits for the hands but still does not check the gesture itself.
- Training conditions (same signs, Oct 30): camera at face level, frontal, both hands seen 86% (ram) / 65% (tiger), YOLOX ≥ 0.70 in 97% / 100% of frames.
- Nothing was deleted, replaced or relabelled. That is a decision for you (section 6).

## 4. Priority 3: causes per weak gesture

Test per recording (from `reports/2026-11-01_144049/summary.md` §4) plus the evidence above:

| gesture | fused recall | landmark top-class (per rec) | YOLOX (per rec) | main causes | not the cause |
|---|---|---|---|---|---|
| **ram** | 15.3% | 33.5% / 91.3% | 11.0% / 26.4% | (1) recording 1 half without the sign; (2) camera angle: YOLOX drops from 97% to 14–27% ≥ 0.70, hands overlap; (3) fusion ignores the correct landmark answer (91%) | class imbalance (354 train frames, like the other seals) |
| **tiger** | 3.5% | 1.8% / 75.2% | 0.0% / 13.7% | (1) recording 1 has no Tiger; (2) camera angle: YOLOX median score 0.29 on the good recording; (3) fusion ignores the landmark answer (75%); (4) ram/tiger look alike (landmark model drifts to ram after 14 s) | thresholds alone |
| **snake** | 24.5% | 0% / 6.5% | 16.0% / 49.4% | (1) camera/lighting: YOLOX finds Snake but scores mostly 0.40–0.70 (median 0.47 / 0.69 vs 0.91 in training), under SEAL_MIN_SCORE 0.70 + 2 in a row; (2) the landmark model does not generalize (1 training recording, calls it idle) | execution (correct, both hands seen 95–100%) |
| **dog** | 12.6% | 100% / 95.0% | 27.3% / 0.0% | (1) camera angle: from below the flat top hand is edge-on, and YOLOX never finds it in recording 2; (2) fusion ignores the landmark model, which is right 95–100% | data amount for landmarks, execution |
| **clone_seal** | 6.2% | 93.3% / 97.0% (top class) | – | (1) low confidence (p ≈ 0.47) → old p ≥ 0.60 rule; (2) top hand cut off at the frame edge; (3) 1 training recording; (4) margin rule: small extra loss | YOLOX (not its job), palm gate |
| **rasengan_palm** | 15.1% | 15.5% / 14.8% | – | (1) performed with two hands, but defined and trained with one; (2) model limit: the features include the second hand, so two palms look like idle; (3) no two-hand palm in training | margin rule, palm gate (pass 100% when it picks palm) |
| idle (precision 26%) | – | – | – | Low precision because sign frames fall back to idle; plus `idle/141753` actually contains palms | – |

Cause categories asked for:
- **Insufficient training data:** yes for all six. One session per sign; the landmark model cannot generalize to new conditions (snake 4%, boar 38% top-class on test).
- **Recording quality / execution:**
  - test: tiger rec 1, ram rec 1, idle 141753, palm ×2 (two hands);
  - training: everything is from one session and one camera position.
- **Class imbalance:** minor. Idle (1114) and palm (1060) have ~3× the frames of each seal (315–434). That does not explain the seal failures; landmark top-class on Dog is 95–100% with the same frame count.
- **Model limits:**
  - YOLOX (pretrained, not ours) is sensitive to the low camera angle;
  - the landmark features are not rotation-invariant and include the second hand.
- **Fusion rules:** yes for ram/tiger/dog. Each sign has one owner model, so a correct answer from the other model is thrown away.
- **Thresholds:**
  - SEAL_MIN_SCORE 0.70 cuts off many 0.40–0.70 YOLOX scores (snake 51% / 22%, tiger 31%, ram 15%, dog 22% of frames);
  - LANDMARK_MIN_PROB 0.60 blocks clone_seal.
  - Lowering them is untested for false positives and must not be chosen on the test set.

## 5. Priority 4: training data collection plan (the test set stays untouched)

**Goal:** cover the conditions where it failed, with several sessions per sign, and give validation real content so
thresholds and fusion can be chosen without the test set.

**Conditions to vary (every gesture):**
- **Camera position:**
  - (A) face level, frontal (laptop on a table);
  - (B) low, looking up (laptop on the lap, like Nov 1);
  - (C) ~30° to the side.
- **Lighting:** (1) daylight with the window in view; (2) evening room lamp; (3) dim / one-sided light.
- **Distance:** near (hands ≈ ⅓ of the frame) and arm's length.
- **Framing:** the whole seal and both hands inside the frame, including the top hand of the Clone Seal.
- **Variety:** different clothes and backgrounds. If possible, a second person (other users' hands differ).

**Recordings (20 s each, same format as now):**

| gesture | new TRAIN | new VALIDATION | notes |
|---|---|---|---|
| ram | 6 | 2 | conditions A/B/C × 2 lightings; keep the ram vs tiger difference as in the reference picture |
| tiger | 6 | 2 | same |
| snake | 6 | 2 | same |
| dog | 6 | 2 | include low angle (B), where the top hand looks edge-on |
| clone_seal | 6 | 2 | the seal fully in frame at different heights; also left-over-right and right-over-left only if the reference allows it |
| rasengan_palm | 6 | 2 | left and right hand; **first decide whether two raised palms count** (section 6) |
| monkey / boar / horse | 3 each | 1 each | already good; enough for fusion validation |
| idle (negatives) | 6 | 2 | real OK sign (circle visible), fist, claw, pointing, phone in hand, hands near the face, two hands relaxed in front, half-formed seals |
| **total** | **51** | **17** | ≈ 68 × ~35 s ≈ 40 min, split into 3 sessions |

**Sessions:**
- Train: session 1 (day, positions A + B) and session 2 (evening, positions A + C).
- Validation: session 3 (another day, mixed positions). Validation then measures new conditions the way the test does.
- New recordings get assigned to train / validation **by hand, by id**, with a dry-run first. Never with `python evaluate.py splits`.
- The 22 test entries are never touched.

**Recorder safety** (the first-round problem): before training data is recorded, the recorder should show 6 thumbnails after every recording and let you keep it or record it again. It must not save on "a hand was seen" alone. This is a tool change and needs your approval.

## 6. Recommended action plan (each step waits for your approval)

1. **Your decisions first:**
   - (a) Rasengan palm: one hand only (as defined now), or should two raised open palms also count?
   - (b) The 3 flawed test recordings (tiger 140826, ram 140631, idle 141753): keep them as they are and add a note to future reports, or mark them excluded (unassigned) without deleting anything?
2. Add the keep / redo review step to the recorder (no change to the app).
3. Record the training + validation data in section 5 (3 sessions).
4. Retrain the landmark model on train only. Then compare on **validation only**:
   - current fusion;
   - a fusion where a confident landmark answer can confirm a seal when YOLOX is silent (or where both must agree at a lower YOLOX score);
   - margin rule on / off;
   - the palm definition from 1(a).
   Pick on validation, write it down, freeze it.
5. Run one independent evaluation on the unchanged 22-recording test set. Ideally also run one fresh test session in a new condition. Report all numbers, good or bad.
6. Optional, later: a short hint in the existing camera card ("camera at face level, keep both hands in the frame"). Real users will hit the same camera-angle problem. Small text only, no redesign.

YOLOX itself cannot be improved with our recordings without box labels (a bigger project). Its weakness at low
angles can only be handled by the fusion design (step 4) and camera guidance (step 6).

## Files

- `scripts/diagnose.py`: rule ablation per set (A), probability / margin / gate distributions (B), YOLOX scores per recording (C), recording quality (D) → `evidence/diagnosis.json`
- `scripts/sheets.py`: contact sheets with hands drawn and per-frame readings, Ram/Tiger 2-second timeline → `evidence/*.png`, `evidence/timeline.json`
- `scripts/ablation.py`: train + validation fusion ablation → `evidence/ablation.json`

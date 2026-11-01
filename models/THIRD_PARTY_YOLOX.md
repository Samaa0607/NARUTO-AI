# Third-party model: YOLOX-Nano hand-seal detector

`models/yolox_nano.onnx` is NOT our work. It is used by `shinobi/seal_detector.py` to recognise
the official Naruto hand seals. Three separate things come with it, and each one has its own
rights status. **The MIT licence of the code does not automatically cover the weights or the
data the weights were trained on.**

This file records what was checked on 2026-10-30. It is documentation, not legal advice.

## 1. Where the file comes from

| | |
|---|---|
| Project | Kazuhito00 / NARUTO-HandSignDetection, https://github.com/Kazuhito00/NARUTO-HandSignDetection |
| Commit | `07f4d3231f43f97cbd37653c793825f1dbc94d0e` (2023-07-10) |
| File in the repo | `model/yolox/yolox_nano.onnx` (copied unchanged) |
| SHA-256 | `8a12da84bdf35fa68f11a53aca1e775f49c8545995a21e54b5a32be2d19d9901` |
| Size | 3,610,160 bytes |
| Classes | 16 outputs: 12 zodiac seals, Gassho, Unknown, Mizunoe, plus one id with no label (see `setting/labels.csv` in the repo; mapping used here: `SEAL_CLASSES` in `shinobi/config.py`) |

## 2. The three parts and their status

| Part | Status | Evidence |
|---|---|---|
| **Code** (the repo's scripts) | **MIT licence**, Copyright (c) 2020 KazuhitoTakahashi. Full text: `models/YOLOX_NARUTO_HandSignDetection_LICENSE.txt` | LICENSE file; README: "NARUTO-HandSignDetection is under MIT license" |
| **Pretrained weights** (`yolox_nano.onnx`) | **No explicit licence.** The README only says "The dataset is private (trained models are public)". The ONNX file's metadata has no licence field | README; ONNX metadata (producer "pytorch", empty custom metadata) |
| **Training data** | **Not clearly licensed. Includes third-party copyrighted images.** Private dataset: 10,026 images, of which 2,651 are anime images, plus the author's own photos, plus the Kaggle "naruto-hand-sign-dataset" (Vikranth Kanumuru), whose licence the Kaggle API reports as **"Unknown"**. The author cites Article 47-7 of the Japanese Copyright Act for sharing the models | README ("Total number: 10026 sheets (Anime image: 2651 sheets)", "In addition to the images I took and the anime images, I use naruto-hand-sign-dataset") |

Not checked: the licence of the upstream YOLOX framework the model was trained with (Megvii
YOLOX), and whether Article 47-7 applies outside Japan.

Also not covered: the NARUTO franchise itself (Masashi Kishimoto / Shueisha / Studio Pierrot).
The seal names and shapes come from it.

## 3. What this means for SHINOBI AI

* **Personal, educational or university use:** this is how the model is used here.
* **Before any public release, redistribution of `yolox_nano.onnx`, or commercial use:** the
  rights to the weights and their training data must be clarified first. For example, ask the
  author, or replace the model with one trained only on data we own (our own recordings in
  `data/` could be used for that).
* If the model is removed, the app still runs: `shinobi/main.py` switches YOLOX off when the file
  is missing, and the landmark classifier alone handles recognition (`LANDMARK_BACKUP_PROB`).

## 4. Our code that uses it

`shinobi/seal_detector.py` is our own re-implementation of the repo's pre/post-processing (no
code was copied from the repo). It was checked against the repo's behaviour on our pilot
recordings: the same results (7 seals, 99–100% of frames).

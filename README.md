# SHINOBI AI

Real-time hand-sign recognition from a laptop webcam that triggers anime-style visual effects:
**Shadow Clone**, **Rasengan**, **Chidori** and **Fire Style**. Pure Python — no game engine.

## How it works

```
camera ─► MediaPipe hands ─► features (206) ─► classifier (MLP / RF) ─► controller ─► effect
                     │                                     smoothing · hold · hysteresis ·
                     └─► One Euro tracking ───────────────► sequence matching · cooldown
```

- **Recognition:** a per-frame classifier on hand-landmark features (joint angles, fingertip
  distances, two-hand geometry). Time is handled by a small rule-based controller instead of an
  LSTM, so multi-sign jutsu are defined in `config.py` without retraining.
- **Evaluation:** cross-validation split by recording session (no frame leakage), mirror and
  jitter augmentation inside training folds only, optional held-out person test.
- **Effects:** OpenCV + NumPy. Vectorized particles, ROI-limited bloom, person segmentation with
  temporal smoothing and a guided filter, Porter-Duff compositing in one full-size blend.

## Quick start (Windows, Python 3.12)

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m shinobi.main          # keyboard mode: 1-4 effects, 0 stop, Q quit
.venv\Scripts\python.exe collect_data.py --person me --lighting day
.venv\Scripts\python.exe train.py
.venv\Scripts\python.exe -m pytest -q
```

MediaPipe model files go in `models/` (see `docs/01_setup_and_run.md` for download links).

## Documentation

Full line-by-line documentation (Arabic) is in [`docs/`](docs/00_index.md).

## Not included in this repository

These files are used by the app but are **not** in the repository, until their redistribution rights are
verified. Put them back at the same paths to run the full app.

- `models/yolox_nano.onnx` (the YOLOX hand-seal detector). Its weights have no explicit licence; see
  `models/THIRD_PARTY_YOLOX.md`. To get it:
  - Download `model/yolox/yolox_nano.onnx` from https://github.com/Kazuhito00/NARUTO-HandSignDetection
    (commit `07f4d3231f43f97cbd37653c793825f1dbc94d0e`).
  - Save it as `models/yolox_nano.onnx` (SHA-256 `8a12da84bdf35fa68f11a53aca1e775f49c8545995a21e54b5a32be2d19d9901`).
  - Without it the app runs on the landmark model only (`yolox: false` in `/api/info`).
- `frontend/src/assets/konoha/background.jpg` (page background).
- `frontend/src/assets/konoha/shadow-clone/` (`bg.webp`, `clone-left.webp`, `clone-right.webp`,
  `front.webp`; the animated Shadow Clone icon layers).

  Their ownership and licence are not documented yet. The frontend imports them, so `npm run build`
  needs files with these names (your own images work).
- `data/` (personal recordings), the diagnosis frames in `reports/2026-11-01_diagnosis/evidence/*.png`,
  and copies of old or experimental models.

The MediaPipe models are included under Apache 2.0; see `models/THIRD_PARTY_MEDIAPIPE.md`.

"""Run:  python -m pytest -q"""

import json
import subprocess
import sys

import numpy as np
import pytest

from shinobi import config
from shinobi.controller import ActionController, GestureStabilizer, SequenceMatcher
from shinobi.effects import EFFECTS
from shinobi.features import FEATURE_SIZE, extract, mirror
from shinobi.tracking import Tracking

RNG = np.random.default_rng(0)


def fake_hand(offset=(0.3, 0.5)):
    image = np.zeros((21, 3), np.float32)
    image[:, :2] = np.array(offset) + RNG.normal(0, 0.03, (21, 2))
    world = RNG.normal(0, 0.03, (21, 3)).astype(np.float32)
    return image, world


def frame_arrays(two_hands=True):
    a, wa = fake_hand((0.3, 0.5))
    b, wb = fake_hand((0.7, 0.5))
    present = np.array([1.0, 1.0 if two_hands else 0.0], np.float32)
    if not two_hands:
        b, wb = np.zeros_like(b), np.zeros_like(wb)
    return np.stack([a, b]), np.stack([wa, wb]), present


# ------------------------------------------------------------------ features
def test_feature_size_and_missing_hand():
    img, wld, pres = frame_arrays(two_hands=False)
    f = extract(img, wld, pres)
    assert f.shape == (FEATURE_SIZE,)
    assert np.all(np.isfinite(f))


def test_features_ignore_position_and_scale_of_world_coords():
    img, wld, pres = frame_arrays()
    moved = wld + np.array([0.1, -0.2, 0.05], np.float32)     # translate whole hands
    f1, f2 = extract(img, wld, pres), extract(img, moved, pres)
    np.testing.assert_allclose(f1, f2, atol=1e-5)
    f3 = extract(img, wld * 1.7, pres)                         # bigger hands
    np.testing.assert_allclose(f1, f3, atol=1e-4)


def test_mirror_twice_is_identity():
    img, wld, pres = frame_arrays()
    back = mirror(*mirror(img, wld, pres))
    np.testing.assert_allclose(extract(img, wld, pres), extract(*back), atol=1e-5)


# ------------------------------------------------------------------ controller
LABELS = ["idle", "clone_seal", "rasengan"]


def probs(name, p=0.95):
    out = np.full(len(LABELS), (1 - p) / (len(LABELS) - 1), np.float32)
    out[LABELS.index(name)] = p
    return out


def feed(stab, name, seconds, start, fps=30):
    confirmed = []
    for i in range(int(seconds * fps)):
        g = stab.update(probs(name) if name else None, start + i / fps)
        if g:
            confirmed.append(g)
    return confirmed


def test_stabilizer_needs_hold_and_fires_once():
    stab = GestureStabilizer(LABELS, hold=0.3)
    assert feed(stab, "rasengan", 0.2, 0.0) == []            # too short
    assert feed(stab, "rasengan", 1.0, 0.2) == ["rasengan"]  # held long enough: exactly once


def test_stabilizer_ignores_single_frame_spikes():
    stab = GestureStabilizer(LABELS)
    for i in range(60):
        name = "rasengan" if i % 10 == 0 else "idle"           # one noisy frame every 10
        assert stab.update(probs(name), i / 30) is None


def first_confirmation(fps, seconds=2.0):
    stab = GestureStabilizer(LABELS)
    for i in range(int(seconds * fps)):
        if stab.update(probs("rasengan"), i / fps):
            return i / fps
    return None


def test_stabilizer_smoothing_is_per_second_not_per_frame():
    """The same evidence time at any frame rate: a low frame rate no longer adds whole frames of delay."""
    t15, t6, t30 = first_confirmation(15), first_confirmation(6), first_confirmation(30)
    assert abs(t6 - t15) <= 1 / 6 + 1e-9 and abs(t30 - t15) <= 1 / 15 + 1e-9
    assert t15 >= 0.4                                          # rise (~0.13 s) + hold (0.3 s): not shortened


def test_stabilizer_at_its_reference_rate_is_the_old_per_frame_ema():
    stab = GestureStabilizer(LABELS, ref_fps=15)
    old = np.zeros(len(LABELS), np.float32)
    old[LABELS.index("idle")] = 1.0
    for i in range(8):
        p = probs("rasengan" if i % 3 else "idle")
        stab.update(p, i / 15)
        old = 0.4 * p + 0.6 * old
        assert np.allclose(stab.smoothed, old, atol=1e-5)


def test_stabilizer_rearms_after_release():
    stab = GestureStabilizer(LABELS, hold=0.2)
    assert feed(stab, "rasengan", 0.8, 0.0) == ["rasengan"]
    feed(stab, None, 0.5, 0.8)                                 # hands down
    assert feed(stab, "rasengan", 0.8, 1.3) == ["rasengan"]


def test_sequence_matcher_prefers_full_sequence_and_times_out():
    jutsu = {"fire": {"sequence": ["a", "b", "c"], "effect": "fire"},
             "single": {"sequence": ["x"], "effect": "x"}}
    m = SequenceMatcher(jutsu, max_gap=1.0)
    assert m.push("a", 0.0) is None
    assert m.push("b", 0.5) is None
    assert m.push("c", 1.0) == "fire"
    assert m.push("x", 1.2) == "single"
    m.push("a", 2.0)
    m.push("b", 2.5)
    assert m.push("c", 4.0) is None                            # gap too long: sequence reset


def test_controller_cooldown():
    one_sign = {"rasengan": {"sequence": ["rasengan"], "effect": "rasengan"},
                "chidori": {"sequence": ["chidori"], "effect": "chidori"}}
    ctrl = ActionController(["idle", "clone_seal", "rasengan", "chidori", "fire"], cooldown=3.0, jutsu=one_sign)
    fired = []
    t = 0.0
    for name in ["rasengan", None, "chidori", None]:
        for _ in range(30):
            p = None
            if name:
                p = np.full(5, 0.01, np.float32)
                p[["idle", "clone_seal", "rasengan", "chidori", "fire"].index(name)] = 0.96
            s = ctrl.update(p, t)
            if s.effect:
                fired.append(s.effect)
            t += 1 / 30
    assert fired == ["rasengan"]                                # chidori came during the cooldown


# ------------------------------------------------------------------ effects
@pytest.mark.parametrize("name", list(EFFECTS))
def test_effects_render_without_crashing(name):
    frame = np.full((360, 640, 3), 60, np.uint8)
    effect = EFFECTS[name]()
    effect.start(0.0)
    small = frame.copy()
    mask = np.zeros((360, 640), np.float32)
    mask[100:360, 250:390] = 1.0                               # a fake "person"
    for i in range(40):
        now = i / 30
        tracking = Tracking(hands=[], now=now, visible=True, anchor=np.array([320.0, 180.0]),
                            size=60.0, direction=np.array([0.0, -1.0]))
        out = effect.render(frame, tracking, 1 / 30, (small, mask))
        assert out.shape == frame.shape and out.dtype == np.uint8


# ------------------------------------------------------------------ training pipeline
def test_train_script_on_synthetic_data(tmp_path):
    rng = np.random.default_rng(1)
    # "rasengan" is the old name of the open-palm recordings: it must be trained as "rasengan_palm";
    # "fire" (old OK-ring) is no longer a sign and must be skipped, not crash the training.
    for label_i, label in enumerate(["idle", "rasengan", "tiger", "fire"]):
        folder = tmp_path / "data" / label
        folder.mkdir(parents=True)
        for s in range(3):
            n = 40
            img = np.zeros((n, 2, 21, 3), np.float32)
            wld = rng.normal(0, 0.01, (n, 2, 21, 3)).astype(np.float32)
            wld[:, 0, :, 0] += label_i * 0.03 * np.arange(21) / 21    # class-specific hand shape
            img[:, 0, :, :2] = 0.4 + rng.normal(0, 0.02, (n, 21, 2))
            present = np.tile(np.array([1.0, 0.0], np.float32), (n, 1))
            np.savez_compressed(folder / f"s{s}.npz", image_lm=img, world_lm=wld, present=present,
                                timestamps=np.arange(n) / 30.0,
                                meta=json.dumps({"label": label, "session": f"{label}{s}",
                                                 "person": "p", "lighting": "x", "aspect": 16 / 9}))
    out = tmp_path / "model.joblib"
    subprocess.run([sys.executable, "train.py", "--data", str(tmp_path / "data"), "--out", str(out),
                    "--step", "1"], check=True, cwd=config.ROOT)
    from shinobi.classifier import GestureClassifier
    clf = GestureClassifier(out)
    assert clf.labels == ["idle", "tiger", "rasengan_palm"]


def test_classifier_fast_forest_gives_exactly_sklearns_probabilities(tmp_path, monkeypatch):
    """The app asks the model one frame at a time; GestureClassifier walks the forest itself (sklearn
    takes 40-50 ms per call for 300 trees). The probabilities must be exactly sklearn's, and a
    model saved with n_jobs=-1 must not start a thread pool for every frame."""
    import joblib
    from sklearn.ensemble import RandomForestClassifier

    from shinobi.classifier import GestureClassifier
    from shinobi.features import FEATURE_VERSION
    rng = np.random.default_rng(3)
    X = rng.normal(0, 1, (600, FEATURE_SIZE)).astype(np.float32)
    y = (X[:, 0] > 0).astype(int) + 2 * (X[:, 5] + X[:, 9] > 0.5)      # 4 classes from a few features
    forest = RandomForestClassifier(n_estimators=40, min_samples_leaf=2, class_weight="balanced", n_jobs=-1,
                                    random_state=0).fit(X, y)
    path = tmp_path / "gesture_model.joblib"
    labels = [config.GESTURES[c] for c in forest.classes_]
    joblib.dump({"model": forest, "model_name": "random_forest", "labels": labels,
                 "feature_version": FEATURE_VERSION}, path)
    monkeypatch.setattr(config, "GESTURE_MODEL_PATH", path)            # the default path is read when called
    assert GestureClassifier.exists()
    clf = GestureClassifier()
    assert clf.fast is not None and clf.model.n_jobs == 1 and clf.labels == labels
    probe = np.vstack([rng.normal(0, 1, (300, FEATURE_SIZE)), np.zeros((1, FEATURE_SIZE))])
    expected = forest.predict_proba(probe.astype(np.float32)).astype(np.float32)
    got = np.array([clf.predict(x) for x in probe])
    assert got.dtype == np.float32 and np.array_equal(got, expected)
    odd = probe[0].copy()
    odd[3] = np.nan                                                    # not finite: sklearn's own path
    assert clf.predict(odd).shape == (len(labels),)


def test_sequence_matcher_rejects_single_gesture_prefix():
    jutsu = {"a_alone": {"sequence": ["a"], "effect": "x"},
             "a_then_b": {"sequence": ["a", "b"], "effect": "y"}}
    with pytest.raises(ValueError):
        SequenceMatcher(jutsu)

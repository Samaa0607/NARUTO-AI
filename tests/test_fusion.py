"""YOLOX seal detector + fusion with the landmark classifier.

Run:  python -m pytest -q
"""

import time

import cv2
import numpy as np
import pytest

from shinobi import config
from shinobi.controller import ActionController
from shinobi.fusion import SignFusion
from shinobi.hands import Hand
from shinobi.seal_detector import Detection, SealDetector, SealResult, SealWorker, nms

LM_LABELS = config.GESTURES


def world_hand(thumb_tip, index_tip):
    """3D landmarks (metres, wrist at the origin) with the points the palm check reads."""
    w = np.zeros((21, 3))
    w[9] = (0.0, -0.09, 0.0)                                         # middle knuckle: hand size 9 cm
    w[4], w[8] = thumb_tip, index_tip
    return w


OPEN_PALM = world_hand((-0.06, -0.03, 0.0), (-0.03, -0.17, 0.0))     # thumb 14 cm from the index tip
OK_SIGN = world_hand((-0.035, -0.12, 0.0), (-0.03, -0.125, 0.0))     # thumb and index tips touching


def hand_at(x, y, size=80, world=OPEN_PALM):
    px = np.array([[x + dx, y + dy] for dx, dy in np.random.default_rng(0).uniform(-size / 2, size / 2, (21, 2))])
    return Hand(np.zeros((21, 3)), world, "Right", 0.9, px)


def seal(run_id, sign, score, box=(500, 300, 700, 500), stamp=0.0, class_id=None):
    ids = {v: k for k, v in config.SEAL_CLASSES.items()}
    return SealResult(run_id, stamp, 40.0, [Detection(sign, ids.get(sign, class_id), score, box)])


def landmarks(sign, p):
    probs = np.full(len(LM_LABELS), (1 - p) / (len(LM_LABELS) - 1), np.float32)
    probs[LM_LABELS.index(sign)] = p
    return probs


# ------------------------------------------------------------------ detector
@pytest.fixture(scope="module")
def detector():
    return SealDetector()


def test_detector_returns_nothing_on_an_empty_frame(detector):
    assert [d for d in detector.detect(np.full((720, 1280, 3), 128, np.uint8)) if d.score >= 0.5] == []


@pytest.mark.parametrize("sign", ["tiger", "boar"])
def test_detector_finds_the_seal_in_its_reference_drawing(detector, sign):
    """Guards the pre/post-processing: a wrong letterbox, colour order or decode breaks this."""
    art = cv2.imread(str(config.REFERENCES_DIR / "_sources" / "signs" / f"{sign}.png"))
    canvas = np.full((720, 1280, 3), 128, np.uint8)
    h = int(720 * 0.45)
    art = cv2.resize(art, (int(art.shape[1] * h / art.shape[0]), h))
    y, x = (720 - art.shape[0]) // 2, (1280 - art.shape[1]) // 2
    canvas[y:y + art.shape[0], x:x + art.shape[1]] = art
    best = detector.detect(canvas)[0]
    assert best.sign == sign and best.score > 0.8
    bx0, by0, bx1, by1 = best.box                                    # box around the drawing
    assert bx0 < 640 < bx1 and by0 < 360 < by1


def test_nms_keeps_the_best_of_overlapping_boxes():
    boxes = np.array([[0, 0, 10, 10], [1, 1, 11, 11], [50, 50, 60, 60]], np.float32)
    assert nms(boxes, np.array([0.5, 0.9, 0.7]), 0.45) == [1, 2]


def test_worker_runs_in_the_background_and_reports_latency(detector):
    worker = SealWorker(detector, rate_hz=20)
    try:
        frame = np.full((720, 1280, 3), 128, np.uint8)
        t0 = time.perf_counter()
        worker.submit(frame, t0)
        while worker.result is None and time.perf_counter() - t0 < 10:
            time.sleep(0.01)
        assert worker.result is not None and worker.result.time == t0 and worker.result.latency_ms > 0
    finally:
        worker.close()


# ------------------------------------------------------------------ fusion
def test_yolox_seal_needs_two_results_in_a_row_on_a_hand():
    f = SignFusion()
    hands = [hand_at(600, 400)]
    assert f.update(None, None, seal(1, "tiger", 0.9), hands, 0.05).sign == "idle"      # first result only
    out = f.update(None, None, seal(2, "tiger", 0.9), hands, 0.1)
    assert (out.sign, out.source) == ("tiger", "yolox")
    assert f.update(None, None, seal(2, "tiger", 0.9), hands, 0.2).sign == "tiger"       # same result reused


def test_yolox_box_away_from_the_hands_is_rejected():
    f = SignFusion()
    hands = [hand_at(150, 600)]                                       # hand far from the box (e.g. box on the face)
    for i in (1, 2, 3):
        assert f.update(None, None, seal(i, "snake", 0.95), hands, 0.1 * i).sign == "idle"


def test_without_any_hand_yolox_needs_a_higher_score():
    f = SignFusion()
    for i in (1, 2, 3):
        assert f.update(None, None, seal(i, "monkey", 0.8), [], 0.1 * i).sign == "idle"
    f = SignFusion()
    f.update(None, None, seal(1, "monkey", 0.9), [], 0.1)
    assert f.update(None, None, seal(2, "monkey", 0.9), [], 0.2).sign == "monkey"


def test_stale_yolox_result_is_ignored():
    f = SignFusion()
    hands = [hand_at(600, 400)]
    f.update(None, None, seal(1, "dog", 0.9, stamp=0.0), hands, 0.1)
    f.update(None, None, seal(2, "dog", 0.9, stamp=0.1), hands, 0.2)
    assert f.update(None, None, seal(2, "dog", 0.9, stamp=0.1), hands, 1.0).sign == "idle"


def test_seals_no_jutsu_uses_are_ignored():
    f = SignFusion()
    hands = [hand_at(600, 400)]
    for i in (1, 2, 3):
        assert f.update(None, None, seal(i, None, 0.95, class_id=0), hands, 0.1 * i).sign == "idle"  # rat


def test_landmarks_own_clone_seal_and_palm_and_never_override_yolox_seals():
    f = SignFusion()
    hands = [hand_at(600, 400)]
    assert f.update(landmarks("clone_seal", 0.8), LM_LABELS, None, hands, 0.0).sign == "clone_seal"
    assert f.update(landmarks("rasengan_palm", 0.5), LM_LABELS, None, hands, 0.0).sign == "idle"   # too unsure
    assert f.update(landmarks("tiger", 0.99), LM_LABELS, None, hands, 0.0).sign == "idle"   # YOLOX's job
    backup = f.update(landmarks("tiger", 0.95), LM_LABELS, None, hands, 0.0, yolox_running=False)
    assert (backup.sign, backup.source) == ("tiger", "landmarks-backup")


def test_rasengan_palm_needs_an_open_hand_not_an_ok_sign():
    """The classifier never saw an OK sign and called it a palm: the open-palm check refuses it."""
    f = SignFusion()
    ok = f.update(landmarks("rasengan_palm", 0.95), LM_LABELS, None, [hand_at(600, 400, world=OK_SIGN)], 0.0)
    assert ok.sign == "idle" and f.rejected == 1
    palm = f.update(landmarks("rasengan_palm", 0.95), LM_LABELS, None, [hand_at(600, 400)], 0.1)
    assert palm.sign == "rasengan_palm"
    no_3d = f.update(landmarks("rasengan_palm", 0.95), LM_LABELS, None, [hand_at(600, 400, world=np.zeros((21, 3)))], 0.2)
    assert no_3d.sign == "idle"                                       # cannot be checked: no sign
    clone = f.update(landmarks("clone_seal", 0.95), LM_LABELS, None, [hand_at(600, 400, world=OK_SIGN)], 0.3)
    assert clone.sign == "clone_seal"                                 # the check is for the palm only


def test_an_unsure_landmark_sign_is_no_sign():
    f = SignFusion()
    hands = [hand_at(600, 400)]
    probs = np.zeros(len(LM_LABELS), np.float32)
    probs[LM_LABELS.index("rasengan_palm")], probs[LM_LABELS.index("clone_seal")] = 0.62, 0.36
    assert f.update(probs, LM_LABELS, None, hands, 0.0).sign == "idle"            # margin 0.26 < 0.30
    probs[LM_LABELS.index("rasengan_palm")], probs[LM_LABELS.index("clone_seal")] = 0.68, 0.30
    assert f.update(probs, LM_LABELS, None, hands, 0.1).sign == "rasengan_palm"   # margin 0.38


def test_an_ok_sign_held_at_the_last_step_never_fires_rasengan():
    seq = config.JUTSU["rasengan"]["sequence"]                        # clone_seal, dog, horse, rasengan_palm
    steps = [("landmarks", seq[0]), ("yolox", seq[1]), ("yolox", seq[2]), ("landmarks", seq[3])]
    assert perform(SignFusion(), ActionController(config.GESTURES), steps, world=OK_SIGN) == []


def test_conflict_higher_score_wins_and_is_counted():
    f = SignFusion()
    hands = [hand_at(600, 400)]
    f.update(None, None, seal(1, "tiger", 0.8), hands, 0.1)
    out = f.update(landmarks("clone_seal", 0.95), LM_LABELS, seal(2, "tiger", 0.8), hands, 0.2)
    assert (out.sign, out.conflict, f.conflicts) == ("clone_seal", True, 1)
    out = f.update(landmarks("clone_seal", 0.7), LM_LABELS, seal(3, "tiger", 0.9), hands, 0.3)
    assert (out.sign, f.conflicts) == ("tiger", 2)


# ------------------------------------------------------------------ fusion -> sequence -> jutsu
def perform(fusion, ctrl, steps, fps=30, world=OPEN_PALM):
    """steps: list of (source, sign) held 0.8 s each with 0.5 s of hands-down in between."""
    fired, t, run_id = [], 0.0, 0
    hands = [hand_at(600, 400, world=world)]
    for source, sign in steps + [(None, None)]:
        for _ in range(int(0.8 * fps) if sign else int(1.0 * fps)):
            lm, result = None, None
            if source == "yolox":
                run_id += 1                                           # a new YOLOX result every frame here
                result = seal(run_id, sign, 0.9, stamp=t)
            elif source == "landmarks":
                lm = landmarks(sign, 0.9)
            state = ctrl.update(fusion.update(lm, LM_LABELS, result, hands, t).probs, t)
            if state.effect:
                fired.append(state.effect)
            t += 1 / fps
        for _ in range(int(0.5 * fps)):
            state = ctrl.update(fusion.update(None, None, None, [], t).probs, t)
            t += 1 / fps
    return fired


def test_chidori_from_yolox_seals_fires_once():
    steps = [("yolox", s) for s in config.JUTSU["chidori"]["sequence"]]
    assert perform(SignFusion(), ActionController(config.GESTURES), steps) == ["chidori"]


def test_rasengan_mixes_both_models_and_fires_once():
    seq = config.JUTSU["rasengan"]["sequence"]                        # clone_seal, dog, horse, rasengan_palm
    steps = [("landmarks", seq[0]), ("yolox", seq[1]), ("yolox", seq[2]), ("landmarks", seq[3])]
    assert perform(SignFusion(), ActionController(config.GESTURES), steps) == ["rasengan"]


def test_wrong_order_from_the_models_fires_nothing():
    seq = config.JUTSU["fire_style"]["sequence"]
    steps = [("yolox", s) for s in [seq[1], seq[0], seq[2], seq[3]]]
    assert perform(SignFusion(), ActionController(config.GESTURES), steps) == []

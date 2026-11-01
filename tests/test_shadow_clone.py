"""Shadow Clone with 10 clones: config, placement, visibility, drawing, smoke, activation,
segmentation NaN fix.

Run:  python -m pytest -q
"""

import cv2
import numpy as np
import pytest

from shinobi import config
from shinobi.controller import ActionController
from shinobi.effects import EFFECTS
from shinobi.effects.base import EffectManager
from shinobi.effects.shadow_clone import ShadowClone
from shinobi.tracking import Tracking

H, W = 360, 640
PERSON = (slice(60, H), slice(270, 370))           # a fake person standing in the middle


def scene():
    frame = np.full((H, W, 3), 90, np.uint8)
    frame[PERSON] = (40, 60, 200)
    mask = np.zeros((H, W), np.float32)
    mask[PERSON] = 1.0
    return frame, mask


def run(effect, seconds, start=0.0, stop_at=None, fps=30):
    """Render `seconds` of frames; returns the last output frame."""
    frame, mask = scene()
    out = frame
    for i in range(int(seconds * fps)):
        now = start + i / fps
        if stop_at is not None and now >= stop_at:
            effect.stop(now)
        tracking = Tracking(hands=[], now=now, visible=True, anchor=np.array([320.0, 180.0]),
                            size=60.0, direction=np.array([0.0, -1.0]))
        out = effect.render(frame, tracking, 1 / fps, (frame, mask))
    return out


def test_one_entry_per_clone_balanced_and_all_delays_different():
    lists = [config.CLONE_OFFSETS, config.CLONE_SCALES, config.CLONE_LIFTS, config.CLONE_DELAYS]
    assert config.CLONE_COUNT == 10                                   # 11 people with the user
    assert all(len(values) == config.CLONE_COUNT for values in lists)
    assert sum(o < 0 for o in config.CLONE_OFFSETS) == sum(o > 0 for o in config.CLONE_OFFSETS) == 5
    assert len(set(config.CLONE_DELAYS)) == config.CLONE_COUNT


def test_wrong_clone_lists_are_refused_not_silently_shortened():
    with pytest.raises(ValueError):
        ShadowClone(10.0, count=config.CLONE_COUNT + 1)            # more clones than list entries
    with pytest.raises(ValueError):
        ShadowClone(10.0, offsets=config.CLONE_OFFSETS[:-1])       # lists of different lengths


def test_all_clones_drawn_from_live_frames_and_person_stays_in_front():
    effect = ShadowClone(10.0, seed=0)
    effect.start(0.0)
    out = run(effect, 3.0)                                          # every clone popped, smoke gone
    frame, mask = scene()
    assert effect.drawn == config.CLONE_COUNT
    assert len(effect.smoke) == 0
    np.testing.assert_array_equal(out[PERSON], frame[PERSON])       # real person untouched, in front
    changed = np.any(out != frame, axis=2)
    assert changed[:, :270].any() and changed[:, 370:].any()        # clones on both sides


@pytest.mark.parametrize("user_x", [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95])
def test_every_clone_body_stays_inside_the_frame(user_x):
    effect = ShadowClone(10.0)
    body = 0.2 * W
    effect.anchor = (user_x * W, body)
    person = {"left": 0, "right": int(0.4 * W), "top": 40, "center": 0.2 * W, "body": body}
    effect.layout(W, 1 / 30)
    for clone in effect.clones:
        x, y, tw, th = effect.place(clone, person, W, H)
        s = clone["scale"] * clone["fit"]
        centre = x + person["center"] * s
        half = 0.5 * body * s
        assert centre - half >= -1 and centre + half <= W + 1, clone
        assert y >= 0 and y + th <= H


def close_up_person(cx):
    """Mask of a user sitting close to the webcam: head + wide shoulders, like the real recordings."""
    mask = np.zeros((H, W), np.float32)
    cv2.ellipse(mask, (cx, 110), (55, 70), 0, 0, 360, 1.0, -1)
    cv2.rectangle(mask, (cx - 140, 175), (cx + 140, H - 1), 1.0, -1)
    return mask


def visible_heads(cx, effect=None):
    """Share of each clone's head (top 30% of its silhouette) not covered by nearer clones or the user."""
    effect = effect or ShadowClone(10.0)
    mask = close_up_person(cx)
    person = effect.measure(mask)
    effect.anchor = (person["center"], person["body"])
    effect.layout(W, 1.0)                                             # settled positions for this spot
    owner = np.full((H, W), -1)                                       # which clone is on top, per pixel
    heads = []
    for k, clone in enumerate(effect.order):                          # same drawing order as render()
        x, y, tw, th = effect.place(clone, person, W, H)
        body = cv2.resize(mask[person["top"]:, person["left"]:person["right"]], (tw, th)) > 0.5
        head = body.copy()
        head[int(0.3 * th):] = False
        pad = np.zeros((H + 2 * th, W + 2 * tw), bool)                # clip the clone to the frame
        pad[y + th:y + 2 * th, x + tw:x + 2 * tw] = body
        owner[pad[th:th + H, tw:tw + W]] = k
        pad[:] = False
        pad[y + th:y + 2 * th, x + tw:x + 2 * tw] = head
        heads.append(pad[th:th + H, tw:tw + W])
    owner[mask > 0.5] = -2                                            # the real user is in front
    return [float((owner[head] == k).sum() / head.sum()) for k, head in enumerate(heads)]


@pytest.mark.parametrize("cx", [40, 100, 160, 200, 240, 280, 320, 360, 400, 440, 480, 540, 600])
def test_all_ten_clone_heads_are_visible_wherever_the_user_stands(cx):
    """drawn == 10 is not enough: a clone exactly behind a nearer one is drawn but not seen.
    Measured with the old fixed layout: at cx=160 one head was 1 % visible, at cx=130 0 %."""
    shares = visible_heads(cx)
    assert len(shares) == config.CLONE_COUNT
    assert min(shares) >= 0.5, shares
    if cx == 320:
        assert min(shares) >= 0.8, shares


def sides(cx):
    effect = ShadowClone(10.0)
    person = effect.measure(close_up_person(cx))
    effect.anchor = (person["center"], person["body"])
    effect.layout(W, 1.0)
    left = sum(clone["x"] < effect.anchor[0] for clone in effect.clones)
    return left, config.CLONE_COUNT - left, effect


def test_clones_go_where_the_room_is():
    assert sides(100)[:2] == (0, 10)                                  # user on the left: all on the right
    assert sides(540)[:2] == (10, 0)                                  # user on the right: all on the left
    assert sides(320)[:2] == (5, 5)                                   # middle: both sides
    left, right, _ = sides(220)
    assert 0 < left < right                                           # a bit left: more on the right


def test_walking_user_moves_clones_across_in_smoke_without_flicker():
    effect = ShadowClone(10.0, seed=0, parallel=False)
    for clone in effect.clones:
        clone["shown"] = True
    body = 0.36 * W
    switches = {id(c): 0 for c in effect.clones}
    previous = {}
    for i in range(121):                                              # walk from 15 % to 85 % in 4 s
        effect.anchor = ((0.15 + 0.7 * i / 120) * W, body)
        puffs = len(effect.smoke)
        effect.layout(W, 1 / 30)
        for clone in effect.clones:
            if id(clone) in previous and previous[id(clone)] != clone["side"]:
                switches[id(clone)] += 1
                assert len(effect.smoke) > puffs                      # every switch happens in a puff
            previous[id(clone)] = clone["side"]
    assert max(switches.values()) <= 1                                # walking one way: at most one switch each
    assert sum(switches.values()) >= 8                                # most clones did move across
    effect.anchor = (0.5 * W, body)                                   # walk back to the middle, settle
    for _ in range(30):
        effect.layout(W, 1 / 30)
    rng = np.random.default_rng(1)
    for _ in range(60):                                               # standing still with jitter: no flicker
        effect.anchor = (0.5 * W + rng.uniform(-3, 3), body)
        before = [c["side"] for c in effect.clones]
        effect.layout(W, 1 / 30)
        assert [c["side"] for c in effect.clones] == before


def test_too_little_room_keeps_every_clone_and_says_so():
    """A narrow (portrait) frame with a big user: no layout fits, nothing is dropped, `crowded` tells."""
    w, h = 200, 360
    effect = ShadowClone(10.0, seed=0, parallel=False)
    effect.start(0.0)
    frame = np.full((h, w, 3), 90, np.uint8)
    mask = np.zeros((h, w), np.float32)
    mask[60:, 40:160] = 1.0
    for i in range(60):
        tracking = Tracking(hands=[], now=i / 30, visible=True, anchor=np.array([100.0, 180.0]),
                            size=60.0, direction=np.array([0.0, -1.0]))
        effect.render(frame, tracking, 1 / 30, (frame, mask))
    assert effect.crowded
    assert effect.drawn == config.CLONE_COUNT
    fits = [c["fit"] for c in effect.clones]
    assert min(fits) >= 0.8 - 1e-6 and min(fits) < 1.0                # shrunk, but only a little


def test_parallel_layer_is_one_frame_behind_and_the_user_stays_in_front():
    """Worker mode: same clones as the serial mode, one frame later; the user's own cut-out is
    never late, even while they move."""
    serial, parallel = ShadowClone(10.0, seed=0, parallel=False), ShadowClone(10.0, seed=0, parallel=True)
    serial.start(0.0)
    parallel.start(0.0)
    drawn_serial, drawn_parallel = [], []
    for i in range(120):
        now = i / 30
        x = 240 + i // 2                                              # the user drifts right (same sides)
        frame = np.full((H, W, 3), 90, np.uint8)
        frame[60:, x:x + 100] = (40, 60, 200)
        mask = np.zeros((H, W), np.float32)
        mask[60:, x:x + 100] = 1.0
        tracking = Tracking(hands=[], now=now, visible=True, anchor=np.array([320.0, 180.0]),
                            size=60.0, direction=np.array([0.0, -1.0]))
        serial.render(frame, tracking, 1 / 30, (frame, mask))
        out = parallel.render(frame, tracking, 1 / 30, (frame, mask))
        drawn_serial.append(serial.drawn)
        drawn_parallel.append(parallel.drawn)
        if i >= 100:                                                  # smoke (drawn over everyone) is gone
            assert len(parallel.smoke) == 0
            np.testing.assert_array_equal(out[60:, x:x + 100], frame[60:, x:x + 100])
    assert drawn_parallel[1:] == drawn_serial[:-1]
    assert drawn_parallel[-1] == config.CLONE_COUNT


def test_head_cut_by_the_top_of_the_image_gets_a_soft_edge():
    effect = ShadowClone(10.0)
    fade = effect._edge_fade(100, False, True)
    assert fade[0, 0] == 0.0 and fade[-1, 0] == 1.0 and np.all(np.diff(fade[:, 0]) >= 0)
    both = effect._edge_fade(100, True, True)
    assert both[0, 0] == 0.0 and both[-1, 0] == 0.0 and both[50, 0] == 1.0


def test_clones_pop_in_with_smoke_and_vanish_with_smoke():
    effect = ShadowClone(10.0, seed=0)
    effect.start(0.0)
    run(effect, 0.5)
    assert 0 < effect.drawn < config.CLONE_COUNT                      # still popping in one by one
    assert len(effect.smoke) > 0                                      # each one in a puff
    run(effect, 2.0, start=0.5)
    assert effect.drawn == config.CLONE_COUNT
    run(effect, 0.1, start=3.0, stop_at=3.0)                          # jutsu ends
    assert len(effect.smoke) > 0                                      # disappearance puffs
    run(effect, 0.4, start=3.1)
    assert effect.drawn == 0                                          # faded out after 0.25 s
    run(effect, 2.0, start=3.5)
    assert effect.finished(5.5)


def test_shadow_clone_sequence_starts_the_effect_with_all_clones():
    labels = config.GESTURES
    ctrl = ActionController(labels)
    manager = EffectManager(EFFECTS)
    frame, mask = scene()
    t = 0.0
    for sign in config.JUTSU["shadow_clone"]["sequence"] + [None] * 3:   # the 4 signs, then hands down
        for _ in range(int((0.8 if sign else 1.0) * 30)):
            p = None
            if sign:
                p = np.full(len(labels), 0.01, np.float32)
                p[labels.index(sign)] = 1.0 - 0.01 * (len(labels) - 1)
            state = ctrl.update(p, t)
            if state.effect:
                manager.start(state.effect, t)
            tracking = Tracking(hands=[], now=t, visible=True, anchor=np.array([320.0, 180.0]),
                                size=60.0, direction=np.array([0.0, -1.0]))
            seg = (frame, mask) if manager.needs_segmentation else None
            manager.render(frame, tracking, 1 / 30, seg)
            t += 1 / 30
    assert manager.active is not None and manager.active.name == "shadow_clone"
    assert manager.active.drawn == config.CLONE_COUNT


def test_segmentation_mask_has_no_nan_on_a_plain_bright_wall():
    from shinobi.segmentation import PersonSegmenter
    segmenter = PersonSegmenter()
    try:
        for value in (200, 250, 255):                                # flat and over-exposed walls
            _, mask = segmenter.segment(np.full((720, 1280, 3), value, np.uint8))
            assert not np.isnan(mask).any(), value
    finally:
        segmenter.close()

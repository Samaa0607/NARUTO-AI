"""shinobi/engine.py (the per-frame pipeline) and shinobi/main.py driven headless.

Run:  python -m pytest -q tests/test_engine.py
Uses the user's idle recording (data/videos/idle/, read only) as a real camera picture.
"""

import time

import cv2
import numpy as np
import pytest

from shinobi import config
from shinobi.engine import Engine

IDLE_VIDEO = config.VIDEOS_DIR / "idle" / "me_night_20261030_221934.mp4"


def read_video(path, count, size=None):
    cap = cv2.VideoCapture(str(path))
    frames = []
    while len(frames) < count:
        ok, frame = cap.read()
        if not ok:
            break
        frames.append(frame if size is None else cv2.resize(frame, size))
    cap.release()
    assert frames, f"cannot read {path}"
    return frames


def shaped(frame, w, h):
    """The recording at another size; portrait sizes take the middle of the picture (no stretching)."""
    if w / h < frame.shape[1] / frame.shape[0]:
        cw = int(frame.shape[0] * w / h)
        x0 = (frame.shape[1] - cw) // 2
        frame = frame[:, x0:x0 + cw]
    return cv2.resize(frame, (w, h))


@pytest.fixture(scope="module")
def idle_frames():
    return read_video(IDLE_VIDEO, 60)


@pytest.fixture(scope="module")
def engine():
    e = Engine()
    yield e
    e.close()


@pytest.mark.parametrize("w, h", [(1280, 720), (640, 480), (720, 1280), (852, 480)])
def test_any_frame_size_with_shadow_clone(idle_frames, w, h):
    """Browsers send 640x480, portrait 720x1280, ...: the whole pipeline and all 10 clones work."""
    e = Engine(yolox=True)
    try:
        t0 = time.perf_counter()
        e.start_effect("shadow_clone", t0)
        drawn = []
        for i in range(40):                                        # 40 frames = 2.7 s (synthetic clock)
            r = e.process(shaped(idle_frames[i], w, h), t0 + i / 15)
            assert r.frame.shape == (h, w, 3)
            drawn.append(r.effect.drawn)
        assert r.effect.name == "shadow_clone" and drawn[-1] == config.CLONE_COUNT
        assert set(r.timings) >= {"hands", "model", "seg", "fx"}
    finally:
        e.close()


def test_size_change_in_the_middle_of_a_shadow_clone(engine, idle_frames):
    """The clone layer of the old size cannot be blended onto the new size: the effect ends, no crash."""
    t0 = time.perf_counter()
    engine.start_effect("shadow_clone", t0)
    for i in range(10):
        r = engine.process(shaped(idle_frames[i], 1280, 720), t0 + i / 15)
    assert r.effect is not None
    r = engine.process(shaped(idle_frames[10], 640, 480), t0 + 1.0)
    assert r.effect is None and r.frame.shape == (480, 640, 3)
    engine.start_effect("chidori", t0 + 1.1)                       # hand effects simply continue at any size
    r = engine.process(shaped(idle_frames[11], 720, 1280), t0 + 1.2)
    assert r.effect.name == "chidori" and r.frame.shape == (1280, 720, 3)
    engine.stop_effect(t0 + 1.3)
    # stopping: at 1.3 s, or already at 1.2 s when MediaPipe found no hand in that resized frame
    # (Chidori follows the hand and fades out by itself once the hand is gone)
    stop_at = engine.effects.active.stop_at
    assert stop_at is not None and t0 + 1.2 - 1e-6 <= stop_at <= t0 + 1.3 + 1e-6
    engine.effects.active = None


def test_result_has_what_the_hud_and_the_server_need(engine, idle_frames):
    engine.set_jutsu(config.JUTSU)
    r = engine.process(idle_frames[0], time.perf_counter())
    assert r.fused.sign == "idle" and r.status.startswith("sign: idle [none 0.00]")
    assert r.stabilizer is engine.controller.stabilizer and r.state is not None
    assert set(r.progress) == set(config.JUTSU) and r.history == [] and r.time_left is None
    assert r.cooldown == 0.0 and r.fps > 0 and r.dt <= 0.1


def test_practice_mode_reset_and_effect_activation_numbers(engine, idle_frames):
    engine.set_jutsu({"chidori": config.JUTSU["chidori"]}, practice=True)
    assert list(engine.controller.matcher.jutsu) == ["chidori"] and engine.controller.matcher.max_gap is None
    t0 = time.perf_counter()
    engine.controller.matcher.push("snake", t0)
    r = engine.process(idle_frames[1], t0 + 0.1)
    assert r.progress == {"chidori": 1} and r.history == ["snake"] and r.time_left is None   # practice: no limit
    r = engine.process(idle_frames[2], t0 + 60.0)                  # a minute later: nothing was reset
    assert r.progress == {"chidori": 1} and r.history == ["snake"] and r.state.timed_out == {}
    engine.reset_sequence()                                        # Retry
    r = engine.process(idle_frames[3], t0 + 60.1)
    assert r.progress == {"chidori": 0} and r.history == [] and r.time_left is None
    engine.start_effect("fire", t0 + 60.2)
    first = engine.process(idle_frames[4], t0 + 60.2).effect_id
    engine.start_effect("fire", t0 + 60.3)                         # same effect, new activation
    second = engine.process(idle_frames[5], t0 + 60.3).effect_id
    assert second == first + 1 and engine.process(idle_frames[6], t0 + 60.4).effect_jutsu is None
    engine.set_jutsu(config.JUTSU)
    engine.effects.active = None


def test_free_mode_time_limit_and_timeout(engine, idle_frames):
    """The time limit runs on the engine's sequence clock: only time the AI could see the user counts."""
    engine.set_jutsu(config.JUTSU)
    assert engine.controller.matcher.max_gap == config.SEQUENCE_MAX_GAP
    t0 = time.perf_counter()
    engine.process(idle_frames[7], t0)
    engine.controller.matcher.push("snake", engine.seq_clock)
    r = engine.process(idle_frames[8], t0 + 0.1)
    assert r.progress["chidori"] == 1 and config.SEQUENCE_MAX_GAP - 0.2 < r.time_left < config.SEQUENCE_MAX_GAP
    # a 5 s stall (no frame processed) counts as one SEQUENCE_CLOCK_MAX_STEP at most
    r = engine.process(idle_frames[9 % len(idle_frames)], t0 + 5.1)
    assert r.progress["chidori"] == 1
    assert r.time_left > config.SEQUENCE_MAX_GAP - 0.2 - config.SEQUENCE_CLOCK_MAX_STEP - 0.01
    # frames at a normal pace: the limit runs out
    t, n = t0 + 5.1, 0
    while r.progress["chidori"] and n < 60:
        t, n = t + 0.3, n + 1
        r = engine.process(idle_frames[n % len(idle_frames)], t)
    assert r.state.timed_out == {"chidori": 1} and r.time_left is None
    assert 0.3 * n == pytest.approx(config.SEQUENCE_MAX_GAP - 0.1 - config.SEQUENCE_CLOCK_MAX_STEP, abs=0.35)
    engine.effects.active = None


def test_no_sign_counts_until_the_engine_is_ready(engine, idle_frames):
    """Readiness: until READY_FRAMES frames in a row ran in under READY_MAX_MS, the fused sign is ignored
    (no step, so no time limit), whatever the recognisers say."""
    engine.ready, engine._ready_run = False, 0
    t0 = time.perf_counter()
    for k in range(config.READY_FRAMES):
        assert not engine.ready
        r = engine.process(idle_frames[k % len(idle_frames)], t0 + 0.1 * k)
    assert r.ready and engine.ready


def test_landmarks_are_drawn_only_when_asked(engine):
    frame = read_video(config.VIDEOS_DIR / "tiger" / "me_night_20261030_220235.mp4", 1)[0]
    engine.draw_landmarks = False
    engine.effects.active = None
    plain = engine.process(frame.copy(), time.perf_counter())
    assert plain.hands, "the tiger recording shows hands"
    assert np.array_equal(plain.frame, frame)                      # no effect, no landmarks: untouched
    engine.draw_landmarks = True
    drawn = engine.process(frame.copy(), time.perf_counter())
    assert not np.array_equal(drawn.frame, frame)
    engine.draw_landmarks = False


# ------------------------------------------------------------------ main.py, headless
class FakeCamera:
    """Serves the idle recording at 1280x720 like shinobi.camera.Camera (already mirrored on disk)."""

    def __init__(self, *args, **kwargs):
        self.frames = read_video(IDLE_VIDEO, 80, (1280, 720))
        self.i = 0
        self.released = False

    def read(self):
        frame = self.frames[self.i % len(self.frames)].copy()
        self.i += 1
        return self.i, frame

    def release(self):
        self.released = True


def test_main_runs_headless_and_key_1_starts_the_shadow_clone(monkeypatch):
    import shinobi.main as main
    from shinobi.engine import Engine as RealEngine

    cameras, engines, shown, keys = [], [], [], {"calls": 0}

    class Camera(FakeCamera):
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            cameras.append(self)

    class SpyEngine(RealEngine):
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            engines.append(self)
            self.results = []

        def process(self, frame, now):
            r = super().process(frame, now)
            self.results.append((r.effect.name if r.effect else None, getattr(r.effect, "drawn", 0)))
            return r

    def wait_key(delay):
        keys["calls"] += 1
        return {10: ord("1"), 60: ord("q")}.get(keys["calls"], -1)

    monkeypatch.setattr(main, "Camera", Camera)
    monkeypatch.setattr(main, "Engine", SpyEngine)
    for name, fn in {"namedWindow": lambda *a: None, "resizeWindow": lambda *a: None,
                     "imshow": lambda name, img: shown.append(img.copy()), "waitKey": wait_key,
                     "getWindowProperty": lambda *a: 1.0, "setWindowProperty": lambda *a: None,
                     "destroyAllWindows": lambda: None}.items():
        monkeypatch.setattr(cv2, name, fn)

    t0 = time.perf_counter()
    main.main()
    assert time.perf_counter() - t0 < 120

    engine, camera = engines[0], cameras[0]
    assert camera.released and engine._closed                     # cleaned up on 'q'
    assert len(shown) == 59 and shown[0].shape == (720, 1280, 3)   # one window update per frame until 'q'
    effects = [name for name, _ in engine.results]
    assert effects[:9] == [None] * 9 and effects[9] == "shadow_clone"   # key '1' before the 10th frame
    assert max(drawn for _, drawn in engine.results) >= 5         # clones really drawn
    hud = shown[0][0:60, 0:200]                                     # HUD on: FPS text in the corner
    assert not np.array_equal(hud, camera.frames[0][0:60, 0:200])

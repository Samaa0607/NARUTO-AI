"""The SHINOBI AI pipeline for one camera stream, without window, keyboard or HUD.

Used by the desktop app (shinobi/main.py) and by the web server (shinobi/server.py: one Engine per
browser session, so two users never share recognition state). Per frame, in this order:

    YOLOX submit (own thread, newest frame, never waited for)
    segmentation (worker thread, only while the active effect needs it)
    hand tracking  ->  landmark classifier  ->  SignFusion  ->  ActionController  (a jutsu fires)
    AnchorTracker  ->  effects  ->  hand landmarks (optional)

A fired jutsu's effect first builds up (voice, charge, name: effects/base.py, timed by that jutsu's
voice clips) and then releases its main effect; result.effect_phase says which stage it is in.

An Engine is NOT thread-safe: call all of its methods from one thread. Its MediaPipe objects are
then never used by two threads at once (the segmenter only runs on its worker thread, and that job
is always finished before process() returns).
"""

import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import numpy as np

from shinobi import config
from shinobi.classifier import GestureClassifier
from shinobi.controller import ActionController
from shinobi.effects import EFFECTS, activation_stages
from shinobi.effects.base import EffectManager
from shinobi.features import extract, hands_to_arrays
from shinobi.fusion import SignFusion
from shinobi.hands import HandTracker, draw_hands
from shinobi.segmentation import PersonSegmenter
from shinobi.tracking import AnchorTracker

AUTO = "auto"   # Engine(classifier=AUTO): load models/gesture_model.joblib if it exists


def start_seal_worker():
    """YOLOX in its own thread, or None when the model file or onnxruntime is missing (the app still runs)."""
    if not config.SEAL_MODEL_PATH.exists():
        print(f"YOLOX off: {config.SEAL_MODEL_PATH} not found")
        return None
    try:
        from shinobi.seal_detector import SealDetector, SealWorker
    except ImportError as e:
        print(f"YOLOX off: {e}")
        return None
    return SealWorker(SealDetector())


@dataclass
class EngineResult:
    """Everything one processed frame produced (what the HUD and the web server show)."""
    frame: np.ndarray            # output image: effect drawn, plus landmarks if draw_landmarks (no HUD)
    now: float                   # the time given to process()
    dt: float                    # seconds since the previous frame, clamped to 0.1 (effects / particles)
    fps: float                   # smoothed frame rate, same formula as the old main loop
    timings: dict                # ms per stage: hands, model, yolox, seg, fx (a stage that did not run is missing)
    hands: list                  # Hand objects, left to right
    tracking: object             # AnchorTracker output (the hand the effects follow)
    probs: np.ndarray = None     # landmark classifier probabilities (None: no model or no hand)
    fused: object = None         # FusionResult: this frame's sign decision (None: no recognizer loaded)
    state: object = None         # ControllerState (None: no recognizer loaded)
    stabilizer: object = None    # the controller's GestureStabilizer (None: no recognizer loaded)
    status: str = None           # "sign: tiger [yolox 0.93]  conflicts 0" (None: no recognizer loaded)
    history: list = field(default_factory=list)   # recent confirmed signs (empty after an activation or a reset)
    progress: dict = field(default_factory=dict)  # {jutsu: steps done} for the jutsu that can fire now
    time_left: float = None      # seconds left to show the next sign (None: nothing in progress, or practice)
    time_left_per_jutsu: dict = None   # {jutsu: seconds left} for every jutsu in progress (free mode)
    ready: bool = True           # signs are being recognised (False while the AI is still getting ready)
    cooldown: float = 0.0        # seconds before another jutsu may fire
    effect: object = None        # the active Effect after rendering (None: no effect)
    effect_id: int = None        # number of that activation (1, 2, ...): a new activation = a new number
    effect_jutsu: str = None     # jutsu that started that effect (None: started by start_effect)
    effect_phase: str = None     # "voice" / "charge" / "name" (build-up) or "release" (None: no effect)
    effect_phase_left: float = None   # seconds left in that build-up stage (None in "release")


class Engine:
    def __init__(self, classifier=AUTO, yolox=True, jutsu=None, draw_landmarks=False):
        """classifier: AUTO (load the trained landmark model if it exists), None (off), or a loaded
        GestureClassifier, which may be shared by several engines (it is only read).
        yolox: start this engine's own YOLOX worker (if the model and onnxruntime are there).
        jutsu: {id: spec} that can fire (default: config.JUTSU, all of them)."""
        self.hands_tracker = HandTracker()
        self.segmenter = PersonSegmenter()
        self.seg_worker = ThreadPoolExecutor(max_workers=1)   # runs segmentation in parallel with hand tracking
        self.anchor = AnchorTracker()
        self.effects = EffectManager(EFFECTS)

        # Two recognisers, one decision per frame (shinobi/fusion.py): YOLOX for the official seals,
        # the landmark classifier for clone_seal / rasengan_palm. Either one alone also works.
        if classifier is AUTO:
            classifier = GestureClassifier() if GestureClassifier.exists() else None
        self.classifier = classifier
        self.seal_worker = start_seal_worker() if yolox else None
        self.fusion = SignFusion() if (self.classifier or self.seal_worker) else None
        self.jutsu = dict(config.JUTSU if jutsu is None else jutsu)
        self.controller = ActionController(config.GESTURES, jutsu=self.jutsu) if self.fusion else None

        self.draw_landmarks = draw_landmarks
        self.last_time, self.fps = time.perf_counter(), 0.0
        # Readiness: no sign counts until READY_FRAMES frames in a row ran in under READY_MAX_MS
        # (warm models, camera frames arriving). Before that no step can start, so no time limit.
        self.ready = False
        self._ready_run = 0
        # the clock of the sequence time limit: only time the AI could see the user (see process)
        self.seq_clock = 0.0
        self._seq_last = None
        self._activation = (None, 0, None)          # (effect object, activation number, jutsu)
        self._size = None                           # (height, width) of the frames so far
        self._rendered = None                       # the effect object rendered in the last frame
        self._closed = False

    def warm_up(self, timeout=15.0):
        """Run every model once on a blank frame before the first camera frame: the first run of
        MediaPipe, YOLOX and the person segmenter takes up to a few seconds (measured: 1.8 s for the
        first frame of a session), and signs made meanwhile would be missed or delayed. Leaves no
        recognition state behind; the engine is still not `ready` until real frames run at pace."""
        blank = np.full((480, 640, 3), 128, np.uint8)
        for _ in range(2):
            self.hands_tracker.detect(blank)
        if self.seal_worker:
            self.seal_worker.submit(blank, time.perf_counter())
            end = time.perf_counter() + timeout
            while self.seal_worker.result is None and time.perf_counter() < end:
                time.sleep(0.02)
            self.seal_worker.result = None
        try:
            self.segmenter.segment(blank)       # Shadow Clone: no stall when the clones appear
        finally:
            self.segmenter.reset()
        if self.fusion:                         # fresh decision state
            self.fusion = SignFusion()
            max_gap = self.controller.matcher.max_gap if self.controller else config.SEQUENCE_MAX_GAP
            self.controller = ActionController(config.GESTURES, jutsu=self.jutsu, max_gap=max_gap)
        self.anchor = AnchorTracker()
        self.last_time, self.fps = time.perf_counter(), 0.0

    # ------------------------------------------------------------------ control
    @property
    def stabilizer(self):
        return self.controller.stabilizer if self.controller else None

    def start_effect(self, name, now, jutsu=None, staged=False):
        """Start an effect; it replaces the running one. staged=True (a jutsu fired by its sequence):
        it builds up first (voice, charge, name), timed by that jutsu's voice clips
        (effects.activation_stages). By hand (desktop keys 1-4): the main effect starts at once."""
        self.effects.start(name, now, activation_stages(jutsu) if staged else None)
        self._activation = (self.effects.active, self._activation[1] + 1, jutsu)

    def stop_effect(self, now):
        """Fade the running effect out (desktop key 0)."""
        self.effects.stop(now)

    def set_jutsu(self, jutsu, practice=False):
        """Choose which jutsu can fire: config.JUTSU = all (free mode), {id: config.JUTSU[id]} = practice.
        practice=True: no time limit between the steps (free mode: config.SEQUENCE_MAX_GAP).
        Starts a fresh sequence state (new ActionController); the running effect keeps running."""
        self.jutsu = dict(jutsu)
        if self.fusion:
            self.controller = ActionController(config.GESTURES, jutsu=self.jutsu,
                                               max_gap=None if practice else config.SEQUENCE_MAX_GAP)

    def reset_sequence(self):
        """Forget every sequence in progress (Retry / Reset). Cooldown and effect are kept."""
        if self.controller:
            self.controller.matcher.reset()

    # ------------------------------------------------------------------ one frame
    def _new_frame_size(self, size):
        """The frames changed size (a browser switched camera or turned portrait). The desktop camera
        never does this. Old pixel positions mean nothing at the new size, and the Shadow Clone keeps
        a layer of the previous frame size (its worker is one frame behind), which cannot be blended
        onto the new one: that effect ends, the others simply continue at the new size."""
        if self._size is not None:
            if self.effects.needs_segmentation and self._rendered is self.effects.active:
                self.effects.active = None
            self.segmenter.reset()
            self.anchor = AnchorTracker()
        self._size = size

    def process(self, frame, now):
        """Run the whole pipeline on one BGR frame (any size). `now` = capture time (perf_counter)."""
        frame_start = time.perf_counter()
        dt = min(now - self.last_time, 0.1)                 # clamp: a hiccup must not explode particles
        # the sequence clock advances by at most SEQUENCE_CLOCK_MAX_STEP per processed frame: time the
        # AI could not see the user (a stall) does not count against the Live time limit
        if self._seq_last is not None:
            self.seq_clock += min(max(now - self._seq_last, 0.0), config.SEQUENCE_CLOCK_MAX_STEP)
        self._seq_last = now
        self.last_time = now
        self.fps = 0.9 * self.fps + 0.1 / max(dt, 1e-3)
        timings = {}
        if frame.shape[:2] != self._size:
            self._new_frame_size(frame.shape[:2])

        # 1) perception. YOLOX gets the newest frame (its own thread, max SEAL_RATE_HZ, never waited
        #    for). Segmentation (only when the active effect needs it) starts on the worker thread,
        #    so the models run at the same time on different CPU cores.
        if self.seal_worker:
            self.seal_worker.submit(frame, now)
        seg_job = None
        if self.effects.needs_segmentation:
            seg_start = time.perf_counter()
            seg_job = self.seg_worker.submit(self.segmenter.segment, frame)
        t = time.perf_counter()
        hands = self.hands_tracker.detect(frame)
        timings["hands"] = (time.perf_counter() - t) * 1000

        # 2) recognition -> fusion -> controller (a jutsu fires only after its full sequence)
        probs = fused = state = status = None
        if self.fusion:
            t = time.perf_counter()
            if self.classifier and hands:
                h, w = frame.shape[:2]
                probs = self.classifier.predict(extract(*hands_to_arrays(hands), aspect=w / h))
            fused = self.fusion.update(probs, self.classifier.labels if self.classifier else None,
                                       self.seal_worker.result if self.seal_worker else None, hands, now,
                                       yolox_running=self.seal_worker is not None)
            # not ready yet: the frame is processed (models, smoothing) but counts as no sign
            state = self.controller.update(fused.probs if self.ready else None, now, seq_now=self.seq_clock)
            if state.effect:
                self.start_effect(state.effect, now, jutsu=state.jutsu, staged=True)
            timings["model"] = (time.perf_counter() - t) * 1000
            if self.seal_worker and self.seal_worker.result:
                timings["yolox"] = self.seal_worker.result.latency_ms
            status = f"sign: {fused.sign} [{fused.source} {fused.score:.2f}]  conflicts {self.fusion.conflicts}"

        # 3) effects
        tracking = self.anchor.update(hands, now)
        segmentation = None
        if seg_job is not None:
            segmentation = seg_job.result()               # wait for the worker (usually already done)
            timings["seg"] = (time.perf_counter() - seg_start) * 1000
        t = time.perf_counter()
        output = self.effects.render(frame, tracking, dt, segmentation)
        timings["fx"] = (time.perf_counter() - t) * 1000
        self._rendered = self.effects.active
        if self.effects.active is None:
            self.segmenter.reset()

        # 4) overlay
        if self.draw_landmarks:
            output = draw_hands(output, hands)

        result = EngineResult(frame=output, now=now, dt=dt, fps=self.fps, timings=timings, hands=hands,
                              tracking=tracking, probs=probs, fused=fused, state=state, status=status)
        if self.controller:
            result.stabilizer = self.controller.stabilizer
            result.time_left = self.controller.matcher.time_left(self.seq_clock)
            result.time_left_per_jutsu = self.controller.matcher.time_left_all(self.seq_clock)
            result.history = list(state.history)
            result.progress = dict(state.progress)
            result.cooldown = self.controller.cooldown_left(now)
        else:
            result.progress = {name: 0 for name in self.jutsu}
        effect, number, jutsu = self._activation
        if self.effects.active is not None:
            result.effect = self.effects.active
            same = effect is self.effects.active
            result.effect_id = number if same else None
            result.effect_jutsu = jutsu if same else None
            result.effect_phase, result.effect_phase_left = result.effect.phase(now)
        if not self.ready:
            took = (time.perf_counter() - frame_start) * 1000
            self._ready_run = self._ready_run + 1 if took < config.READY_MAX_MS else 0
            self.ready = self._ready_run >= config.READY_FRAMES
        result.ready = self.ready
        return result

    # ------------------------------------------------------------------ end
    def close(self):
        """Stop the worker threads and release the models. Safe to call twice."""
        if self._closed:
            return
        self._closed = True
        if self.seal_worker:
            self.seal_worker.close()
        self.seg_worker.shutdown()
        self.hands_tracker.close()
        self.segmenter.close()
        self._rendered = None
        self.effects.active = None          # a Shadow Clone's worker thread ends with its effect
        self._activation = (None, self._activation[1], None)

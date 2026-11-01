"""YOLOX-Nano hand-seal detector, running in its own thread on the newest camera frame.

Model: Kazuhito00/NARUTO-HandSignDetection (licences: models/THIRD_PARTY_YOLOX.md). The pre- and
post-processing below re-implement the repo's yolox_onnx.py: BGR 0..255 (no normalisation),
letterbox to the TOP-LEFT of a 114-grey 416 x 416 canvas, output (1, 3549, 21) per anchor =
dx, dy, log w, log h, objectness, 16 class scores (already sigmoid), anchors on strides 8/16/32,
score = objectness * class, class-agnostic NMS at IoU 0.45.
"""

import threading
import time
from dataclasses import dataclass

import cv2
import numpy as np
import onnxruntime as ort

from shinobi import config


@dataclass
class Detection:
    sign: str          # our sign name, or None for a class no jutsu uses
    class_id: int      # model class id
    score: float
    box: tuple         # (x0, y0, x1, y1) in pixels of the frame given to SealWorker.submit


@dataclass
class SealResult:
    id: int            # increases by one per detection run
    time: float        # capture time of the frame it was computed on (perf_counter seconds)
    latency_ms: float  # how long the detection took
    detections: list   # Detection, best first


def nms(boxes, scores, iou):
    """Greedy non-maximum suppression; returns the kept indices, best first."""
    order, keep = np.argsort(-scores), []
    area = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
    while len(order):
        i, order = order[0], order[1:]
        keep.append(int(i))
        x0 = np.maximum(boxes[i, 0], boxes[order, 0])
        y0 = np.maximum(boxes[i, 1], boxes[order, 1])
        x1 = np.minimum(boxes[i, 2], boxes[order, 2])
        y1 = np.minimum(boxes[i, 3], boxes[order, 3])
        inter = np.clip(x1 - x0, 0, None) * np.clip(y1 - y0, 0, None)
        order = order[inter / (area[i] + area[order] - inter + 1e-9) <= iou]
    return keep


class SealDetector:
    def __init__(self, path=config.SEAL_MODEL_PATH, size=config.SEAL_INPUT_SIZE, threads=config.SEAL_THREADS):
        options = ort.SessionOptions()
        options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        options.add_session_config_entry("session.intra_op.allow_spinning", "0")   # no busy-waiting cores
        self.session = ort.InferenceSession(str(path), options, providers=["CPUExecutionProvider"])
        self.input = self.session.get_inputs()[0].name
        self.size = size
        grids, strides = [], []
        for stride in (8, 16, 32):
            n = size // stride
            ys, xs = np.meshgrid(np.arange(n), np.arange(n), indexing="ij")
            grids.append(np.stack([xs, ys], -1).reshape(-1, 2))
            strides.append(np.full((n * n, 1), stride))
        self.grids = np.concatenate(grids).astype(np.float32)
        self.strides = np.concatenate(strides).astype(np.float32)

    def detect(self, frame, min_score=0.1, iou=0.45):
        """All detections above min_score, best first, boxes in frame pixels."""
        h, w = frame.shape[:2]
        r = min(self.size / h, self.size / w)
        nw, nh = int(w * r), int(h * r)
        canvas = np.full((self.size, self.size, 3), 114, np.uint8)
        canvas[:nh, :nw] = frame if (nw, nh) == (w, h) else cv2.resize(frame, (nw, nh), interpolation=cv2.INTER_LINEAR)
        out = self.session.run(None, {self.input: canvas.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]

        scores = out[:, 4:5] * out[:, 5:]
        cls = scores.argmax(1)
        best = scores[np.arange(len(cls)), cls]
        keep = best > min_score
        if not keep.any():
            return []
        xy = (out[keep, :2] + self.grids[keep]) * self.strides[keep]
        wh = np.exp(out[keep, 2:4]) * self.strides[keep]
        boxes = np.concatenate([xy - wh / 2, xy + wh / 2], 1) / r
        best, cls = best[keep], cls[keep]
        return [Detection(config.SEAL_CLASSES.get(int(cls[i])), int(cls[i]), float(best[i]),
                          tuple(float(v) for v in np.clip(boxes[i], 0, [w, h, w, h])))
                for i in nms(boxes, best, iou)]


class SealWorker:
    """Runs a SealDetector in a background thread on the newest submitted frame, at most rate_hz per second.

    The main loop never waits for it: it submits every frame and reads `result` (the latest one).
    """

    def __init__(self, detector, rate_hz=config.SEAL_RATE_HZ):
        self.detector = detector
        self.period = 1.0 / rate_hz
        self.result = None
        self._pending = None                        # (small_frame, scale, capture_time)
        self._cond = threading.Condition()
        self._stop = False
        self._thread = threading.Thread(target=self._run, name="seal-detector", daemon=True)
        self._thread.start()

    def submit(self, frame, now):
        """Hand over the newest frame (an older one that was not processed yet is dropped)."""
        h, w = frame.shape[:2]
        size = self.detector.size
        small = cv2.resize(frame, (size, round(h * size / w)), interpolation=cv2.INTER_LINEAR)   # also a copy
        with self._cond:
            self._pending = (small, w / size, now)
            self._cond.notify()

    def _run(self):
        next_start, run_id = 0.0, 0
        while True:
            delay = next_start - time.perf_counter()
            if delay > 0:
                time.sleep(delay)                   # rate limit, then take whatever frame is newest
            with self._cond:
                while self._pending is None and not self._stop:
                    self._cond.wait()
                if self._stop:
                    return
                small, scale, stamp = self._pending
                self._pending = None
            t0 = time.perf_counter()
            next_start = t0 + self.period
            detections = self.detector.detect(small)
            for d in detections:                    # back to full-frame pixels
                d.box = tuple(v * scale for v in d.box)
            run_id += 1
            self.result = SealResult(run_id, stamp, (time.perf_counter() - t0) * 1000, detections)

    def close(self):
        with self._cond:
            self._stop = True
            self._cond.notify()
        self._thread.join(timeout=2)

"""Person segmentation (MediaPipe selfie segmenter) with temporal smoothing and edge refinement."""

import time

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

from shinobi import config


class PersonSegmenter:
    def __init__(self, work_width=config.SEGMENT_WIDTH, smoothing=config.MASK_SMOOTHING):
        options = vision.ImageSegmenterOptions(
            base_options=BaseOptions(model_asset_path=str(config.SEGMENTER_MODEL_PATH)),
            running_mode=vision.RunningMode.VIDEO,
            output_confidence_masks=True,
            output_category_mask=False,
        )
        self._segmenter = vision.ImageSegmenter.create_from_options(options)
        self.work_width = work_width
        self.smoothing = smoothing
        self._prev = None
        self._last_ts = -1

    def _timestamp(self):
        ts = int(time.monotonic() * 1000)
        self._last_ts = max(ts, self._last_ts + 1)
        return self._last_ts

    def segment(self, frame_bgr):
        """Return (small_frame, mask): both at work resolution, mask float32 0..1 (1 = person)."""
        h, w = frame_bgr.shape[:2]
        small_h = int(h * self.work_width / w)
        small = cv2.resize(frame_bgr, (self.work_width, small_h), interpolation=cv2.INTER_AREA)

        rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
        result = self._segmenter.segment_for_video(
            mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), self._timestamp())
        mask = result.confidence_masks[0].numpy_view().reshape(small_h, self.work_width).copy()

        # 1) temporal EMA: removes flicker between frames
        if self._prev is not None and self._prev.shape == mask.shape:
            mask = self.smoothing * mask + (1 - self.smoothing) * self._prev
        self._prev = mask

        # 2) guided filter: snaps the mask edge to real edges in the image (hair, shoulders).
        #    A gray guide is ~2x faster than a color one and looks almost the same.
        #    The guide must be 0..1: with 0..255 values the local variance of flat areas (a plain
        #    or over-exposed wall) loses its precision in float32, var + eps reaches 0 and the
        #    mask fills with NaN (measured: 82 of 180 recorded frames; 0 with the 0..1 guide).
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
        mask = cv2.ximgproc.guidedFilter(gray, mask, 6, 1e-3)

        # 3) soft contrast curve: crisp but feathered edge
        mask = np.clip((mask - 0.3) / 0.4, 0.0, 1.0)
        return small, mask.astype(np.float32)

    def reset(self):
        self._prev = None

    def close(self):
        self._segmenter.close()

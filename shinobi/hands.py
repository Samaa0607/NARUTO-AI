"""MediaPipe Hand Landmarker wrapper (Tasks API, mediapipe >= 1.0)."""

import time
from dataclasses import dataclass

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions, vision

from shinobi import config

# Landmark indices (see docs/02_camera_and_hands.md for the full map)
WRIST, THUMB_TIP, INDEX_MCP, INDEX_TIP, MIDDLE_MCP, MIDDLE_TIP = 0, 4, 5, 8, 9, 12
RING_MCP, PINKY_MCP = 13, 17
FINGERTIPS = [4, 8, 12, 16, 20]
PALM = [0, 5, 9, 13, 17]

CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),          # thumb
    (0, 5), (5, 6), (6, 7), (7, 8),          # index
    (5, 9), (9, 10), (10, 11), (11, 12),     # middle
    (9, 13), (13, 14), (14, 15), (15, 16),   # ring
    (13, 17), (0, 17), (17, 18), (18, 19), (19, 20),  # pinky + palm
]


@dataclass
class Hand:
    landmarks: np.ndarray   # (21, 3) normalized: x,y in 0..1 of the image, z relative depth
    world: np.ndarray       # (21, 3) metres, origin near the hand centre
    handedness: str         # "Left" / "Right" (correct for a mirrored image)
    score: float
    px: np.ndarray          # (21, 2) pixel coordinates in the frame

    @property
    def palm_center(self):
        return self.px[PALM].mean(axis=0)

    @property
    def size_px(self):
        """Wrist -> middle-finger knuckle distance: a scale reference for effects."""
        return float(np.linalg.norm(self.px[MIDDLE_MCP] - self.px[WRIST]))


class HandTracker:
    def __init__(self):
        options = vision.HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(config.HAND_MODEL_PATH)),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=config.MAX_HANDS,
            min_hand_detection_confidence=config.MIN_DETECTION_CONFIDENCE,
            min_hand_presence_confidence=config.MIN_PRESENCE_CONFIDENCE,
            min_tracking_confidence=config.MIN_TRACKING_CONFIDENCE,
        )
        self._landmarker = vision.HandLandmarker.create_from_options(options)
        self._last_ts = -1

    def _timestamp(self):
        # VIDEO mode requires strictly increasing timestamps in milliseconds.
        ts = int(time.monotonic() * 1000)
        self._last_ts = max(ts, self._last_ts + 1)
        return self._last_ts

    def detect(self, frame_bgr):
        """Return a list of Hand objects sorted left-to-right on screen."""
        h, w = frame_bgr.shape[:2]
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = self._landmarker.detect_for_video(image, self._timestamp())

        hands = []
        for lms, world, handed in zip(result.hand_landmarks, result.hand_world_landmarks,
                                      result.handedness):
            norm = np.array([[p.x, p.y, p.z] for p in lms], dtype=np.float32)
            wld = np.array([[p.x, p.y, p.z] for p in world], dtype=np.float32)
            px = norm[:, :2] * np.array([w, h], dtype=np.float32)
            hands.append(Hand(norm, wld, handed[0].category_name, handed[0].score, px))

        # Order by wrist x, not by handedness: handedness flips when hands overlap.
        hands.sort(key=lambda hand: hand.landmarks[WRIST, 0])
        return hands

    def close(self):
        self._landmarker.close()


def draw_hands(frame, hands):
    for hand in hands:
        pts = hand.px.astype(int)
        for a, b in CONNECTIONS:
            cv2.line(frame, tuple(pts[a]), tuple(pts[b]), (255, 255, 255), 2, cv2.LINE_AA)
        for i, p in enumerate(pts):
            color = (0, 200, 255) if i in FINGERTIPS else (0, 120, 255)
            cv2.circle(frame, tuple(p), 4, color, -1, cv2.LINE_AA)
        x, y = pts[WRIST]
        cv2.putText(frame, hand.handedness, (x - 20, y + 25), cv2.FONT_HERSHEY_SIMPLEX,
                    0.6, (255, 255, 255), 2, cv2.LINE_AA)
    return frame

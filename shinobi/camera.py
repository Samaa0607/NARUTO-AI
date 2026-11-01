"""Threaded webcam capture that always hands out the newest frame."""

import threading
import time

import cv2

from shinobi import config


def _open(index, width, height):
    # Media Foundation (MSMF) delivers 30 FPS at 720p on this laptop; DirectShow only ~10.
    cap = cv2.VideoCapture(index, cv2.CAP_MSMF)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    return cap


def _is_real(cap, tries=10):
    """Virtual cameras (e.g. Camo with no phone attached) open fine but send black frames."""
    for _ in range(tries):
        ok, frame = cap.read()
        if ok and frame is not None and frame.mean() > 5:
            return True
    return False


def find_camera(width, height, max_index=4):
    """Return (index, capture) of the first camera that shows a real picture."""
    for index in range(max_index):
        cap = _open(index, width, height)
        if cap.isOpened() and _is_real(cap):
            return index, cap
        cap.release()
    raise RuntimeError("No working camera found. Check that the webcam is not disabled or in use.")


class Camera:
    def __init__(self, index=config.CAMERA_INDEX, width=config.CAMERA_WIDTH,
                 height=config.CAMERA_HEIGHT, mirror=config.MIRROR):
        if index is None:
            index, self.cap = find_camera(width, height)
        else:
            self.cap = _open(index, width, height)
            if not self.cap.isOpened():
                raise RuntimeError(f"Cannot open camera {index}. Set CAMERA_INDEX = None in config.py")
        self.index = index
        self.mirror = mirror
        print(f"camera {index}: {int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x"
              f"{int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}")

        self._frame = None
        self._frame_id = 0
        self._lock = threading.Lock()
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def _loop(self):
        while self._running:
            ok, frame = self.cap.read()
            if not ok:
                time.sleep(0.01)
                continue
            if self.mirror:
                frame = cv2.flip(frame, 1)
            with self._lock:
                self._frame = frame
                self._frame_id += 1

    def read(self):
        """Return (frame_id, frame). frame_id lets callers skip frames they already processed."""
        with self._lock:
            return self._frame_id, self._frame

    def release(self):
        self._running = False
        self._thread.join(timeout=1.0)
        self.cap.release()

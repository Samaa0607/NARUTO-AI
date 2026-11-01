"""Combine the two sign recognisers into ONE decision per frame.

Who owns what (config.py):
  * YOLOX (shinobi/seal_detector.py): the 7 official seals used by the jutsu.
  * landmark classifier (shinobi/classifier.py): clone_seal and rasengan_palm, which YOLOX has
    no classes for. If YOLOX is not running at all, it may also report an official seal, but
    only when it is very sure (LANDMARK_BACKUP_PROB).

A landmark sign (clone_seal, rasengan_palm) is accepted only if the classifier is sure of it: probability
>= LANDMARK_MIN_PROB AND top1 - top2 >= LANDMARK_MIN_MARGIN, and for rasengan_palm a hand really shows an
open palm (open_palm: thumb tip away from the index tip). Anything less is no sign in that frame, so an
uncertain prediction can never be held, confirmed, or advance a jutsu.

A YOLOX seal is accepted only if
  1. its result is fresh (computed on a frame at most SEAL_MAX_AGE old),
  2. its box lies on a hand that MediaPipe sees (score >= SEAL_MIN_SCORE), or MediaPipe sees no
     hand at all, which happens with seals that hide the fingers (score >= SEAL_NO_HAND_SCORE),
  3. the same seal won SEAL_CONFIRM YOLOX results in a row.
If YOLOX and the landmark classifier both claim a sign, the higher score wins and the conflict
is counted. The output is one-hot (the chosen sign, or idle): thresholds are applied here, and
the GestureStabilizer downstream only adds the hold time and hysteresis, so there is a single
stream of decisions and no sign can be reported twice by two models.
"""

from dataclasses import dataclass

import numpy as np

from shinobi import config


@dataclass
class FusionResult:
    probs: np.ndarray       # one-hot over `labels` (the chosen sign, else idle)
    sign: str               # chosen sign or "idle"
    source: str             # "yolox", "landmarks", "landmarks-backup" or "none"
    score: float            # the winning model's own score (0 for idle)
    conflict: bool = False  # both models claimed a sign this frame


def hand_boxes(hands, margin=0.25):
    """Pixel boxes around the hands MediaPipe found, grown by `margin` of their size."""
    boxes = []
    for hand in hands:
        (x0, y0), (x1, y1) = hand.px.min(axis=0), hand.px.max(axis=0)
        mx, my = (x1 - x0) * margin, (y1 - y0) * margin
        boxes.append((x0 - mx, y0 - my, x1 + mx, y1 + my))
    return boxes


def open_palm(hands, min_gap=config.PALM_MIN_THUMB_GAP):
    """True if a hand shows an OPEN palm: its thumb tip is at least `min_gap` x the hand's size
    (wrist -> middle knuckle, 3D world landmarks) away from its index tip. An OK sign (thumb and index
    touching) fails; a hand without usable 3D landmarks fails too."""
    for hand in hands:
        w = np.asarray(hand.world, np.float32)
        size = float(np.linalg.norm(w[9] - w[0]))
        if size > 1e-4 and float(np.linalg.norm(w[4] - w[8])) / size >= min_gap:
            return True
    return False


def overlaps(a, b):
    return min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])


class SignFusion:
    def __init__(self, labels=config.GESTURES, landmark_signs=config.LANDMARK_SIGNS,
                 min_score=config.SEAL_MIN_SCORE, no_hand_score=config.SEAL_NO_HAND_SCORE,
                 confirm=config.SEAL_CONFIRM, max_age=config.SEAL_MAX_AGE,
                 landmark_min=config.LANDMARK_MIN_PROB, landmark_backup=config.LANDMARK_BACKUP_PROB,
                 landmark_margin=config.LANDMARK_MIN_MARGIN, palm_gap=config.PALM_MIN_THUMB_GAP):
        self.labels = list(labels)
        self.idle = self.labels.index("idle")
        self.landmark_signs = set(landmark_signs)
        self.min_score, self.no_hand_score = min_score, no_hand_score
        self.confirm, self.max_age = confirm, max_age
        self.landmark_min, self.landmark_backup = landmark_min, landmark_backup
        self.landmark_margin, self.palm_gap = landmark_margin, palm_gap
        self.rejected = 0                   # landmark signs refused as unsure / not an open palm (evaluation)
        self.conflicts = 0                  # how often both models claimed a sign (for the HUD / evaluation)
        self._last_id = None                # last YOLOX result already counted
        self._streak = (None, 0, 0.0)       # (seal, results in a row, latest score)

    def _seal_from(self, result, hands):
        """The best usable seal in one YOLOX result: (sign, score) or None."""
        boxes = hand_boxes(hands)
        for d in result.detections:                         # best first
            if d.sign is None:
                continue                                    # a seal no jutsu uses
            if boxes and d.score >= self.min_score and any(overlaps(d.box, b) for b in boxes):
                return d.sign, d.score
            if not boxes and d.score >= self.no_hand_score:
                return d.sign, d.score
        return None

    def _seal(self, result, hands, now):
        """Confirmed YOLOX seal for this frame: (sign, score) or None."""
        if result is None or now - result.time > self.max_age:
            self._streak = (None, 0, 0.0)                   # stale: start the confirmation over
            return None
        if result.id != self._last_id:                      # a new YOLOX result: update the streak
            self._last_id = result.id
            seal = self._seal_from(result, hands)
            if seal is None:
                self._streak = (None, 0, 0.0)
            elif seal[0] == self._streak[0]:
                self._streak = (seal[0], self._streak[1] + 1, seal[1])
            else:
                self._streak = (seal[0], 1, seal[1])
        sign, count, score = self._streak
        return (sign, score) if sign is not None and count >= self.confirm else None

    def _sure(self, landmark_probs, sign, hands):
        """A landmark sign the classifier picked is usable only with a clear margin over the runner-up,
        and rasengan_palm only on a hand that shows an open palm."""
        top2 = np.sort(np.asarray(landmark_probs, np.float32))[-2:]
        if float(top2[1] - top2[0]) < self.landmark_margin:
            return False
        return sign != "rasengan_palm" or open_palm(hands, self.palm_gap)

    def update(self, landmark_probs, landmark_labels, seal_result, hands, now, yolox_running=True):
        """One decision for this frame.

        landmark_probs / landmark_labels: classifier output (None if no model or no hand).
        seal_result: SealWorker.result (None if YOLOX is off or has not run yet).
        """
        candidate, conflict = None, False
        seal = self._seal(seal_result, hands, now) if yolox_running else None
        if seal is not None:
            candidate = (seal[0], seal[1], "yolox")

        if landmark_probs is not None:
            i = int(np.argmax(landmark_probs))
            sign, p = landmark_labels[i], float(landmark_probs[i])
            if sign in self.landmark_signs and p >= self.landmark_min and not self._sure(landmark_probs, sign, hands):
                self.rejected += 1          # unsure, or not an open palm: no sign from the landmarks
            elif sign in self.landmark_signs and p >= self.landmark_min:
                if candidate is None:
                    candidate = (sign, p, "landmarks")
                else:                                       # both models claim a sign
                    conflict = True
                    self.conflicts += 1
                    if p > candidate[1]:
                        candidate = (sign, p, "landmarks")
            elif (candidate is None and not yolox_running and sign != "idle"
                  and sign not in self.landmark_signs and p >= self.landmark_backup):
                candidate = (sign, p, "landmarks-backup")   # YOLOX off: very sure landmarks only

        probs = np.zeros(len(self.labels), np.float32)
        if candidate is None or candidate[0] not in self.labels:
            probs[self.idle] = 1.0
            return FusionResult(probs, "idle", "none", 0.0, conflict)
        probs[self.labels.index(candidate[0])] = 1.0
        return FusionResult(probs, candidate[0], candidate[2], candidate[1], conflict)

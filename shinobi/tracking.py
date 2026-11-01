"""Picks the hand that effects should follow and smooths its position, size and direction."""

from dataclasses import dataclass

import numpy as np

from shinobi import config
from shinobi.filters import OneEuroFilter
from shinobi.hands import MIDDLE_MCP, WRIST


@dataclass
class Tracking:
    hands: list                 # all detected hands this frame
    now: float
    visible: bool = False       # anchor hand seen now (or lost for less than the grace period)
    anchor: np.ndarray = None   # smoothed palm centre in pixels
    size: float = 0.0           # smoothed hand size in pixels
    direction: np.ndarray = None  # unit vector wrist -> middle knuckle (where the hand points)


class AnchorTracker:
    def __init__(self, grace=config.HAND_LOST_GRACE):
        self.grace = grace
        self.pos_filter = OneEuroFilter()
        self.size_filter = OneEuroFilter(min_cutoff=0.8, beta=0.0)
        self.dir_filter = OneEuroFilter(min_cutoff=1.0, beta=0.0)
        self.last = Tracking(hands=[], now=0.0)
        self.last_seen = -1e9

    def _pick(self, hands):
        # Stay on the hand closest to where we were, so the effect does not jump between hands.
        if self.last.anchor is not None:
            dists = [np.linalg.norm(h.palm_center - self.last.anchor) for h in hands]
            best = int(np.argmin(dists))
            if dists[best] < 3 * max(self.last.size, 40):
                return hands[best]
        return max(hands, key=lambda h: h.size_px)   # otherwise the biggest (closest) hand

    def update(self, hands, now):
        if hands:
            hand = self._pick(hands)
            vec = hand.px[MIDDLE_MCP] - hand.px[WRIST]
            direction = self.dir_filter(vec / (np.linalg.norm(vec) + 1e-6), now)
            self.last = Tracking(
                hands=hands, now=now, visible=True,
                anchor=self.pos_filter(hand.palm_center, now),
                size=float(self.size_filter([hand.size_px], now)[0]),
                direction=direction / (np.linalg.norm(direction) + 1e-6),
            )
            self.last_seen = now
        else:
            visible = now - self.last_seen < self.grace
            self.last = Tracking(hands=[], now=now, visible=visible, anchor=self.last.anchor,
                                 size=self.last.size, direction=self.last.direction)
            if not visible:                 # hand gone for good: next hand starts fresh
                self.pos_filter.reset()
                self.size_filter.reset()
                self.dir_filter.reset()
        return self.last

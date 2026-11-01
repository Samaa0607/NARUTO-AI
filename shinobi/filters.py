"""One Euro filter: smooths jittery positions without adding visible lag.

Reference: Casiez et al., "1€ Filter", CHI 2012 — https://gery.casiez.net/1euro/
Slow movement -> strong smoothing (kills jitter). Fast movement -> light smoothing (no lag).
"""

import math

import numpy as np

from shinobi import config


def _alpha(cutoff, dt):
    tau = 1.0 / (2 * math.pi * cutoff)
    return 1.0 / (1.0 + tau / dt)


class OneEuroFilter:
    def __init__(self, min_cutoff=config.FILTER_MIN_CUTOFF, beta=config.FILTER_BETA, d_cutoff=1.0):
        self.min_cutoff, self.beta, self.d_cutoff = min_cutoff, beta, d_cutoff
        self.x = None       # last filtered value
        self.dx = None      # last filtered speed
        self.t = None

    def __call__(self, value, now):
        value = np.asarray(value, dtype=np.float32)
        if self.x is None:
            self.x, self.dx, self.t = value, np.zeros_like(value), now
            return value
        dt = max(now - self.t, 1e-3)
        self.t = now

        speed = (value - self.x) / dt
        a_d = _alpha(self.d_cutoff, dt)
        self.dx = a_d * speed + (1 - a_d) * self.dx

        cutoff = self.min_cutoff + self.beta * float(np.linalg.norm(self.dx))
        a = _alpha(cutoff, dt)
        self.x = a * value + (1 - a) * self.x
        return self.x

    def reset(self):
        self.x = self.dx = self.t = None

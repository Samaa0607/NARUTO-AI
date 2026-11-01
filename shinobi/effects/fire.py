"""Fire Style: a stream of flame particles blown out of the hand.

Build-up (render_charge): embers are drawn in to a point in front of the hand while a heat glow grows
there. Main effect: the flame jet. Its particles are large and grow as they cool, so they melt into
one fire, and a soft shadow under the light keeps it vivid in a bright room.
"""

import cv2
import numpy as np

from shinobi.effects.base import Effect
from shinobi.effects.fx import Particles, add_glow, color_ramp, random_directions

# BGR color by particle age: white-hot -> yellow -> orange -> red -> dark smoke
FIRE_RAMP = [
    (0.00, (190, 250, 255)),
    (0.15, (60, 220, 255)),
    (0.40, (10, 120, 255)),
    (0.70, (0, 40, 190)),
    (1.00, (10, 10, 30)),
]
# embers of the build-up: orange far out, white-hot when they reach the gathering point
EMBER_RAMP = [(0.0, (0, 70, 230)), (0.6, (20, 160, 255)), (1.0, (170, 240, 255))]


class FireStyle(Effect):
    name = "fire"
    follows_hand = True

    def __init__(self, duration, rate=650, seed=None):
        super().__init__(duration)
        self.rng = np.random.default_rng(seed)
        self.rate = rate               # particles per second
        self.flames = Particles()
        self.embers = Particles()      # the build-up

    @staticmethod
    def _origin(tracking, size):
        """Just past the fingers, in the direction the hand points (where the flames come out)."""
        direction = tracking.direction if tracking.direction is not None else np.array([0.0, -1.0])
        return np.asarray(tracking.anchor, np.float64) + direction * size * 0.9, direction

    def render_charge(self, frame, tracking, dt, segmentation, level, alpha):
        """Embers gather at the point the flames will come out of; a heat glow grows there."""
        if tracking.anchor is None or alpha <= 0:
            return frame
        size = max(30.0, tracking.size)
        origin, _ = self._origin(tracking, size)
        n = int((80 + 320 * level) * dt) + 1
        dirs = random_directions(n, self.rng)
        dist = self.rng.uniform(1.0, 1.8, (n, 1)) * size * (1.6 - 0.6 * level)
        life = self.rng.uniform(0.3, 0.6, n)
        swirl = np.stack([-dirs[:, 1], dirs[:, 0]], axis=1) * 0.35
        self.embers.emit(origin, (-dirs + swirl) * dist / life[:, None], life,
                         self.rng.uniform(0.025, 0.055, n) * size)
        self.embers.pos[-n:] += (dirs * dist).astype(np.float32)
        self.embers.update(dt, gravity=(0, -0.6 * size), drag=0.4)

        layer = np.zeros_like(frame)
        center = (int(origin[0]), int(origin[1]))
        heat = size * (0.15 + 0.35 * level)
        cv2.circle(layer, center, max(2, int(heat)), (10, 90, 230), -1, cv2.LINE_AA)
        cv2.circle(layer, center, max(1, int(heat * 0.45)), (110, 225, 255), -1, cv2.LINE_AA)
        if len(self.embers):
            self.embers.draw(layer, color_ramp(self.embers.t, EMBER_RAMP) * 0.9)
        return add_glow(frame, layer, origin, size * 2.0, strength=0.8 + 0.7 * level, blur=size * 0.35,
                        soften=max(1.5, size * 0.03), opacity=alpha * (0.5 + 0.5 * level), backdrop=0.25 * level)

    def render(self, frame, tracking, dt, segmentation=None):
        now = tracking.now
        self.opacity(now)               # updates self.age and starts the fade-out when time is up
        if tracking.anchor is None:
            return frame

        size = max(30.0, tracking.size)
        origin, direction = self._origin(tracking, size)

        if self.stop_at is None:        # stop feeding the fire once fading out; existing flames die naturally
            n = int(self.rate * dt * min(1.0, self.age / 0.3)) + 1
            angle = np.arctan2(direction[1], direction[0])
            dirs = random_directions(n, self.rng, center_angle=angle, spread=0.35)
            speed = self.rng.uniform(3.0, 7.0, (n, 1)) * size     # a full fireball close to the hand
            self.flames.emit(origin + self.rng.normal(0, size * 0.1, (n, 2)), dirs * speed,
                             self.rng.uniform(0.45, 0.9, n), self.rng.uniform(0.09, 0.2, n) * size)

        # Hot air rises: negative y acceleration pulls flames upward; drag slows the jet.
        self.flames.update(dt, gravity=(0, -3.0 * size), drag=2.2)
        self.embers.update(dt, gravity=(0, -0.6 * size), drag=0.4)      # the build-up's last embers burn out

        if len(self.flames) == 0:
            return frame
        t = self.flames.t
        colors = color_ramp(t, FIRE_RAMP) * (1.0 - t[:, None] ** 2)      # fade as they cool
        sizes = self.flames.size * (1.0 + 2.0 * t)                        # flames expand
        layer = np.zeros_like(frame)
        self.flames.draw(layer, colors * 0.5, sizes)                      # dim: overlaps add up to bright
        if len(self.embers):
            self.embers.draw(layer, color_ramp(self.embers.t, EMBER_RAMP) * 0.9)

        # Glow only around where the flames actually are (their bounding box).
        lo, hi = self.flames.pos.min(axis=0), self.flames.pos.max(axis=0)
        extent = float(np.max(hi - lo)) / 2 + float(sizes.max())
        return add_glow(frame, layer, (lo + hi) / 2, extent, strength=1.0, blur=size * 0.4,
                        soften=max(2.0, size * 0.07), backdrop=0.35)

    def finished(self, now):
        # Wait until the last flames have burned out, not just the fade-out timer.
        return super().finished(now) and len(self.flames) == 0

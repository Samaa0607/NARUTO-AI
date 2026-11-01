"""Rasengan: a spinning blue energy sphere that sits on the palm.

Build-up (render_charge): chakra streaks spiral into the palm and a small sphere forms there, growing
with the charge. Main effect: the full sphere (it grows on from the charged size), spinning arcs,
orbiting sparks and wind thrown off the rim; a soft shadow under it keeps it vivid in a bright room.
"""

import cv2
import numpy as np

from shinobi.effects.base import Effect
from shinobi.effects.fx import Particles, add_glow, random_directions

BLUE = np.array([255, 150, 40], np.float32)     # BGR
LIGHT = np.array([255, 225, 170], np.float32)
CHARGED = 0.45                                  # sphere size reached by the end of the build-up


def bgr(color):
    """OpenCV wants a tuple of plain Python numbers, not a NumPy array."""
    return tuple(float(c) for c in color)


class Rasengan(Effect):
    name = "rasengan"
    follows_hand = True

    def __init__(self, duration, n_orbit=70, seed=None):
        super().__init__(duration)
        self.rng = np.random.default_rng(seed)
        # Each orbiting spark has its own radius, speed, phase and tilted orbit plane.
        self.orb_radius = self.rng.uniform(0.45, 1.15, n_orbit)
        self.orb_speed = self.rng.uniform(5.0, 11.0, n_orbit) * self.rng.choice([-1, 1], n_orbit)
        self.orb_phase = self.rng.uniform(0, 2 * np.pi, n_orbit)
        self.orb_tilt = self.rng.uniform(0.15, 1.0, n_orbit)       # 1 = circle, small = flat ellipse
        self.orb_rot = self.rng.uniform(0, np.pi, n_orbit)          # rotation of the ellipse
        self.wind = Particles()
        # build-up streaks spiralling into the palm: start angle, start radius (x sphere), age, life, spin
        self.streaks = np.zeros((0, 5), np.float32)

    @staticmethod
    def _sphere(layer, center, radius):
        """Soft outer shell and bright core."""
        cv2.circle(layer, center, max(1, int(radius * 1.05)), bgr(BLUE * 0.35), -1, cv2.LINE_AA)
        cv2.circle(layer, center, max(1, int(radius * 0.55)), bgr(BLUE * 0.8), -1, cv2.LINE_AA)
        cv2.circle(layer, center, max(1, int(radius * 0.28)), bgr(LIGHT), -1, cv2.LINE_AA)

    def render_charge(self, frame, tracking, dt, segmentation, level, alpha):
        """Chakra streaks spiral into the palm while a small sphere forms there."""
        now = tracking.now
        if tracking.anchor is None or alpha <= 0:
            return frame
        full = max(25.0, tracking.size * 0.95)
        cx, cy = tracking.anchor
        center = (int(cx), int(cy))
        layer = np.zeros_like(frame)
        self._sphere(layer, center, full * (0.12 + (CHARGED - 0.12) * level))
        for k in range(2):                                            # first spinning arcs
            angle = (now * 420 * (1 if k == 0 else -1.4) + k * 90) % 360
            axes = (max(1, int(full * (0.2 + 0.25 * level))), max(1, int(full * (0.08 + 0.1 * level))))
            cv2.ellipse(layer, center, axes, angle, 0, 220, bgr(LIGHT * 0.8), 2, cv2.LINE_AA)

        n = int((30 + 110 * level) * dt) + 1
        new = np.stack([self.rng.uniform(0, 2 * np.pi, n), self.rng.uniform(0.9, 1.6, n), np.zeros(n),
                        self.rng.uniform(0.35, 0.7, n), self.rng.uniform(3.0, 6.0, n)], axis=1).astype(np.float32)
        self.streaks = np.vstack([self.streaks, new])
        self.streaks[:, 2] += dt
        self.streaks = self.streaks[self.streaks[:, 2] < self.streaks[:, 3]]
        if len(self.streaks):
            a0, r0, age, life, spin = self.streaks.T
            for lag in (0.0, 0.015):                                  # head and a short tail
                t = np.clip((age - lag) / life, 0, 1)
                r = r0 * full * (1 - t) ** 1.3
                ang = a0 + spin * t
                pts = np.stack([cx + r * np.cos(ang), cy + r * np.sin(ang) * 0.75], axis=1)
                if lag == 0.0:                                        # fades in, brightest half way in
                    head, fade = pts, np.minimum(1.0, t * 4) * (0.55 + 0.45 * (1 - t))
                else:
                    tail = pts
            for (x0, y0), (x1, y1), f in zip(tail.astype(np.int32).tolist(), head.astype(np.int32).tolist(),
                                             fade.tolist()):
                cv2.line(layer, (x0, y0), (x1, y1), bgr((LIGHT * 0.6 + BLUE * 0.4) * f), 2, cv2.LINE_AA)
                cv2.circle(layer, (x1, y1), 2, bgr(LIGHT * f), -1, cv2.LINE_AA)
        return add_glow(frame, layer, (cx, cy), full * 2.4, strength=1.0 + 0.4 * level, blur=full * 0.5,
                        opacity=alpha * (0.55 + 0.45 * level), backdrop=0.3 * level)

    def render(self, frame, tracking, dt, segmentation=None):
        now = tracking.now
        alpha = self.opacity(now)
        if tracking.anchor is None or alpha <= 0:
            return frame

        grow = min(1.0, self.age / 0.6) ** 0.5                       # sphere grows while charging
        if self.stages:                                               # after a build-up: from the charged size
            grow = CHARGED + (1.0 - CHARGED) * grow
        radius = max(25.0, tracking.size * 0.95) * grow
        cx, cy = tracking.anchor
        center = (int(cx), int(cy))
        layer = np.zeros_like(frame)

        # 1) soft outer shell and bright core
        self._sphere(layer, center, radius)

        # 2) spinning arcs: ellipses whose angle changes every frame -> rotation illusion
        for k in range(8):
            direction = 1 if k % 2 == 0 else -1.4
            angle = (now * 420 * direction + k * 45) % 360
            axes = (int(radius * (0.95 - 0.05 * (k % 3))), int(radius * (0.25 + 0.12 * (k % 4))))
            cv2.ellipse(layer, center, axes, angle, 0, 220, bgr(LIGHT * 0.9), 2, cv2.LINE_AA)

        # 3) orbiting sparks (computed in one shot with NumPy)
        theta = self.orb_phase + self.orb_speed * now
        ex = np.cos(theta) * self.orb_radius * radius
        ey = np.sin(theta) * self.orb_radius * radius * self.orb_tilt
        c, s = np.cos(self.orb_rot), np.sin(self.orb_rot)
        xs, ys = cx + ex * c - ey * s, cy + ex * s + ey * c
        for x, y in zip(xs, ys):
            cv2.circle(layer, (int(x), int(y)), 2, bgr(LIGHT), -1, cv2.LINE_AA)

        # 4) wind particles thrown off the rim
        n = int(120 * dt) + 1
        dirs = random_directions(n, self.rng)
        tangent = np.stack([-dirs[:, 1], dirs[:, 0]], axis=1)
        self.wind.emit(np.array([cx, cy]) + dirs * radius,
                       (tangent * 1.5 + dirs * 0.6) * radius * self.rng.uniform(1.5, 3.0, (n, 1)),
                       self.rng.uniform(0.2, 0.45, n), self.rng.uniform(1.0, 2.5, n))
        self.wind.update(dt, drag=2.0)
        self.wind.draw(layer, np.outer(1.0 - self.wind.t, BLUE))

        return add_glow(frame, layer, (cx, cy), radius * 2.5, strength=1.4, blur=radius * 0.6, opacity=alpha,
                        backdrop=0.4)

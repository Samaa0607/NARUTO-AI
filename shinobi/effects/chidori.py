"""Chidori: crackling lightning bolts around the hand.

Build-up (render_charge): small crackles and sparks gather at the hand and grow with the charge.
Main effect: bolts regenerated ~20x per second, a bright light-blue glow and white-hot cores. Line
widths follow the hand size, so the bolts stay bold close to the camera and far from it; the glow is
computed only around the hand (add_glow), and a soft shadow under it keeps it vivid in bright rooms.
"""

import cv2
import numpy as np

from shinobi.effects.base import Effect
from shinobi.effects.fx import Particles, add_glow, random_directions

GLOW = (255, 185, 100)     # BGR light electric blue
CORE = (255, 245, 225)     # white-hot, slightly blue


def lightning_path(start, end, rng, detail=5, roughness=0.28):
    """Midpoint displacement: split the segment, push the middle sideways, repeat."""
    points = np.array([start, end], np.float32)
    offset = np.linalg.norm(np.subtract(end, start)) * roughness
    for _ in range(detail):
        mids = (points[:-1] + points[1:]) / 2
        seg = points[1:] - points[:-1]
        normal = np.stack([-seg[:, 1], seg[:, 0]], axis=1)
        normal /= np.linalg.norm(normal, axis=1, keepdims=True) + 1e-6
        mids += normal * rng.uniform(-offset, offset, (len(mids), 1))
        out = np.empty((len(points) + len(mids), 2), np.float32)
        out[0::2], out[1::2] = points, mids
        points, offset = out, offset / 2
    return points.astype(np.int32)


class Chidori(Effect):
    name = "chidori"
    follows_hand = True

    def __init__(self, duration, n_bolts=7, seed=None):
        super().__init__(duration)
        self.rng = np.random.default_rng(seed)
        self.n_bolts = n_bolts
        self.bolts = []           # list of (polyline relative to the hand, thickness)
        self.next_regen = 0.0
        self.sparks = Particles()

    def _regenerate(self, radius, n_bolts=None, reach=(0.7, 1.8), branches=0.6):
        """New random bolts relative to (0, 0); they are shifted to the hand when drawn."""
        self.bolts = []
        for _ in range(self.n_bolts if n_bolts is None else n_bolts):
            angle = self.rng.uniform(0, 2 * np.pi)
            length = radius * self.rng.uniform(*reach)
            end = np.array([np.cos(angle), np.sin(angle)]) * length
            path = lightning_path((0, 0), end, self.rng)
            self.bolts.append((path, 3))
            if self.rng.random() < branches:                  # a smaller side branch
                fork = path[self.rng.integers(len(path) // 3, len(path) - 1)]
                tip = fork + np.array([np.cos(angle + 0.8), np.sin(angle + 0.8)]) * length * 0.4
                self.bolts.append((lightning_path(fork, tip, self.rng, detail=4), 2))

    def _draw_bolts(self, layer, offset, scale):
        """scale: line width factor for the hand size (1 at arm's length, at most 1.8 very close)."""
        scale = min(scale, 1.8)
        glow_color = tuple(c * 0.7 for c in GLOW)        # overlapping glows add up: keep them below white
        for path, thick in self.bolts:
            pts = (path + offset).reshape(-1, 1, 2)
            glow = max(2, int(round((thick * 2 + 2) * scale)))
            core = max(2 if thick >= 3 else 1, int(round((1.2 if thick >= 3 else 0.9) * scale)))
            cv2.polylines(layer, [pts], False, glow_color, glow, cv2.LINE_AA)       # wide coloured glow
            cv2.polylines(layer, [pts], False, CORE, core, cv2.LINE_AA)             # bright core

    def render_charge(self, frame, tracking, dt, segmentation, level, alpha):
        """Small crackles and sparks gather at the hand, growing with the charge."""
        now = tracking.now
        if tracking.anchor is None or alpha <= 0:
            return frame
        full = max(30.0, tracking.size * 1.5)
        radius = full * (0.3 + 0.45 * level)
        cx, cy = tracking.anchor
        offset = np.array([cx, cy], np.int32)
        if now >= self.next_regen:
            self._regenerate(radius, n_bolts=2 + int(round(5 * level)), reach=(0.35, 1.0), branches=0.35)
            self.next_regen = now + 0.06
        layer = np.zeros_like(frame)
        cv2.circle(layer, (int(cx), int(cy)), max(2, int(full * 0.12 * (0.5 + level))), GLOW, -1, cv2.LINE_AA)
        self._draw_bolts(layer, offset, max(0.6, full / 150) * (0.6 + 0.4 * level))
        # sparks drawn in from around the hand
        n = int((60 + 260 * level) * dt) + 1
        dirs = random_directions(n, self.rng)
        dist = self.rng.uniform(1.2, 1.9, (n, 1)) * radius
        self.sparks.emit(np.array([cx, cy]), np.zeros((n, 2)), self.rng.uniform(0.12, 0.25, n),
                         self.rng.uniform(1.0, 2.0, n) * max(1.0, full / 120))
        self.sparks.pos[-n:] += (dirs * dist).astype(np.float32)
        self.sparks.vel[-n:] = (-dirs * dist / self.sparks.max_life[-n:, None]).astype(np.float32)
        self.sparks.update(dt, drag=0.5)
        self.sparks.draw(layer, np.outer(1.0 - self.sparks.t * 0.4, CORE))
        return add_glow(frame, layer, (cx, cy), full * 1.6, strength=0.9 + 0.6 * level, blur=full * 0.35,
                        opacity=alpha * (0.45 + 0.55 * level), backdrop=0.3 * level)

    def render(self, frame, tracking, dt, segmentation=None):
        now = tracking.now
        alpha = self.opacity(now)
        if tracking.anchor is None or alpha <= 0:
            return frame
        radius = max(30.0, tracking.size * 1.5)
        cx, cy = tracking.anchor
        offset = np.array([cx, cy], np.int32)

        if now >= self.next_regen:                             # flicker: new bolts ~20x / second
            self._regenerate(radius)
            self.next_regen = now + 0.05

        layer = np.zeros_like(frame)
        cv2.circle(layer, (int(cx), int(cy)), int(radius * 0.28), GLOW, -1, cv2.LINE_AA)
        self._draw_bolts(layer, offset, max(1.0, radius / 150))

        n = int(250 * dt) + 1
        self.sparks.emit(np.array([cx, cy]), random_directions(n, self.rng) *
                         self.rng.uniform(150, 550, (n, 1)) * radius / 100,
                         self.rng.uniform(0.1, 0.3, n), self.rng.uniform(1, 2.5, n) * max(1.0, radius / 120))
        self.sparks.update(dt, gravity=(0, 400), drag=1.0)
        self.sparks.draw(layer, np.outer(1.0 - self.sparks.t * 0.5, CORE))

        frame = add_glow(frame, layer, (cx, cy), radius * 2.2, strength=1.5, blur=radius * 0.5, opacity=alpha,
                         backdrop=0.45)
        if self.rng.random() < 0.12 * alpha:                   # occasional blue flash on the whole scene
            frame = cv2.add(frame, (60, 25, 0, 0))
        return frame

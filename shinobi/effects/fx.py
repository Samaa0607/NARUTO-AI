"""Shared drawing tools: additive glow and a vectorized particle system."""

import cv2
import numpy as np


def add_glow(frame, layer, center, extent, strength=1.0, blur=25, opacity=1.0, soften=0.0, backdrop=0.0):
    """Additive blend of `layer` onto `frame`, plus a soft blurred halo (bloom).

    Speed tricks:
      * only the square around the effect (center +- extent, plus room for the halo) is processed
      * the blur runs on a shrunken copy: a halo is soft anyway, so nobody sees the difference
    soften > 0 also blurs the sharp core a little (melts separate particles into one flame).
    backdrop 0..1 darkens the picture behind the light first, along the halo (strongest where the
    light is): added light cannot show on a white wall, so in a bright room the effect needs a
    little shadow under it to stay vivid. Computed on the shrunken halo, one multiply at full size.
    """
    h, w = frame.shape[:2]
    pad = extent + 2 * blur
    x0, y0 = max(0, int(center[0] - pad)), max(0, int(center[1] - pad))
    x1, y1 = min(w, int(center[0] + pad)), min(h, int(center[1] + pad))
    out = frame.copy()
    if x1 - x0 < 8 or y1 - y0 < 8:                                # effect is off screen
        return out

    roi_layer = layer[y0:y1, x0:x1]
    if soften > 0:                                                # blur at half size: 4x cheaper
        rh, rw = roi_layer.shape[:2]
        half = cv2.resize(roi_layer, (max(1, rw // 2), max(1, rh // 2)), interpolation=cv2.INTER_AREA)
        roi_layer = cv2.resize(cv2.GaussianBlur(half, (0, 0), soften / 2), (rw, rh))
    shrink = 8 if blur > 40 else 4
    sw, sh = max(1, (x1 - x0) // shrink), max(1, (y1 - y0) // shrink)
    small = cv2.resize(roi_layer, (sw, sh), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), max(1.0, blur / shrink))
    halo = cv2.resize(small, (x1 - x0, y1 - y0), interpolation=cv2.INTER_LINEAR)

    roi = out[y0:y1, x0:x1]
    if backdrop > 0:
        shade = small.max(axis=2)
        peak = float(shade.max())
        if peak > 0:
            dark = cv2.convertScaleAbs(shade, alpha=backdrop * opacity * 255.0 / peak)
            keep = cv2.resize(cv2.subtract(np.full_like(dark, 255), dark), (x1 - x0, y1 - y0),
                              interpolation=cv2.INTER_LINEAR)
            roi = cv2.multiply(roi, cv2.merge([keep, keep, keep]), scale=1 / 255)
    roi = cv2.addWeighted(roi, 1.0, roi_layer, opacity, 0)              # sharp core (saturating add)
    out[y0:y1, x0:x1] = cv2.addWeighted(roi, 1.0, halo, strength * opacity, 0)   # soft halo
    return out


def color_ramp(t, stops):
    """Interpolate colors. t: (N,) in 0..1, stops: list of (position, (b, g, r))."""
    pos = np.array([s[0] for s in stops], np.float32)
    cols = np.array([s[1] for s in stops], np.float32)
    return np.stack([np.interp(t, pos, cols[:, c]) for c in range(3)], axis=1)


class Particles:
    """All particles live in NumPy arrays: one row per particle, no Python object per particle."""

    def __init__(self):
        self.pos = np.zeros((0, 2), np.float32)
        self.vel = np.zeros((0, 2), np.float32)
        self.life = np.zeros(0, np.float32)       # seconds lived so far
        self.max_life = np.zeros(0, np.float32)
        self.size = np.zeros(0, np.float32)

    def __len__(self):
        return len(self.life)

    def emit(self, pos, vel, max_life, size):
        n = len(vel)
        self.pos = np.vstack([self.pos, np.broadcast_to(pos, (n, 2))]).astype(np.float32)
        self.vel = np.vstack([self.vel, vel]).astype(np.float32)
        self.life = np.concatenate([self.life, np.zeros(n, np.float32)])
        self.max_life = np.concatenate([self.max_life, max_life]).astype(np.float32)
        self.size = np.concatenate([self.size, size]).astype(np.float32)

    def update(self, dt, gravity=(0.0, 0.0), drag=0.0):
        self.vel += np.array(gravity, np.float32) * dt
        self.vel *= max(0.0, 1.0 - drag * dt)
        self.pos += self.vel * dt
        self.life += dt
        alive = self.life < self.max_life
        for name in ("pos", "vel", "life", "max_life", "size"):
            setattr(self, name, getattr(self, name)[alive])

    @property
    def t(self):
        """Normalized age 0 (born) .. 1 (dies)."""
        return self.life / np.maximum(self.max_life, 1e-6)

    def draw(self, layer, colors, sizes=None, positions=None):
        sizes = self.size if sizes is None else sizes
        positions = self.pos if positions is None else positions
        h, w = layer.shape[:2]
        # Convert to plain Python lists once: much faster than converting inside the loop.
        pts = positions.astype(np.int32).tolist()
        radii = np.maximum(1, sizes).astype(np.int32).tolist()
        cols = np.asarray(colors, np.float64).tolist()
        for (x, y), r, c in zip(pts, radii, cols):
            if 0 <= x < w and 0 <= y < h:
                cv2.circle(layer, (x, y), r, c, -1, cv2.LINE_AA)


def random_directions(n, rng, center_angle=None, spread=np.pi):
    """n unit vectors. With center_angle: within +-spread of it; otherwise any direction."""
    base = 0.0 if center_angle is None else center_angle
    ang = base + rng.uniform(-spread, spread, n)
    return np.stack([np.cos(ang), np.sin(ang)], axis=1).astype(np.float32)

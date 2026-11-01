"""Shadow Clone: delayed, segmented copies of the user appear around them in puffs of smoke.

Everything (clones, smoke, "real person stays in front") is composed into ONE layer at the
segmentation resolution, then blended onto the full frame once. One full-size blend instead
of one per clone keeps this effect fast on a laptop CPU. Each clone only touches the box
around the person (not the whole frame), and the smoke is drawn at half resolution.

The clones stand in rows (see CLONE_* in config.py): far rows are smaller and higher and are
drawn first, so nearer clones cover them; the real person is cut out last and stays in front.

Adaptive positions (plan_row): every frame, each row's clones are spread over the free room
left and right of the user, in proportion to the room on each side. User in the middle: both
sides. User at the right edge: every clone on the left, and the other way round. A row that
does not fit shrinks a little (down to FIT_STEPS[-1]); if it still does not fit it is spread
over the whole frame and reported in `crowded`. A clone is never dropped. A clone that has to
change sides vanishes and reappears in a puff of smoke instead of sliding behind the user.

With CLONE_PARALLEL the clone layer (the expensive part) is built on a worker thread, in
parallel with the main loop's hand tracking for the next frame, and shown one frame later.
The clones are 0.25-1.6 s behind the user on purpose, so one more frame does not show. The
cut-out of the real person always uses the current frame's mask.

Build-up (render_charge, before the release): a chakra aura pulses around the user's outline and
smoke wisps drift in towards them; meanwhile the clone history fills up, so the clones pop in, in
their puffs of smoke, the moment the main effect starts (after the jutsu's name is called).
"""

import math
from collections import deque
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np

from shinobi import config
from shinobi.effects.base import Effect
from shinobi.effects.fx import Particles, random_directions

SMOKE_COLOR = 235.0
AURA_COLOR = (60, 170, 255)  # BGR orange chakra around the user during the build-up
AURA_EDGE = (200, 240, 255)  # its bright inner edge
POP_START = 0.3          # first clone appears this long after the jutsu fires...
POP_STEP = 0.12          # ...then one more every POP_STEP seconds
BOTTOM_FADE = 0.3        # raised clones fade out over the bottom 30% instead of a hard cut
TOP_FADE = 0.06          # head cut off by the top of the camera image: soft top edge, not a flat line
EDGE = np.ones((3, 3), np.uint8)
FIT_STEPS = (1.0, 0.95, 0.9, 0.85, 0.8)   # a row with too little room may shrink to 80 % of its size
SPACING = 0.55           # clones of one row stay at least this many clone body widths apart
SIDE_HYSTERESIS = 0.3    # a clone changes sides only when its row's fair share moved clearly...
ROOM_SLACK = 0.25        # ...or when its side really got too small (25 % slack: arms and leaning move the body)
GLIDE = 8.0              # 1/s: how fast a clone glides to its new spot on the same side


def clearance(body, scale, lift):
    """Distance a clone's body centre keeps from the user's: half the user's body plus half the
    clone's, less for raised clones, whose heads are above the user's shoulders."""
    return body * (0.5 + 0.5 * scale) * (1.0 - lift)


def plan_row(n, center, body, w, scale, lift, phase, left_before=None):
    """Body-centre x (pixels, left to right) of the n clones of one row.

    center, body: the user's body centre and width; w: frame width. The free room on each side
    runs from the user (clearance) to the frame edge (the clone's whole body inside). Clones
    are shared between the sides in proportion to that room, at least SPACING apart; `phase`
    0.5 puts them in the middle of their slots, 0 starts at the user, so rows interleave.
    left_before: clones this row had on the left last frame (keeps the split from flickering).
    Returns (xs, clones on the left, size factor, crowded).
    """
    for fit in FIT_STEPS:
        s = scale * fit
        half, clear, gap = 0.5 * body * s, clearance(body, s, lift), SPACING * body * s
        room = ((center - clear) - half, (w - half) - (center + clear))     # < 0: no room at all
        cap = [0 if length < 0 else max(1, int(length // gap)) for length in room]
        if sum(cap) >= n:
            break
    else:   # not even at the smallest size: pack them into what is left beside the user, overlapping
        lo, hi = half, w - half                     # (never behind the user, where they'd be fully hidden)
        sides = ((lo, min(max(center - clear, lo), hi)), (max(min(center + clear, hi), lo), hi))
        lengths = [b - a + 1e-3 for a, b in sides]
        k = int(math.floor(n * lengths[0] / sum(lengths) + 0.5))
        (a0, b0), (a1, b1) = sides
        xs = [b0 - (b0 - a0) * (k - 1 - j + phase) / k for j in range(k)]
        xs += [a1 + (b1 - a1) * (j + phase) / (n - k) for j in range(n - k)]
        return xs, k, fit, True

    left, right = max(room[0], 0.0), max(room[1], 0.0)
    share = n * left / (left + right) if left + right > 0 else n / 2
    loose = [0 if length < 0 else max(1, int(length * (1 + ROOM_SLACK) // gap)) for length in room]
    k = left_before
    if k is None or abs(share - k) > 0.5 + SIDE_HYSTERESIS or k > loose[0] or n - k > loose[1]:
        k = int(math.floor(share + 0.5))
        k = min(max(k, n - cap[1]), cap[0])
    xs = [(center - clear) - left * (k - 1 - j + phase) / k for j in range(k)]       # outer -> inner
    xs += [(center + clear) + right * (j + phase) / (n - k) for j in range(n - k)]  # inner -> outer
    return xs, k, fit, False


class ShadowClone(Effect):
    name = "shadow_clone"
    needs_segmentation = True
    fade_out = 0.6

    def __init__(self, duration, count=config.CLONE_COUNT, offsets=config.CLONE_OFFSETS,
                 scales=config.CLONE_SCALES, lifts=config.CLONE_LIFTS, delays=config.CLONE_DELAYS, seed=None,
                 parallel=config.CLONE_PARALLEL):
        super().__init__(duration)
        self.parallel = parallel            # build the clone layer on the worker thread (see render)
        # One worker per effect (not one shared by all): with several users on the web server each
        # one's clones are built in parallel, and one worker keeps this effect's jobs in order (two
        # jobs of the same effect must never run at the same time, they share the frame buffer).
        # The thread ends by itself when the finished effect is garbage collected.
        self._worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix="shadow-clone") if parallel else None
        self._pending = None                # the worker's job for the last frame
        if not len(offsets) == len(scales) == len(lifts) == len(delays):
            raise ValueError("CLONE_OFFSETS, CLONE_SCALES, CLONE_LIFTS and CLONE_DELAYS need one entry per clone")
        if not 0 < count <= len(offsets):
            raise ValueError(f"{count} clones need {count} entries in every CLONE_* list, there are {len(offsets)}")
        self.rng = np.random.default_rng(seed)
        self.clones = [{"offset": o, "scale": s, "lift": lift, "delay": d, "appear": POP_START + POP_STEP * i,
                        "shown": False, "gone": False, "x": None, "fit": 1.0, "side": 0}
                       for i, (o, s, lift, d) in enumerate(zip(offsets, scales, lifts, delays)) if i < count]
        self.order = sorted(self.clones, key=lambda c: c["scale"])    # far (small) first, near last
        # Rows = clones with the same size and lift, front row first; inside a row the offsets
        # only give the left-to-right order (the positions themselves are planned every frame).
        rows = {}
        for clone in self.clones:
            rows.setdefault((clone["scale"], clone["lift"]), []).append(clone)
        self.rows = [sorted(row, key=lambda c: c["offset"]) for _, row in sorted(rows.items(), key=lambda kv: -kv[0][0])]
        self._left = [None] * len(self.rows)  # clones each row had left of the user last frame
        self.crowded = False                # a row did not fit and overlaps (see plan_row)
        self.buffer = deque()               # (time, small_frame, small_mask, person), oldest first
        self.keep = max(c["delay"] for c in self.clones) + 0.3       # seconds of history we need
        self.smoke = Particles()            # positions are stored as fractions of the frame (0..1)
        self.anchor = None                  # smoothed (body centre, body width) of the real person, pixels
        self.drawn = 0                      # clones drawn in the last frame (for the HUD and tests)
        self._fades = {}                    # bottom-fade column per clone height

    @staticmethod
    def measure(mask):
        """Where the person is in a mask, or None when nobody is there.

        left / right / top: the box to cut the clone from (arms included).
        center / body: middle and width of the middle 80% of the mask's mass, so a raised arm
        hardly moves them.
        """
        cols = np.flatnonzero(mask.max(axis=0) > 0.05)
        if len(cols) == 0:
            return None
        rows = np.flatnonzero(mask.max(axis=1) > 0.05)
        mass = np.cumsum(mask.sum(axis=0))
        lo, mid, hi = np.searchsorted(mass, mass[-1] * np.array([0.1, 0.5, 0.9]))
        return {"left": int(cols[0]), "right": int(cols[-1]) + 1, "top": int(rows[0]),
                "center": float(mid), "body": float(max(hi - lo, 1))}

    def _delayed(self, now, delay):
        """The newest buffered frame that is at least `delay` seconds old."""
        for item in reversed(self.buffer):
            if item[0] <= now - delay:
                return item
        return self.buffer[0]

    def layout(self, w, dt):
        """Plan every row for the user's current place (self.anchor) and move the clones there:
        a glide on the same side, a vanish-and-reappear in smoke when a clone changes sides."""
        center, body = self.anchor
        ease = 1.0 - math.exp(-GLIDE * dt)
        self.crowded = False
        for i, row in enumerate(self.rows):
            phase = 0.0 if i == len(self.rows) - 1 and len(self.rows) > 1 else 0.5   # back row starts at the user
            xs, self._left[i], fit, crowded = plan_row(len(row), center, body, w, row[0]["scale"], row[0]["lift"],
                                                       phase, self._left[i])
            self.crowded |= crowded
            for clone, x in zip(row, xs):
                side = -1 if x < center else 1
                if clone["x"] is None:                      # first plan: start right there
                    clone["x"], clone["fit"] = x, fit
                elif side != clone["side"]:                 # other side of the user: no sliding through them
                    visible = clone["shown"] and not clone["gone"]
                    if visible:
                        self._poof(clone, w)
                    clone["x"] = x
                    if visible:
                        self._poof(clone, w)
                else:
                    clone["x"] += (x - clone["x"]) * ease
                clone["fit"] += (fit - clone["fit"]) * ease
                clone["side"] = side

    def place(self, clone, person, w, h, x=None, fit=None):
        """Target rectangle (left, top, width, height) on a w x h layer for one clone.

        The clone's body centre goes to x (default: its planned spot, see layout); the bottom of
        its source frame goes to its lifted baseline. If its body would stick out of the frame,
        the whole clone is pushed back in.
        """
        s = clone["scale"] * (clone["fit"] if fit is None else fit)
        tw = max(1, int((person["right"] - person["left"]) * s))
        th = max(1, int((h - person["top"]) * s))
        bottom = int(round(h * (1.0 - clone["lift"])))
        if x is None:
            x = clone["x"] if clone["x"] is not None else (self.anchor[0] if self.anchor else w / 2) + clone["offset"] * w
        center = x
        half = 0.5 * person["body"] * s
        center = min(max(center, half), w - half)                    # body fully inside the frame
        x = center - (person["center"] - person["left"]) * s
        return int(round(x)), bottom - th, tw, th

    def _edge_fade(self, th, bottom, top):
        """Opacity column for a clone th pixels tall: fades the bottom (raised clone) and/or the
        top (the user's head touches the top of the image, so every clone's head is cut flat)."""
        key = (th, bottom, top)
        if key not in self._fades:
            fade = np.ones((th, 1), np.float32)
            if bottom:
                n = max(1, int(th * BOTTOM_FADE))
                fade[-n:, 0] = np.linspace(1.0, 0.0, n, dtype=np.float32)
            if top:
                n = max(1, int(th * TOP_FADE))
                fade[:n, 0] *= np.linspace(0.0, 1.0, n, dtype=np.float32)
            self._fades[key] = fade
        return self._fades[key]

    def _poof(self, clone, w):
        """Burst of smoke where a clone appears, vanishes or changes sides (hides rough frames)."""
        s = clone["scale"] * clone["fit"]
        x = clone["x"] / w if clone["x"] is not None else 0.5 + clone["offset"]
        center = np.array([x, 1.0 - clone["lift"] - s * 0.55])     # middle of the body
        n = int(90 * s)                                             # smaller clone, smaller puff
        vel = random_directions(n, self.rng) * self.rng.uniform(0.02, 0.12, (n, 1)) * s + np.array([0, -0.04])
        self.smoke.emit(center, vel, self.rng.uniform(0.6, 1.1, n), self.rng.uniform(0.03, 0.06, n) * s / 0.82)
        spread = self.rng.normal(0, 1, (n, 2)) * np.array([s * 0.14, s * 0.2])
        self.smoke.pos[-n:] += spread.astype(np.float32)

    def _remember(self, now, small, mask):
        """Add a frame to the clone history and follow the real person (smoothly, no jitter)."""
        person_now = self.measure(mask)
        self.buffer.append((now, small, mask, person_now))
        while now - self.buffer[0][0] > self.keep:
            self.buffer.popleft()
        if person_now is not None:
            if self.anchor is None:
                self.anchor = (person_now["center"], person_now["body"])
            else:                                   # the width follows slower: a moving arm must not
                center, body = self.anchor          # reshuffle the crowd
                self.anchor = (0.85 * center + 0.15 * person_now["center"], 0.94 * body + 0.06 * person_now["body"])
        return person_now

    def render_charge(self, frame, tracking, dt, segmentation, level, alpha):
        """Chakra aura around the user's outline + smoke wisps drifting in (no clone yet). Runs on the
        main thread: the worker only starts with the main effect."""
        now = tracking.now
        if segmentation is None or alpha <= 0:
            return frame
        small, mask = segmentation
        person = self._remember(now, small, mask)
        sh, sw = mask.shape
        h, w = frame.shape[:2]
        # out = frame * keep + add: the aura (a little shadow, then orange light: added light alone
        # turns white on a bright wall) and the smoke. Both are soft, so they are built at half the
        # segmentation size and scaled straight to the frame: one multiply and one add at full size.
        hw, hh = sw // 2, sh // 2
        keep = np.ones((hh, hw), np.float32)
        add = np.zeros((hh, hw, 3), np.float32)
        if person is not None:
            half = cv2.resize(mask, (hw, hh), interpolation=cv2.INTER_AREA)
            k = max(2, int(hw * 0.018 * (0.6 + level)))
            grown = cv2.dilate(half, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * k + 1, 2 * k + 1)))
            ring = cv2.GaussianBlur(np.clip(grown - half * 0.7, 0, 1), (0, 0), k * 0.7)
            edge = cv2.GaussianBlur(np.clip(grown - half, 0, 1), (0, 0), 0.8)
            pulse = 0.8 + 0.2 * math.sin(now * 9.0)
            strength = (0.25 + 0.5 * level) * pulse * alpha
            keep -= ring * (0.45 * strength)
            add += ring[..., None] * (np.array(AURA_COLOR, np.float32) * strength)
            add += edge[..., None] * (np.array(AURA_EDGE, np.float32) * strength * 0.3)
            # smoke wisps around the user, drifting in and up (the same smoke as the clone puffs, so
            # the last wisps simply live on when the clones pop)
            n = int((25 + 70 * level) * dt) + 1
            side = self.rng.choice([-1.0, 1.0], n)
            x = (person["center"] + side * person["body"] * self.rng.uniform(0.7, 1.4, n)) / sw
            y = self.rng.uniform(person["top"] + 0.3 * (sh - person["top"]), sh, n) / sh
            vel = np.stack([(person["center"] / sw - x) * self.rng.uniform(0.4, 0.8, n),
                            -self.rng.uniform(0.02, 0.06, n)], axis=1)
            self.smoke.emit(np.zeros(2), vel, self.rng.uniform(0.8, 1.4, n), self.rng.uniform(0.015, 0.03, n))
            self.smoke.pos[-n:] = np.stack([x, y], axis=1).astype(np.float32)
        density = self._smoke_density(sw, sh, dt, scale_up=False)
        if density is not None:                            # smoke over everything: color 235, opacity d
            d = density * (0.75 * alpha)
            keep *= 1.0 - d
            add = add * (1.0 - d)[..., None] + (SMOKE_COLOR * d)[..., None]
        if person is None and density is None:
            return frame
        keep8 = cv2.resize(np.clip(keep * 255, 0, 255).astype(np.uint8), (w, h), interpolation=cv2.INTER_LINEAR)
        add8 = cv2.resize(np.clip(add, 0, 255).astype(np.uint8), (w, h), interpolation=cv2.INTER_LINEAR)
        return cv2.add(cv2.multiply(frame, cv2.merge([keep8, keep8, keep8]), scale=1 / 255), add8)

    def render(self, frame, tracking, dt, segmentation=None):
        now = tracking.now
        self.opacity(now)                   # updates age / stop_at
        if segmentation is None:
            self.drawn = 0
            return frame
        small, mask = segmentation
        job = (now, dt, small, mask, self.stop_at)
        if self.parallel:
            # Build this frame's clone layer on the worker thread while the main loop goes on with
            # the next frame's hand tracking, and show the layer the worker built last frame.
            previous, self._pending = self._pending, self._worker.submit(self._clone_layer, *job)
            if previous is None:            # very first frame: no layer yet (no clone pops in this early)
                self.drawn = 0
                return frame
            color, alpha, density, self.drawn = previous.result()
        else:
            color, alpha, density, self.drawn = self._clone_layer(*job)

        # The real person stays in front: cut them out of the clone layer. Always with the CURRENT
        # mask, so the user's own outline never lags, even when the clones come from the worker.
        alpha = cv2.multiply(alpha, 1.0 - mask)

        # Smoke goes on top of everything.
        if density is not None:
            smoke = np.full_like(color, int(SMOKE_COLOR))
            self._over(color, alpha, (slice(None), slice(None)), smoke, density)

        if alpha.max() < 1e-3:
            return frame
        h, w = frame.shape[:2]
        layer = cv2.resize(color, (w, h))
        a_full = cv2.resize(alpha, (w, h))
        return cv2.blendLinear(layer, frame, a_full, 1.0 - a_full)

    def _clone_layer(self, now, dt, small, mask, stop_at):
        """Clones + smoke for one frame at segmentation size: (color, alpha, smoke density, drawn).

        Runs on the worker thread when self.parallel is on, so it only reads `stop_at` as passed
        in (the main thread may stop the effect meanwhile).
        """
        self._remember(now, small, mask)

        sh, sw = mask.shape
        if self.anchor is not None:
            self.layout(sw, dt)
        color = np.zeros((sh, sw, 3), np.uint8)     # clone layer colors
        alpha = np.zeros((sh, sw), np.float32)      # clone layer opacity 0..1
        stopping = stop_at is not None
        drawn = 0

        for clone in self.clones:                   # smoke in the order the clones pop in
            if now >= self.t0 + clone["appear"] and not clone["shown"]:
                clone["shown"] = True
                self._poof(clone, sw)
            if stopping and clone["shown"] and not clone["gone"]:
                clone["gone"] = True
                self._poof(clone, sw)
        visibility = 1.0 if not stopping else max(0.0, 1.0 - (now - stop_at) / 0.25)

        for clone in self.order:                    # far rows first: nearer clones cover them
            if not clone["shown"] or visibility <= 0:
                continue
            _, src, src_mask, person = self._delayed(now, clone["delay"])
            if person is None:                      # nobody in that frame
                continue
            x, y, tw, th = self.place(clone, person, sw, sh)
            crop = (slice(person["top"], None), slice(person["left"], person["right"]))
            img = cv2.resize(src[crop], (tw, th), interpolation=cv2.INTER_LINEAR)
            a = cv2.resize(src_mask[crop], (tw, th), interpolation=cv2.INTER_LINEAR)
            # firmer, 1 px tighter edge: less of the wall behind the user glows around the clone
            a = cv2.erode(cv2.multiply(a, a), EDGE)
            lifted, cut = clone["lift"] > 0, person["top"] == 0
            if lifted or cut:                       # raised clone: torso fades out, no hard edge
                a = a * self._edge_fade(th, lifted, cut)
            if visibility < 1.0:
                a = a * visibility
            fx0, fx1, fy0 = max(0, x), min(sw, x + tw), max(0, y)          # clip to the layer
            if fx1 <= fx0 or fy0 >= y + th:
                continue
            part = (slice(fy0 - y, th), slice(fx0 - x, fx1 - x))
            self._over(color, alpha, (slice(fy0, y + th), slice(fx0, fx1)),
                       np.ascontiguousarray(img[part]), np.ascontiguousarray(a[part]))
            drawn += 1
        return color, alpha, self._smoke_density(sw, sh, dt), drawn

    @staticmethod
    def _over(color, alpha, region, img, a):
        """Porter-Duff "over": put img (opacity a) in front of the layer, in place.

        cv2.blendLinear divides by the sum of the two weights, which is exactly the
        formula for the resulting color: (img*a + old*old_a*(1-a)) / (a + old_a*(1-a)).
        """
        old_w = cv2.multiply(alpha[region], 1.0 - a)
        color[region] = cv2.blendLinear(img, np.ascontiguousarray(color[region]), a, old_w)
        alpha[region] = cv2.add(a, old_w)

    def _smoke_density(self, w, h, dt, scale_up=True):
        """Smoke opacity 0..1 at w x h (scale_up=False: at the half size it is drawn and blurred at;
        it is a soft cloud anyway)."""
        self.smoke.update(dt, gravity=(0, -0.03), drag=1.5)
        if len(self.smoke) == 0:
            return None
        hw, hh = w // 2, h // 2
        canvas = np.zeros((hh, hw), np.uint8)
        t = self.smoke.t
        strength = np.sin(np.pi / 2 * np.minimum(t * 4, 1.0)) * (1 - t) * 140   # rises fast, fades slowly
        sizes = self.smoke.size * (1.0 + 1.5 * t) * hw
        self.smoke.draw(canvas, np.repeat(strength[:, None], 3, axis=1), sizes,
                        positions=self.smoke.pos * np.array([hw, hh]))
        canvas = cv2.GaussianBlur(canvas, (0, 0), 4.5)                  # merge puffs into a cloud
        if scale_up:
            canvas = cv2.resize(canvas, (w, h))
        return canvas.astype(np.float32) / 255.0

    def finished(self, now):
        return super().finished(now) and len(self.smoke) == 0

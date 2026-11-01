"""Base class every visual effect inherits from, plus the manager that runs the active one.

Activation stages: a jutsu fired by its sequence does not start its main effect at once. It first
builds up for a few seconds, in three stages, while chakra gathers (render_charge):
    voice   the character calls out the activation (as long as the voice clip, if one is installed)
    charge  the chakra charges up (config.ACTIVATION_CHARGE)
    name    the character says the jutsu's name (as long as that clip)
and only then the main effect starts ("release": render, exactly as before). The stage lengths are
decided when the jutsu fires (shinobi/effects/__init__.py, activation_stages). An effect started by
hand (desktop keys, tests) has no build-up: it is in "release" from its first frame.
"""

from shinobi import config

PHASES = ("voice", "charge", "name")     # the build-up, in order; then "release"


class Effect:
    name = "base"
    needs_segmentation = False   # True -> main loop runs the person segmenter for us
    follows_hand = False         # True -> drawn at the tracked hand (its last place when the hand is lost)
    fade_in = 0.3
    fade_out = 0.5

    def __init__(self, duration):
        self.duration = duration
        self.t0 = None           # start of the main effect (release)
        self.stop_at = None      # time the fade-out started
        self.age = 0.0           # seconds since the release
        self.activated_at = None  # when the jutsu fired (= t0 without a build-up)
        self.stages = []         # [(phase, seconds)] of the build-up, in PHASES order; [] = none

    # ------------------------------------------------------------------ activation
    def begin(self, now, stages=None):
        """Start this activation. stages: {"voice": s, "charge": s, "name": s} = build up first;
        None = the main effect starts at once (like start)."""
        self.activated_at = now
        self.stages = [(phase, max(0.0, float(stages.get(phase, 0.0)))) for phase in PHASES] if stages else []
        if not self.stages:
            self.start(now)

    @property
    def stage_plan(self):
        """{phase: seconds} of the build-up ({} without one)."""
        return {phase: round(seconds, 3) for phase, seconds in self.stages}

    @property
    def release_at(self):
        """Time the main effect starts."""
        return self.activated_at + sum(seconds for _, seconds in self.stages)

    @property
    def building(self):
        """Still in the build-up (the main effect has not started)."""
        return self.t0 is None and bool(self.stages)

    def phase(self, now):
        """(phase, seconds left in it): "voice" / "charge" / "name" while building up, ("release", None)
        once the main effect runs (or is due)."""
        if not self.building:
            return "release", None
        t = now - self.activated_at
        for phase, seconds in self.stages:
            if t < seconds:
                return phase, seconds - t
            t -= seconds
        return "release", None

    def charge_level(self, now):
        """0..1: how far the chakra has built up. A little during the activation call, rising over
        the charge stage, full during the name call."""
        plan = dict(self.stages)
        t = now - self.activated_at
        voice, charge = plan.get("voice", 0.0), plan.get("charge", 0.0)
        if t < voice:
            return 0.2 * t / max(voice, 1e-6)
        return min(1.0, 0.2 + 0.8 * (t - voice) / max(charge, 1e-6))

    def render_charge(self, frame, tracking, dt, segmentation, level, alpha):
        """Draw the build-up (chakra gathering) onto frame: level 0..1 = how far it has built up,
        alpha = 1, or fading out when the activation was stopped before its release."""
        return frame

    # ------------------------------------------------------------------ main effect
    def start(self, now):
        self.t0 = now

    def stop(self, now):
        if self.stop_at is None:
            self.stop_at = now

    @property
    def min_on_screen(self):
        """Seconds of main effect before a lost hand may end it (HAND_EFFECT_MIN_SECONDS, or all of it)."""
        return self.duration if config.HAND_EFFECT_MIN_SECONDS is None else config.HAND_EFFECT_MIN_SECONDS

    def opacity(self, now):
        """0..1 envelope: fades in at the start, fades out at the end."""
        self.age = now - self.t0
        if self.stop_at is None and self.age >= self.duration:
            self.stop_at = now
        a = min(1.0, self.age / self.fade_in)
        if self.stop_at is not None:
            a = min(a, max(0.0, 1.0 - (now - self.stop_at) / self.fade_out))
        return a

    def finished(self, now):
        return self.stop_at is not None and now - self.stop_at >= self.fade_out

    def render(self, frame, tracking, dt, segmentation=None):
        """Draw the effect onto frame (BGR uint8) and return it."""
        raise NotImplementedError


class EffectManager:
    def __init__(self, factories):
        self.factories = factories   # name -> callable that builds a fresh effect
        self.active = None

    def start(self, name, now, stages=None):
        """A new activation (replaces the running one). stages: see Effect.begin."""
        self.active = self.factories[name]()
        self.active.begin(now, stages)

    def stop(self, now):
        if self.active is not None:
            self.active.stop(now)

    @property
    def needs_segmentation(self):
        return self.active is not None and self.active.needs_segmentation

    def render(self, frame, tracking, dt, segmentation=None):
        effect = self.active
        if effect is None:
            return frame
        now = tracking.now
        if effect.building:
            if effect.stop_at is not None:              # stopped before its release: the build-up fades away
                fade = 1.0 - (now - effect.stop_at) / effect.fade_out
                if fade <= 0:
                    self.active = None
                    return frame
                return effect.render_charge(frame, tracking, dt, segmentation, effect.charge_level(now), fade)
            if now < effect.release_at:
                return effect.render_charge(frame, tracking, dt, segmentation, effect.charge_level(now), 1.0)
            effect.start(effect.release_at)             # the build-up is over: the main effect starts
        if (effect.follows_hand and not tracking.visible and effect.stop_at is None
                and now - effect.t0 >= effect.min_on_screen):
            effect.stop(now)                            # hand gone (only after its minimum time on screen)
        if effect.finished(now):
            self.active = None
            return frame
        return effect.render(frame, tracking, dt, segmentation)

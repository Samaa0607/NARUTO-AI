"""Turns noisy per-frame predictions into confirmed gestures and jutsu activations.

Pipeline:  probabilities -> GestureStabilizer -> confirmed gesture events
           -> SequenceMatcher -> jutsu name -> ActionController (cooldown) -> effect name
"""

from dataclasses import dataclass, field

import numpy as np

from shinobi import config


class GestureStabilizer:
    """Smooths probabilities and only confirms a gesture after it is held steadily.

    The smoothing is per SECOND, not per frame: `alpha` is the weight of a new frame at `ref_fps`, and
    at another frame rate the weight is scaled so the smoothed value moves the same amount per second.
    A per-frame EMA needs a fixed number of frames to rise (3 here), which at 6 fps costs 0.33 s instead
    of 0.13 s and made short signs (~1 s) end before they were confirmed when the frame rate dropped.
    At ref_fps it is exactly the old per-frame EMA; thresholds and the hold time are unchanged.
    """

    def __init__(self, labels, alpha=config.PROB_SMOOTHING, conf_on=config.CONF_ON,
                 conf_off=config.CONF_OFF, margin=config.MIN_MARGIN, hold=config.HOLD_SECONDS,
                 ref_fps=config.PROB_SMOOTHING_FPS):
        self.labels = list(labels)
        self.idle = self.labels.index("idle")
        self.alpha, self.conf_on, self.conf_off = alpha, conf_on, conf_off
        self.margin, self.hold = margin, hold
        self.smoothed = np.zeros(len(self.labels), np.float32)
        self.smoothed[self.idle] = 1.0
        self.candidate = None       # gesture currently being held
        self.candidate_since = 0.0
        self.latched = None         # gesture already confirmed and not yet released
        self.ref_dt = 1.0 / ref_fps
        self.last_time = None

    def weight(self, now):
        """EMA weight of this frame: alpha at ref_fps, scaled to the time since the previous frame."""
        dt = self.ref_dt if self.last_time is None else min(max(now - self.last_time, 1e-3), 1.0)
        self.last_time = now
        return 1.0 - (1.0 - self.alpha) ** (dt / self.ref_dt)

    def update(self, probs, now):
        """Feed one frame. Returns the confirmed gesture name once, or None."""
        if probs is None:           # no hands -> treat as idle
            probs = np.zeros_like(self.smoothed)
            probs[self.idle] = 1.0
        w = self.weight(now)
        self.smoothed = w * probs + (1 - w) * self.smoothed

        # Release the latch when the confirmed gesture fades out (hysteresis).
        if self.latched is not None and self.smoothed[self.latched] < self.conf_off:
            self.latched = None

        order = np.argsort(self.smoothed)[::-1]
        top, second = order[0], order[1]
        strong = (top != self.idle and self.smoothed[top] >= self.conf_on
                  and self.smoothed[top] - self.smoothed[second] >= self.margin)

        if not strong:
            self.candidate = None
            return None
        if top != self.candidate:
            self.candidate, self.candidate_since = top, now
            return None
        if top != self.latched and now - self.candidate_since >= self.hold:
            self.latched = top
            return self.labels[top]
        return None

    def hold_progress(self, now):
        """0..1 how close the current candidate is to being confirmed (for the HUD)."""
        if self.candidate is None or self.candidate == self.latched:
            return 0.0
        return min(1.0, (now - self.candidate_since) / self.hold)


def _in_order(small, big):
    """True when every item of `small` appears in `big`, in the same order (gaps allowed)."""
    rest = iter(big)
    return all(item in rest for item in small)


class SequenceMatcher:
    """Follows every jutsu's sequence at once: its steps done and the time of its last step or attempt.

    A confirmed sign advances every jutsu whose NEXT sign it is. A sign that is not a jutsu's next
    sign leaves that jutsu exactly where it is: a wrong sign never resets anything, the user simply
    tries the step again. When a jutsu completes it fires (the longest sequence wins, ties go by
    config order) and ALL progress goes back to 0, so one performance can never fire twice or count
    as the start of another jutsu.

    max_gap (seconds; free mode): a jutsu that gets no new step for more than max_gap starts over.
    The clock of the sequence being performed also restarts with a WRONG ATTEMPT at its next step: a
    new sign that advances none of the jutsu furthest along restarts all of them (all, so a leftover
    run that happens to be level with the real one cannot take the restart away from it), also when
    that sign happens to start or advance another jutsu (the user asked: every step has its own
    max_gap, a mistake means "make the same step again", never "start over"). So a mistake never
    costs the steps done, the user has max_gap again to make the right sign; only stopping does. Holding / repeating a sign is not a new attempt and never
    extends it. max_gap=None (practice mode): no time limit at all, however long the user takes.

    The same sign confirmed again is a REPEAT, not a new step: a held sign is re-confirmed whenever
    the recogniser drops out for a moment (a single missed YOLOX result is enough), and "ram, snake,
    snake, tiger" must still count as "ram, snake, tiger". A repeat changes nothing (no step, and the
    clock is not refreshed). The same sign counts as a new step again when it is some jutsu's next
    sign (that jutsu started over after a timeout, a Retry or an activation).

    The leader (the jutsu furthest along) is the one with the most steps; on a tie, the one that has
    been in progress the longest (its first step is the oldest): a wrong sign that happens to start
    another jutsu never takes the lead from the sequence the user is performing.
    """

    def __init__(self, jutsu=config.JUTSU, max_gap=config.SEQUENCE_MAX_GAP):
        self.jutsu = jutsu
        self.max_gap = max_gap
        self.max_len = max(len(j["sequence"]) for j in jutsu.values())
        self._check_conflicts()
        self.reset()

    def _check_conflicts(self):
        """Refuse configs where one jutsu fires in the middle of another, which could then never fire.

        Every jutsu follows its own sequence and skips the signs that are not its next one, so a
        jutsu fires in the middle of another whenever its whole sequence appears in the other one,
        in order (gaps allowed), before the other one's last sign. A one-gesture jutsu that starts a
        longer one is the simplest case. Also refused: two jutsu with exactly the same sequence, and
        the same sign twice in a row, which counts as one held sign (see push), so such a sequence
        could never be performed.
        """
        for name, spec in self.jutsu.items():
            seq = spec["sequence"]
            for a, b in zip(seq, seq[1:]):
                if a == b:
                    raise ValueError(f"jutsu '{name}' has '{a}' twice in a row; a repeated sign counts "
                                     f"once, so {seq} could never be performed")
            for other, other_spec in self.jutsu.items():
                inner = other_spec["sequence"]
                if other == name:
                    continue
                if inner == seq:
                    raise ValueError(f"jutsu '{name}' and '{other}' have the same sequence {seq}")
                if _in_order(inner, seq[:-1]):
                    raise ValueError(f"jutsu '{name}' contains {inner} in order, which already fires "
                                     f"'{other}' on the way; '{name}' could never be performed")

    def reset(self):
        """Forget every sequence in progress (Retry / Reset, new mode)."""
        self.steps = {name: 0 for name in self.jutsu}        # steps done, per jutsu
        self.last_step = {name: None for name in self.jutsu}  # its last step (or the leader's wrong attempt)
        self.first_step = {name: None for name in self.jutsu}  # time of the first step of its current run
        self.history = []           # recent confirmed signs [(gesture, time)], for the desktop HUD
        self.last_sign = None       # the last confirmed sign (for repeats)
        self.repeated = False       # the last push was a repeat (no new step)
        self.advanced = []          # jutsu whose steps went up with the last push

    def _next(self, name):
        return self.jutsu[name]["sequence"][self.steps[name]]

    def _expired(self, name, now):
        return (now is not None and self.max_gap is not None and self.steps[name] > 0
                and now - self.last_step[name] > self.max_gap)

    def expire(self, now):
        """Start over every jutsu whose last step is more than max_gap old (never in practice mode).
        Returns {jutsu: steps it had}, furthest along first (most steps, then the most recent step)."""
        gone = sorted((name for name in self.jutsu if self._expired(name, now)),
                      key=lambda name: (self.steps[name], self.last_step[name]), reverse=True)
        out = {name: self.steps[name] for name in gone}
        for name in gone:
            self.steps[name], self.last_step[name], self.first_step[name] = 0, None, None
        if out and not any(self.steps.values()):
            self.history.clear()        # nothing in progress any more
        return out

    def push(self, gesture, now):
        """Add a confirmed gesture. Returns the jutsu it completes (fires) or None."""
        self.expire(now)
        self.repeated, self.advanced = False, []
        nexts = [name for name in self.jutsu if self._next(name) == gesture]
        if gesture == self.last_sign and not nexts:
            # the same sign again (held, re-confirmed after a dropout, or made twice): a repeat. No
            # step, and no jutsu's clock is refreshed: it still counts from the confirmed step
            if self.history and self.history[-1][0] == gesture:
                self.history[-1] = (gesture, now)
            self.repeated = True
            return None
        prog = self.progress(now)
        top = max(prog.values())
        leaders = [name for name in self.jutsu if top and prog[name] == top]   # furthest along, before this sign
        self.last_sign = gesture
        self.history = (self.history + [(gesture, now)])[-self.max_len:]
        done = []
        for name in nexts:
            if self.steps[name] == 0:
                self.first_step[name] = now
            self.steps[name] += 1
            self.last_step[name] = now
            if self.steps[name] == len(self.jutsu[name]["sequence"]):
                done.append(name)
        self.advanced = nexts
        if leaders and not set(leaders) & set(nexts):
            for name in leaders:        # a wrong attempt at their next step: max_gap again to make it
                self.last_step[name] = now
        if not done:
            return None
        best = max(done, key=lambda name: len(self.jutsu[name]["sequence"]))   # ties: config order
        last = self.last_sign
        self.reset()                    # one performance fires once and starts nothing else
        self.last_sign = last           # (holding the last sign is then a repeat)
        return best

    def progress(self, now=None):
        """{jutsu: steps done in order} (a jutsu whose time ran out at `now` counts as 0).
        Never the full length: a completed sequence fires and resets."""
        return {name: 0 if self._expired(name, now) else steps for name, steps in self.steps.items()}

    def leader(self, now=None):
        """The jutsu furthest along: most steps (>= 1); on a tie the one in progress the longest
        (oldest first step: the sequence the user is performing), then config order."""
        prog = self.progress(now)
        alive = [name for name in self.jutsu if prog[name] > 0]
        # max() keeps the first of equal keys: alive is in config order
        return max(alive, key=lambda name: (prog[name], -self.first_step[name])) if alive else None

    def time_left(self, now):
        """Seconds the leader has left for its next sign (None: nothing in progress, or practice mode)."""
        name = None if self.max_gap is None else self.leader(now)
        if name is None:
            return None
        return max(0.0, self.max_gap - (now - self.last_step[name]))

    def time_left_all(self, now):
        """{jutsu: seconds it has left for its next sign} for every jutsu in progress, each on its own
        clock ({} in practice mode, where nothing times out)."""
        if self.max_gap is None:
            return {}
        prog = self.progress(now)
        return {name: max(0.0, self.max_gap - (now - self.last_step[name]))
                for name in self.jutsu if prog[name] > 0}


@dataclass
class ControllerState:
    confirmed: str = None          # gesture confirmed this frame (or None)
    repeat: bool = False           # it was the same sign again: the chain was only refreshed (no new step)
    jutsu: str = None              # jutsu fired this frame (or None)
    effect: str = None             # effect to start this frame (or None)
    history: list = field(default_factory=list)
    progress: dict = field(default_factory=dict)   # {jutsu: steps done}, for the HUD / practice mode
    timed_out: dict = field(default_factory=dict)  # {jutsu: steps it had}: ran out of time this frame (free mode)
    timeout: str = None            # the jutsu that was furthest along, if it is one of them (reported to the user)
    leader: str = None             # jutsu furthest along before this frame's sign (wrong signs are reported for it)


class ActionController:
    def __init__(self, labels, cooldown=config.COOLDOWN_SECONDS, jutsu=config.JUTSU,
                 max_gap=config.SEQUENCE_MAX_GAP):
        """max_gap: seconds allowed between two confirmed steps (free mode); None = no limit (practice)."""
        self.stabilizer = GestureStabilizer(labels)
        self.matcher = SequenceMatcher(jutsu, max_gap=max_gap)
        self.jutsu = jutsu
        self.cooldown = cooldown
        self.last_fire = -1e9

    def update(self, probs, now, seq_now=None):
        """One frame. now: wall clock (the stabilizer's hold time, the cooldown). seq_now: the clock the
        sequence time limit runs on (Engine: only the time the AI could actually see the user, so a
        stall does not eat into it); default `now`."""
        t = now if seq_now is None else seq_now
        state = ControllerState()
        furthest = self.matcher.leader()
        state.timed_out = self.matcher.expire(t)
        state.timeout = furthest if furthest in state.timed_out else None
        state.leader = self.matcher.leader()
        state.confirmed = self.stabilizer.update(probs, now)
        if state.confirmed is not None:
            state.jutsu = self.matcher.push(state.confirmed, t)
            state.repeat = self.matcher.repeated
            if state.jutsu is not None:
                if now - self.last_fire >= self.cooldown:
                    self.last_fire = now
                    state.effect = self.jutsu[state.jutsu]["effect"]
                else:
                    state.jutsu = None   # still cooling down: ignore
        state.history = [g for g, _ in self.matcher.history]
        state.progress = self.matcher.progress()
        return state

    def cooldown_left(self, now):
        return max(0.0, self.cooldown - (now - self.last_fire))

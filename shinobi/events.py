"""Turns what the engine reports frame after frame into the events of the web protocol.

Pure logic, no models and no images: the web server (shinobi/server.py) gives an EventTracker one
FrameView per processed frame and sends the returned events in FrameState.events
(docs/web_protocol.md, section 3.6). The frontend plays sounds and animations on these events only.

The sequence rules live in SequenceMatcher (shinobi/controller.py): a wrong sign never resets a
sequence, free mode starts a jutsu over after SEQUENCE_MAX_GAP seconds without a confirmed step,
practice mode has no time limit. This class only reports what happened.

Rules, in the order the events of one frame are listed:
  sequence_failed/timeout  free mode only: the jutsu furthest along ran out of time (more than
                           max_gap since its last step or wrong attempt) and went back to step 0. Never in
                           practice mode, which has no time limit.
  sign                     the stabilizer confirmed a sign. A REPEAT (the same sign again,
                           SequenceMatcher.push) gets only this event: no step, no wrong_sign.
  wrong_sign               that sign is not the next one of the sequence in progress. Nothing is
                           reset: the user tries the same step again. Free mode: for the jutsu
                           furthest along (steps >= 1) only. Practice mode: for the practised jutsu
                           whenever the sign is not its next one, also at step 0.
  step                     one per jutsu whose steps went up with that sign. Never for the last step:
                           a full sequence fires and resets every sequence.
  effect_end               the effect of the previous frame is gone (replaced, or faded out).
  jutsu                    a full sequence fired; its activation starts in this frame with the
                           "voice" stage of its build-up. "stages": {voice, charge, name} seconds.
  effect_phase             the activation entered its "charge", "name" or "release" stage (once each,
                           in that order; a stage a slow frame skipped is still reported). "release" =
                           the main effect starts. Only for activations with a build-up (fired jutsu).
  effect_stopping          the effect started fading out (sent before its effect_end, always).
  clones                   Shadow Clone: more clones than ever before in this activation are visible.
"""

from dataclasses import dataclass, field

from shinobi import config


PHASE_ORDER = ("voice", "charge", "name", "release")


@dataclass(frozen=True)
class EffectView:
    key: int                    # activation number: a new jutsu = a new key, even for the same effect
    name: str                   # effect id
    stopping: bool = False      # fading out
    clones: int = None          # Shadow Clone: clones visible in the returned frame (else None)
    jutsu: str = None           # jutsu that started it (None: started by hand)
    phase: str = "release"      # "voice" / "charge" / "name" while it builds up, then "release"
    staged: bool = False        # it has a build-up (a fired jutsu): its stages are reported


@dataclass(frozen=True)
class FrameView:
    now: float                  # time of the frame (same clock as the controller)
    confirmed: str = None       # sign the stabilizer confirmed in this frame
    repeat: bool = False        # ControllerState.repeat: it was the same sign again (no new step)
    fired: str = None           # jutsu that fired in this frame
    fired_effect: str = None    # the effect it started
    progress: dict = field(default_factory=dict)   # {jutsu: steps done} after this frame
    effect: EffectView = None   # the effect in the returned frame
    timed_out: dict = field(default_factory=dict)  # ControllerState.timed_out: {jutsu: steps it had}
    timeout: str = None         # ControllerState.timeout: the jutsu furthest along ran out of time
    leader: str = None          # ControllerState.leader: furthest along before the sign (None: the most
                                # steps of the previous frame, config order on a tie)
    fired_stages: dict = None   # build-up of the activation that fired: {"voice", "charge", "name"} seconds


class EventTracker:
    def __init__(self, jutsu=config.JUTSU, practice=None):
        self.effect = None              # EffectView of the previous frame
        self._clones = 0                # most clones seen in the current activation
        self.set_mode(jutsu, practice)

    def set_mode(self, jutsu, practice=None):
        """New mode = fresh sequence state (the running effect is not affected).
        jutsu: {id: spec} that can fire; practice: the practised jutsu id, or None (free mode)."""
        self.jutsu = dict(jutsu)
        self.practice = practice
        self.reset()

    def reset(self):
        """The sequence in progress was forgotten (Retry / Reset, new mode)."""
        self.progress = {}

    # ------------------------------------------------------------------ sequence
    def _leader(self, view, before):
        if view.leader is not None:
            return view.leader if before.get(view.leader, 0) >= 1 else None
        best = None                     # without the controller's answer: most steps, config order
        for name in self.jutsu:
            if before[name] >= 1 and (best is None or before[name] > before[best]):
                best = name
        return best

    def _timeout(self, view):
        name = view.timeout
        if self.practice or name is None or name not in self.jutsu:
            return []
        steps = view.timed_out.get(name, self.progress.get(name, 0))
        if steps < 1:
            return []
        return [{"type": "sequence_failed", "reason": "timeout", "jutsu": name, "step": steps,
                 "expected": self.jutsu[name]["sequence"][steps], "got": None}]

    def _wrong_sign(self, view, before):
        if view.fired is not None:
            return []                   # the sign completed a jutsu: nothing to retry
        name = self.practice if self.practice else self._leader(view, before)
        if name is None:
            return []
        steps, seq = before.get(name, 0), self.jutsu[name]["sequence"]
        if steps >= len(seq) or view.confirmed == seq[steps]:
            return []                   # it continued (or completed) the sequence
        return [{"type": "wrong_sign", "jutsu": name, "step": steps, "expected": seq[steps],
                 "got": view.confirmed}]

    # ------------------------------------------------------------------ effects
    def _effect_events(self, view):
        events = []
        old, new = self.effect, view.effect
        if old is not None and (new is None or new.key != old.key):
            if new is None and not old.stopping:
                events.append({"type": "effect_stopping", "effect": old.name})   # faded out unseen
            events.append({"type": "effect_end", "effect": old.name})
        if view.fired is not None:
            fired = {"type": "jutsu", "jutsu": view.fired, "effect": view.fired_effect or self.jutsu[view.fired]["effect"]}
            if view.fired_stages is not None:
                fired["stages"] = dict(view.fired_stages)
            events.append(fired)
        if new is not None:
            same = old is not None and old.key == new.key
            if not same:
                self._clones = 0
            if new.staged:                  # every stage since the last frame (a new activation starts in "voice")
                before = old.phase if same else "voice"
                start, end = PHASE_ORDER.index(before) + 1, PHASE_ORDER.index(new.phase) + 1
                for phase in PHASE_ORDER[start:end]:
                    events.append({"type": "effect_phase", "effect": new.name, "jutsu": new.jutsu, "phase": phase})
            if new.stopping and not (same and old.stopping):
                events.append({"type": "effect_stopping", "effect": new.name})
            if new.clones is not None and new.clones > self._clones:
                self._clones = new.clones
                events.append({"type": "clones", "count": new.clones})
        self.effect = new
        return events

    # ------------------------------------------------------------------ one frame
    def update(self, view):
        """Events of one processed frame, in order."""
        events = self._timeout(view)
        # steps done before this frame's sign: the previous frame's, minus what ran out of time now
        before = {name: 0 if name in view.timed_out else self.progress.get(name, 0) for name in self.jutsu}
        if view.confirmed is not None:
            events.append({"type": "sign", "sign": view.confirmed})
            if not view.repeat:         # a repeat is neutral: nothing changes
                events += self._wrong_sign(view, before)
                for name, spec in self.jutsu.items():
                    steps = view.progress.get(name, 0)
                    if steps > before[name] and name != view.fired:
                        events.append({"type": "step", "jutsu": name, "step": steps,
                                       "total": len(spec["sequence"]), "sign": view.confirmed})
        self.progress = {name: view.progress.get(name, 0) for name in self.jutsu}
        events += self._effect_events(view)
        return events

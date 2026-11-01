"""shinobi/events.py: controller / effect states -> web protocol events (docs/web_protocol.md 3.6).

Run:  python -m pytest -q tests/test_events.py
Synthetic states only (no models), plus checks against the real ActionController.
"""

import numpy as np

from shinobi import config
from shinobi.controller import ActionController
from shinobi.events import EffectView, EventTracker, FrameView

FIRE = config.JUTSU["fire_style"]["sequence"]        # monkey, boar, horse, tiger
CHIDORI = config.JUTSU["chidori"]["sequence"]        # snake, dog, tiger, monkey


def types(events):
    return [e["type"] for e in events]


def free():
    return EventTracker(config.JUTSU)


def practice(jutsu):
    return EventTracker({jutsu: config.JUTSU[jutsu]}, practice=jutsu)


def progress(**steps):
    return {name: steps.get(name, 0) for name in config.JUTSU}


# ------------------------------------------------------------------ sign / step / jutsu
def test_nothing_happens_nothing_is_sent():
    t = free()
    assert t.update(FrameView(now=0.0, progress=progress())) == []
    assert t.update(FrameView(now=0.1, progress=progress())) == []


def test_sign_then_step_for_every_jutsu_that_advanced():
    t = free()
    events = t.update(FrameView(now=1.0, confirmed="monkey", progress=progress(fire_style=1)))
    assert events == [{"type": "sign", "sign": "monkey"},
                      {"type": "step", "jutsu": "fire_style", "step": 1, "total": 4, "sign": "monkey"}]
    events = t.update(FrameView(now=2.0, confirmed="boar", progress=progress(fire_style=2)))
    assert events[1] == {"type": "step", "jutsu": "fire_style", "step": 2, "total": 4, "sign": "boar"}
    # ram, snake: shadow clone at 2 AND chidori at 1 (snake starts chidori): one step event each
    t = free()
    t.update(FrameView(now=0.0, confirmed="ram", progress=progress(shadow_clone=1)))
    events = t.update(FrameView(now=1.0, confirmed="snake", progress=progress(shadow_clone=2, chidori=1)))
    assert [(e["jutsu"], e["step"]) for e in events if e["type"] == "step"] == [("chidori", 1), ("shadow_clone", 2)]


def test_the_last_sign_is_a_jutsu_event_not_a_step():
    t = free()
    for i, sign in enumerate(FIRE[:3]):
        t.update(FrameView(now=float(i), confirmed=sign, progress=progress(fire_style=i + 1)))
    events = t.update(FrameView(now=3.0, confirmed="tiger", fired="fire_style", fired_effect="fire",
                                progress=progress(), effect=EffectView(key=1, name="fire")))
    assert events == [{"type": "sign", "sign": "tiger"},
                      {"type": "jutsu", "jutsu": "fire_style", "effect": "fire"}]
    assert t.update(FrameView(now=10.0, progress=progress(), effect=EffectView(key=1, name="fire"))) == []


# ------------------------------------------------------------------ wrong sign: reported, nothing reset
def test_free_mode_wrong_sign_is_reported_for_the_most_advanced_jutsu_and_keeps_its_steps():
    t = free()
    t.update(FrameView(now=0.0, confirmed="ram", progress=progress(shadow_clone=1)))
    t.update(FrameView(now=1.0, confirmed="snake", progress=progress(shadow_clone=2, chidori=1)))
    events = t.update(FrameView(now=2.0, confirmed="dog", progress=progress(shadow_clone=2, chidori=2)))
    assert events == [
        {"type": "sign", "sign": "dog"},
        {"type": "wrong_sign", "jutsu": "shadow_clone", "step": 2, "expected": "tiger", "got": "dog"},
        {"type": "step", "jutsu": "chidori", "step": 2, "total": 4, "sign": "dog"},
    ]
    assert not [e for e in events if e["type"] == "sequence_failed"]


def test_free_mode_the_controllers_leader_decides_who_gets_the_wrong_sign():
    t = free()
    t.update(FrameView(now=0.0, confirmed="monkey", progress=progress(fire_style=1)))
    t.update(FrameView(now=1.0, confirmed="snake", progress=progress(fire_style=1, chidori=1)))
    events = t.update(FrameView(now=2.0, confirmed="horse", leader="chidori",       # whoever the controller says
                                progress=progress(fire_style=1, chidori=1)))
    assert events[1] == {"type": "wrong_sign", "jutsu": "chidori", "step": 1, "expected": "dog", "got": "horse"}


def test_free_mode_a_sign_with_nothing_in_progress_is_not_a_wrong_sign():
    t = free()
    assert types(t.update(FrameView(now=0.0, confirmed="tiger", progress=progress()))) == ["sign"]
    assert types(t.update(FrameView(now=1.0, confirmed="horse", progress=progress()))) == ["sign"]


def test_practice_mode_reports_every_wrong_sign_also_at_step_0():
    t = practice("fire_style")
    assert t.update(FrameView(now=0.0, confirmed="snake", progress={"fire_style": 0})) == [
        {"type": "sign", "sign": "snake"},
        {"type": "wrong_sign", "jutsu": "fire_style", "step": 0, "expected": "monkey", "got": "snake"}]
    assert types(t.update(FrameView(now=1.0, confirmed="monkey", progress={"fire_style": 1}))) == ["sign", "step"]
    events = t.update(FrameView(now=2.0, confirmed="horse", progress={"fire_style": 1}))
    assert events == [{"type": "sign", "sign": "horse"},
                      {"type": "wrong_sign", "jutsu": "fire_style", "step": 1, "expected": "boar", "got": "horse"}]


def test_practice_an_earlier_sign_again_is_a_wrong_sign_not_a_restart():
    t = practice("chidori")
    t.update(FrameView(now=0.0, confirmed="snake", progress={"chidori": 1}))
    t.update(FrameView(now=1.0, confirmed="dog", progress={"chidori": 2}))
    events = t.update(FrameView(now=2.0, confirmed="snake", progress={"chidori": 2}))   # snake again
    assert events == [{"type": "sign", "sign": "snake"},
                      {"type": "wrong_sign", "jutsu": "chidori", "step": 2, "expected": "tiger", "got": "snake"}]


def test_completed_sequence_ignored_by_the_cooldown_is_not_a_wrong_sign():
    t = free()
    for i, sign in enumerate(FIRE[:3]):
        t.update(FrameView(now=float(i), confirmed=sign, progress=progress(fire_style=i + 1)))
    events = t.update(FrameView(now=3.0, confirmed="tiger", progress=progress()))   # matched, not fired
    assert types(events) == ["sign"]
    assert t.update(FrameView(now=9.0, progress=progress())) == []


def test_a_repeat_only_gets_its_sign_event_in_both_modes():
    for t in (free(), practice("fire_style")):
        prog = (lambda n: progress(fire_style=n)) if t.practice is None else (lambda n: {"fire_style": n})
        t.update(FrameView(now=0.0, confirmed="monkey", progress=prog(1)))
        t.update(FrameView(now=1.0, confirmed="boar", progress=prog(2)))
        assert t.update(FrameView(now=2.0, confirmed="boar", repeat=True, progress=prog(2))) == [
            {"type": "sign", "sign": "boar"}]
        assert t.update(FrameView(now=2.5, confirmed="snake", progress=prog(2)))[1]["type"] == "wrong_sign"
        assert t.update(FrameView(now=3.0, confirmed="snake", repeat=True, progress=prog(2))) == [
            {"type": "sign", "sign": "snake"}]                          # a held wrong sign: one warning
        events = t.update(FrameView(now=5.4, confirmed="horse", progress=prog(3)))
        assert types(events) == ["sign", "step"] and events[1]["step"] == 3


# ------------------------------------------------------------------ timeout: free mode only
def test_free_mode_timeout_is_reported_once_for_the_jutsu_furthest_along():
    t = free()
    t.update(FrameView(now=10.0, confirmed="monkey", progress=progress(fire_style=1)))
    t.update(FrameView(now=11.0, confirmed="boar", progress=progress(fire_style=2)))
    assert t.update(FrameView(now=17.9, progress=progress(fire_style=2))) == []
    events = t.update(FrameView(now=18.05, progress=progress(), timed_out={"fire_style": 2}, timeout="fire_style"))
    assert events == [{"type": "sequence_failed", "reason": "timeout", "jutsu": "fire_style", "step": 2,
                       "expected": "horse", "got": None}]
    assert t.update(FrameView(now=20.0, progress=progress())) == []          # reported once


def test_timeout_and_a_new_sign_in_the_same_frame():
    t = free()
    t.update(FrameView(now=0.0, confirmed="snake", progress=progress(chidori=1)))
    events = t.update(FrameView(now=config.SEQUENCE_MAX_GAP + 1.5, confirmed="monkey", timed_out={"chidori": 1},
                                timeout="chidori", progress=progress(fire_style=1)))
    assert types(events) == ["sequence_failed", "sign", "step"]
    assert events[0]["reason"] == "timeout" and events[0]["jutsu"] == "chidori"
    assert events[2]["jutsu"] == "fire_style"                                  # no wrong_sign: chidori was over


def test_free_mode_a_jutsu_behind_the_leader_times_out_silently():
    """Chidori at step 1 runs out of time while Fire Style (step 2, alive) leads: no message."""
    ctrl, tracker = ActionController(config.GESTURES), free()
    script = [("snake", 0.8), (None, 0.5), ("monkey", 0.8), (None, 2.5), ("boar", 0.8), (None, 4.0)]
    timed = drive(ctrl, tracker, script)
    assert ctrl.matcher.progress() == {"fire_style": 2, "chidori": 0, "shadow_clone": 0, "rasengan": 0}
    assert "sequence_failed" not in [e["type"] for _, e in timed]


def test_practice_mode_never_reports_a_timeout():
    t = practice("fire_style")
    t.update(FrameView(now=0.0, confirmed="monkey", progress={"fire_style": 1}))
    assert t.update(FrameView(now=600.0, progress={"fire_style": 0}, timed_out={"fire_style": 1},
                              timeout="fire_style")) == []


def test_reset_and_mode_change_forget_the_sequence_without_events():
    t = free()
    t.update(FrameView(now=0.0, confirmed="monkey", progress=progress(fire_style=1)))
    t.reset()
    assert t.update(FrameView(now=10.0, progress=progress())) == []
    t.update(FrameView(now=11.0, confirmed="monkey", progress=progress(fire_style=1)))
    t.set_mode({"chidori": config.JUTSU["chidori"]}, practice="chidori")
    assert t.update(FrameView(now=20.0, progress={"chidori": 0})) == []
    events = t.update(FrameView(now=21.0, confirmed="monkey", progress={"chidori": 0}))
    assert events[1] == {"type": "wrong_sign", "jutsu": "chidori", "step": 0, "expected": "snake", "got": "monkey"}


# ------------------------------------------------------------------ effects
def test_effect_lifecycle_stopping_then_end_once():
    t = free()
    fire = EffectView(key=1, name="fire")
    t.update(FrameView(now=0.0, fired="fire_style", fired_effect="fire", progress=progress(), effect=fire))
    assert t.update(FrameView(now=1.0, progress=progress(), effect=fire)) == []
    stopping = EffectView(key=1, name="fire", stopping=True)
    assert t.update(FrameView(now=6.0, progress=progress(), effect=stopping)) == [
        {"type": "effect_stopping", "effect": "fire"}]
    assert t.update(FrameView(now=6.1, progress=progress(), effect=stopping)) == []
    assert t.update(FrameView(now=6.6, progress=progress(), effect=None)) == [{"type": "effect_end", "effect": "fire"}]
    assert t.update(FrameView(now=7.0, progress=progress(), effect=None)) == []


def test_effect_gone_without_being_seen_stopping_still_sends_stopping_first():
    t = free()
    t.update(FrameView(now=0.0, progress=progress(), effect=EffectView(key=4, name="chidori")))
    assert types(t.update(FrameView(now=9.0, progress=progress(), effect=None))) == ["effect_stopping", "effect_end"]


def test_new_jutsu_replacing_an_effect_ends_the_old_one_first():
    t = free()
    t.update(FrameView(now=0.0, fired="fire_style", fired_effect="fire", progress=progress(),
                       effect=EffectView(key=1, name="fire")))
    events = t.update(FrameView(now=4.0, confirmed="tiger", fired="fire_style", fired_effect="fire",
                                progress=progress(), effect=EffectView(key=2, name="fire")))
    assert events == [{"type": "sign", "sign": "tiger"}, {"type": "effect_end", "effect": "fire"},
                      {"type": "jutsu", "jutsu": "fire_style", "effect": "fire"}]


def test_clones_event_only_when_more_clones_than_ever_are_visible():
    t = free()
    counts, sent = [0, 0, 1, 1, 3, 2, 3, 4, 10, 10, 9, 10, 0], []
    for i, n in enumerate(counts):
        events = t.update(FrameView(now=i * 0.1, progress=progress(),
                                    effect=EffectView(key=7, name="shadow_clone", clones=n)))
        sent += [e["count"] for e in events if e["type"] == "clones"]
    assert sent == [1, 3, 4, 10]
    # a new activation starts counting from zero again
    events = t.update(FrameView(now=2.0, fired="shadow_clone", fired_effect="shadow_clone", progress=progress(),
                                effect=EffectView(key=8, name="shadow_clone", clones=1)))
    assert types(events) == ["effect_end", "jutsu", "clones"]


# ------------------------------------------------------------------ with the real controller
def one_hot(sign):
    p = np.zeros(len(config.GESTURES), np.float32)
    p[config.GESTURES.index(sign or "idle")] = 1.0
    return p


def view_of(state, t):
    """The FrameView the web server builds from a ControllerState (shinobi/server.py)."""
    return FrameView(now=t, confirmed=state.confirmed, repeat=state.repeat,
                     fired=state.jutsu if state.effect else None, fired_effect=state.effect,
                     progress=state.progress, timed_out=state.timed_out, timeout=state.timeout,
                     leader=state.leader)


def drive(ctrl, tracker, script, fps=30, frames=None):
    """script: list of (sign or None, seconds). Returns all events with their times; `frames`
    (a list) also gets (time, progress) of every frame."""
    out, t = [], 0.0
    for sign, seconds in script:
        for _ in range(int(seconds * fps)):
            state = ctrl.update(one_hot(sign), t)
            out += [(round(t, 2), e) for e in tracker.update(view_of(state, t))]
            if frames is not None:
                frames.append((round(t, 2), dict(state.progress)))     # same rounding as the events
            t += 1 / fps
    return out


def practice_controller(jutsu):
    return ActionController(config.GESTURES, jutsu={jutsu: config.JUTSU[jutsu]}, max_gap=None)


def test_with_the_real_controller_full_sequence_wrong_order_and_timeout():
    ctrl, tracker = ActionController(config.GESTURES), free()
    script = [(s, 0.8) for sign in CHIDORI for s in (sign, None)][:-1] + [(None, 1.0)]
    events = [e for _, e in drive(ctrl, tracker, [(x[0], x[1] if x[0] else 0.5) for x in script])]
    assert [e["type"] for e in events] == ["sign", "step", "sign", "step", "sign", "step", "sign", "jutsu"]
    assert [e["step"] for e in events if e["type"] == "step"] == [1, 2, 3]

    ctrl, tracker = ActionController(config.GESTURES), free()
    wrong = [FIRE[1], FIRE[0], FIRE[2], FIRE[3]]                               # boar, monkey, horse, tiger
    events = [e for _, e in drive(ctrl, tracker, [x for s in wrong for x in ((s, 0.8), (None, 0.5))])]
    assert "jutsu" not in types(events) and "sequence_failed" not in types(events)
    assert [e for e in events if e["type"] == "wrong_sign"] == [
        {"type": "wrong_sign", "jutsu": "fire_style", "step": 1, "expected": "boar", "got": "horse"},
        {"type": "wrong_sign", "jutsu": "fire_style", "step": 1, "expected": "boar", "got": "tiger"}]
    assert ctrl.matcher.progress()["fire_style"] == 1                          # monkey still counts

    ctrl, tracker = ActionController(config.GESTURES), free()
    timed = drive(ctrl, tracker, [("snake", 0.8), (None, config.SEQUENCE_MAX_GAP + 1.0)])
    snake_at = next(t for t, e in timed if e["type"] == "step")
    (when, event), = [(t, e) for t, e in timed if e["type"] == "sequence_failed"]
    assert event == {"type": "sequence_failed", "reason": "timeout", "jutsu": "chidori", "step": 1,
                     "expected": "dog", "got": None}
    assert config.SEQUENCE_MAX_GAP < when - snake_at <= config.SEQUENCE_MAX_GAP + 0.05   # the first frame after the limit


def test_live_a_wrong_sign_keeps_the_progress_and_gives_the_step_its_time_again():
    ctrl, tracker = ActionController(config.GESTURES), free()
    script = [("monkey", 0.8), (None, 0.5), ("boar", 0.8), (None, 2.0), ("dog", 0.8), (None, 8.0)]
    frames = []
    timed = drive(ctrl, tracker, script, frames=frames)
    wrong_at, wrong = next((t, e) for t, e in timed if e["type"] == "wrong_sign")
    assert wrong == {"type": "wrong_sign", "jutsu": "fire_style", "step": 2, "expected": "horse", "got": "dog"}
    assert all(p["fire_style"] == 2 for t, p in frames if wrong_at <= t < wrong_at + config.SEQUENCE_MAX_GAP - 0.05)
    (failed_at, failed), = [(t, e) for t, e in timed if e["type"] == "sequence_failed"]
    assert failed["jutsu"] == "fire_style" and failed["step"] == 2
    assert config.SEQUENCE_MAX_GAP < failed_at - wrong_at <= config.SEQUENCE_MAX_GAP + 0.05   # counted from the wrong attempt


def test_live_mistakes_that_take_longer_than_the_limit_in_all_do_not_reset_the_sequence():
    """The user's case: Monkey, Boar, then two wrong signs and pauses (more than 7 s after Boar in all,
    but never 7 s without a sign), then the right Horse and Tiger: the steps are kept and it fires."""
    ctrl, tracker = ActionController(config.GESTURES), free()
    script = [("monkey", 0.8), (None, 0.5), ("boar", 0.8), (None, 1.0), ("dog", 0.8), (None, 3.5),
              ("ram", 0.8), (None, 3.5), ("horse", 0.8), (None, 0.5), ("tiger", 0.8), (None, 0.5)]
    timed = drive(ctrl, tracker, script)
    boar_at = next(t for t, e in timed if e["type"] == "step" and e["jutsu"] == "fire_style" and e["step"] == 2)
    horse_at = next(t for t, e in timed if e["type"] == "step" and e["jutsu"] == "fire_style" and e["step"] == 3)
    assert horse_at - boar_at > config.SEQUENCE_MAX_GAP                        # longer than the limit in all
    assert [e["got"] for _, e in timed if e["type"] == "wrong_sign"] == ["dog", "ram"]
    assert "sequence_failed" not in types([e for _, e in timed])
    assert [e["jutsu"] for _, e in timed if e["type"] == "jutsu"] == ["fire_style"]


def test_live_steps_just_under_the_time_limit_still_fire():
    ctrl, tracker = ActionController(config.GESTURES), free()
    pause = config.SEQUENCE_MAX_GAP - 1.5                                       # + 0.8 s of the next sign
    script = [x for s in FIRE for x in ((s, 0.8), (None, pause))]
    events = [e for _, e in drive(ctrl, tracker, script)]
    assert [e["jutsu"] for e in events if e["type"] == "jutsu"] == ["fire_style"]
    assert "sequence_failed" not in types(events)


# ------------------------------------------------------------------ the user's practice cases
def test_practice_two_right_one_wrong_retry_and_finish():
    """Case 1: monkey, boar right; snake on step 3 (wrong); horse (the retry) and tiger: it fires."""
    ctrl, tracker, frames = practice_controller("fire_style"), practice("fire_style"), []
    script = [("monkey", 0.8), (None, 0.5), ("boar", 0.8), (None, 0.5), ("snake", 0.8), (None, 0.5),
              ("horse", 0.8), (None, 0.5), ("tiger", 0.8), (None, 0.5)]
    timed = drive(ctrl, tracker, script, frames=frames)
    events = [e for _, e in timed if e["type"] != "sign"]
    assert types(events) == ["step", "step", "wrong_sign", "step", "jutsu"]
    assert events[2] == {"type": "wrong_sign", "jutsu": "fire_style", "step": 2, "expected": "horse", "got": "snake"}
    assert [e["step"] for e in events if e["type"] == "step"] == [1, 2, 3]
    fired_at = next(t for t, e in timed if e["type"] == "jutsu")
    steps = [p["fire_style"] for t, p in frames if t < fired_at]
    assert steps == sorted(steps)                                               # never backwards before it fired


def test_practice_waiting_30_seconds_or_10_minutes_resets_nothing():
    """Case 2: no time limit in practice mode."""
    for wait in (30.0, 600.0):
        ctrl, tracker, frames = practice_controller("fire_style"), practice("fire_style"), []
        script = [("monkey", 0.8), (None, 0.5), ("boar", 0.8), (None, wait), ("horse", 0.8), (None, 0.5),
                  ("tiger", 0.8), (None, 0.5)]
        timed = drive(ctrl, tracker, script, fps=10, frames=frames)
        boar_at = next(t for t, e in timed if e["type"] == "step" and e["step"] == 2)
        assert not [e for t, e in timed if boar_at < t < boar_at + wait]        # nothing at all while waiting
        assert all(p["fire_style"] == 2 for t, p in frames if boar_at <= t < boar_at + wait)
        assert ctrl.matcher.time_left(boar_at + wait) is None
        assert [e["jutsu"] for _, e in timed if e["type"] == "jutsu"] == ["fire_style"]
        assert "sequence_failed" not in [e["type"] for _, e in timed]


def test_practice_many_wrong_attempts_keep_the_steps_already_done():
    """Case 3: several wrong attempts on one step: one warning each, the steps done stay done."""
    ctrl, tracker, frames = practice_controller("chidori"), practice("chidori"), []
    wrongs = ["ram", "boar", "horse", "clone_seal", "ram"]
    script = [("snake", 0.8), (None, 0.5), ("dog", 0.8), (None, 0.5)]
    script += [x for w in wrongs for x in ((w, 0.8), (None, 0.5))]
    script += [("tiger", 0.8), (None, 0.5), ("monkey", 0.8), (None, 0.5)]
    timed = drive(ctrl, tracker, script, frames=frames)
    warnings = [e for _, e in timed if e["type"] == "wrong_sign"]
    assert [(e["step"], e["expected"], e["got"]) for e in warnings] == [(2, "tiger", w) for w in wrongs]
    first_wrong = next(t for t, e in timed if e["type"] == "wrong_sign")
    tiger_at = next(t for t, e in timed if e["type"] == "step" and e["step"] == 3)
    assert all(p["chidori"] == 2 for t, p in frames if first_wrong <= t < tiger_at)
    assert [e["jutsu"] for _, e in timed if e["type"] == "jutsu"] == ["chidori"]


# ------------------------------------------------------------------ held seal + one YOLOX dropout (found by the E2E tests)
def chidori_from_yolox(miss):
    """Chidori through the real SignFusion + ActionController with YOLOX-like results (10 per second,
    each seal held 2.4 s at 15 fps). miss: ONE YOLOX result in the middle of "dog" finds nothing."""
    from shinobi.fusion import SignFusion
    from shinobi.hands import Hand
    from shinobi.seal_detector import Detection, SealResult

    ids = {v: k for k, v in config.SEAL_CLASSES.items()}
    px = np.random.default_rng(0).uniform(500, 700, (21, 2))
    hands = [Hand(np.zeros((21, 3)), np.zeros((21, 3)), "Right", 0.9, px)]
    fusion, ctrl, tracker = SignFusion(), ActionController(config.GESTURES), free()
    t, run_id, result, events = 0.0, 0, None, []
    for k, sign in enumerate(CHIDORI):
        for i in range(36):
            if i % 3 != 2:
                run_id += 1
                found = [] if (miss and k == 1 and i == 18) else [Detection(sign, ids[sign], 0.9, (500, 300, 700, 500))]
                result = SealResult(run_id, t, 40.0, found)
            state = ctrl.update(fusion.update(None, None, result, hands, t).probs, t)
            events += tracker.update(view_of(state, t))
            t += 1 / 15
    return events


def test_chidori_from_steady_yolox_results_fires_once():
    events = chidori_from_yolox(miss=False)
    assert [e["sign"] for e in events if e["type"] == "sign"] == CHIDORI
    assert [e["jutsu"] for e in events if e["type"] == "jutsu"] == ["chidori"]


def test_one_missed_yolox_result_in_a_held_seal_is_a_neutral_repeat():
    """Regression: ONE missing YOLOX result while "dog" is held resets the fusion's 2-result streak,
    the stabilizer releases and confirms dog AGAIN. SequenceMatcher treats it as a repeat: a second
    `sign` event, nothing else."""
    events = chidori_from_yolox(miss=True)
    assert [e["sign"] for e in events if e["type"] == "sign"] == ["snake", "dog", "dog", "tiger", "monkey"]
    assert [e["step"] for e in events if e["type"] == "step"] == [1, 2, 3]
    assert not [e for e in events if e["type"] in ("sequence_failed", "wrong_sign")]
    assert [e["jutsu"] for e in events if e["type"] == "jutsu"] == ["chidori"]

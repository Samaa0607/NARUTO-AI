"""Four-step jutsu sequences: config, order, negatives, reference images, guided recording.

Run:  python -m pytest -q
"""

import itertools
import json

import numpy as np
import pytest

import record_sequences as rs
from shinobi import config
from shinobi.controller import ActionController, SequenceMatcher


def push_all(matcher, signs, start=0.0, gap=1.0):
    fired = []
    for i, sign in enumerate(signs):
        name = matcher.push(sign, start + i * gap)
        if name:
            fired.append(name)
    return fired


# ------------------------------------------------------------------ config
def test_every_jutsu_has_four_known_signs_and_its_own_first_sign():
    firsts = [spec["sequence"][0] for spec in config.JUTSU.values()]
    assert len(set(firsts)) == len(firsts)
    for name, spec in config.JUTSU.items():
        assert len(spec["sequence"]) == 4, name
        assert all(s in config.GESTURES and s != "idle" for s in spec["sequence"]), name
    SequenceMatcher(config.JUTSU)                                   # no conflicts between sequences


def test_each_sequence_fires_only_its_own_jutsu():
    for name, spec in config.JUTSU.items():
        assert push_all(SequenceMatcher(config.JUTSU), spec["sequence"]) == [name]


def test_reference_pictures_exist_for_every_step():
    for name, spec in config.JUTSU.items():
        folder = config.REFERENCES_DIR / name
        for i in range(1, len(spec["sequence"]) + 1):
            assert (folder / f"step_{i}.png").exists(), f"{name} step {i}"
        assert (folder / "sequence_reference.png").exists()
        assert (folder / "instructions.md").exists()
        for sign in spec["sequence"]:
            assert (config.REFERENCES_DIR / "_sources" / "signs" / f"{sign}.png").exists(), sign


# ------------------------------------------------------------------ order, negatives, timeout
def test_no_other_order_of_the_same_signs_fires_anything():
    for name, spec in config.JUTSU.items():
        for perm in itertools.permutations(spec["sequence"]):
            if list(perm) == spec["sequence"]:
                continue
            fired = push_all(SequenceMatcher(config.JUTSU), perm)
            assert fired == [] or fired[0] != name, (name, perm)


def test_incomplete_sequences_do_not_fire():
    for spec in config.JUTSU.values():
        for k in range(1, len(spec["sequence"])):
            assert push_all(SequenceMatcher(config.JUTSU), spec["sequence"][:k]) == []


def test_pause_longer_than_max_gap_resets_the_chain():
    seq = config.JUTSU["fire_style"]["sequence"]
    m = SequenceMatcher(config.JUTSU, max_gap=2.0)
    for i, sign in enumerate(seq[:3]):
        assert m.push(sign, i * 1.0) is None
    assert m.push(seq[3], 2.0 + 2.5) is None                        # 2.5 s after the 3rd sign: too late


def test_a_wrong_sign_keeps_the_progress_and_an_activation_resets_everything():
    seq = config.JUTSU["chidori"]["sequence"]                        # snake, dog, tiger, monkey
    m = SequenceMatcher(config.JUTSU, max_gap=3.0)
    m.push(seq[0], 0.0)
    m.push(seq[1], 1.0)
    assert m.progress(1.5)["chidori"] == 2
    assert m.time_left(1.5) == pytest.approx(2.5)
    assert m.progress(10.0)["chidori"] == 0                          # at 10 s the pause would be too long
    assert m.push("boar", 2.0) is None and m.advanced == []          # wrong sign: nothing moves...
    assert m.progress(2.0)["chidori"] == 2                           # ...and nothing is reset
    assert m.time_left(2.5) == pytest.approx(2.5)                    # a wrong attempt: the step has max_gap again
    assert push_all(m, seq[2:], start=3.0) == ["chidori"]            # the user simply goes on
    assert all(v == 0 for v in m.progress(7.0).values())             # everything reset after firing
    assert m.time_left(7.0) is None and m.history == []


def test_last_sign_of_one_jutsu_does_not_start_another():
    clone = config.JUTSU["shadow_clone"]["sequence"]                 # ... ends with clone_seal
    rasengan = config.JUTSU["rasengan"]["sequence"]                  # starts with clone_seal
    m = SequenceMatcher(config.JUTSU)
    assert push_all(m, clone) == ["shadow_clone"]
    assert push_all(m, rasengan[1:], start=4.0) == []                # needs its own clone_seal first


def test_conflicting_configs_are_refused():
    with pytest.raises(ValueError):                                  # b-c fires before a-b-c-d ends
        SequenceMatcher({"long": {"sequence": ["a", "b", "c", "d"], "effect": "x"},
                         "short": {"sequence": ["b", "c"], "effect": "y"}})
    with pytest.raises(ValueError):                                  # same sequence twice
        SequenceMatcher({"one": {"sequence": ["a", "b"], "effect": "x"},
                         "two": {"sequence": ["a", "b"], "effect": "y"}})
    SequenceMatcher({"long": {"sequence": ["a", "b", "c"], "effect": "x"},  # ending together is fine:
                     "end": {"sequence": ["b", "c"], "effect": "y"}})       # the longer one wins


def test_controller_fires_once_from_held_signs():
    labels = config.GESTURES
    ctrl = ActionController(labels, cooldown=1.0)
    seq = config.JUTSU["rasengan"]["sequence"]
    t, fired = 0.0, []

    def feed(sign, seconds):
        nonlocal t
        for _ in range(int(seconds * 30)):
            p = None
            if sign:
                p = np.full(len(labels), 0.01, np.float32)
                p[labels.index(sign)] = 1.0 - 0.01 * (len(labels) - 1)
            state = ctrl.update(p, t)
            if state.effect:
                fired.append(state.effect)
            t += 1 / 30

    for sign in seq:
        feed(sign, 0.8)                                              # hold the sign
        feed(None, 0.6)                                              # hands apart while changing
    feed(seq[-1], 3.0)                                               # keep holding the last sign
    assert fired == ["rasengan"]


# ------------------------------------------------------------------ guided recording
def test_timeline_layout():
    tl = rs.build_timeline(["a", "b", "c"], hold=1.0, transition=0.5, lead=2.0)
    assert [s.phase for s in tl] == ["lead_in", "hold", "transition", "hold", "transition", "hold", "tail"]
    assert tl[-1].end == pytest.approx(2.0 + 3 * 1.0 + 2 * 0.5 + 2.0)
    assert rs.segment_at(tl, 2.5).sign == "a" and rs.segment_at(tl, 3.2).phase == "transition"
    assert rs.segment_at(tl, 100.0) is None


@pytest.mark.parametrize("kind", rs.KINDS)
def test_generated_takes_fire_only_when_they_should(kind):
    rng = np.random.default_rng(0)
    for jutsu in config.JUTSU:
        for _ in range(20):
            signs = rs.make_signs(kind, jutsu, rng)
            assert rs.fires(signs) == ([jutsu] if kind == "correct" else [])


def test_saved_take_has_landmarks_and_frame_labels(tmp_path):
    signs = config.JUTSU["fire_style"]["sequence"]
    tl = rs.build_timeline(signs, hold=1.0, transition=0.5, lead=1.0)
    frames = []
    for i in range(int(tl[-1].end * 30)):
        t = i / 30
        frames.append((np.zeros((2, 21, 3), np.float32), np.zeros((2, 21, 3), np.float32),
                       np.array([1, 1], np.float32), t, rs.segment_at(tl, t)))
    path = rs.save_take(tmp_path / "take.npz", frames, {"signs": signs})
    d = np.load(path)
    assert d["image_lm"].shape == (len(frames), 2, 21, 3)
    phase, sign, step = d["frame_phase"], d["frame_sign"], d["frame_step"]
    holds = phase == rs.PHASES.index("hold")
    assert set(step[holds]) == {0, 1, 2, 3} and set(step[~holds]) == {-1}
    assert [config.GESTURES[s] for s in dict.fromkeys(sign[holds])] == signs        # in order
    assert set(sign[phase == rs.PHASES.index("transition")]) == {-1}
    assert set(sign[phase == rs.PHASES.index("lead_in")]) == {config.GESTURES.index("idle")}
    assert json.loads(str(d["meta"]))["signs"] == signs


# ------------------------------------------------------------------ the same sign again = a repeat, not a step
def test_held_sign_reconfirmed_after_a_dropout_still_fires_exactly_once():
    """A held sign is confirmed again when the recogniser drops out for a few frames (measured on
    20 s holds: ram 3x, snake 4x, tiger 2x). That must not break the sequence."""
    labels = config.GESTURES
    ctrl = ActionController(labels)
    seq = config.JUTSU["shadow_clone"]["sequence"]                   # ram, snake, tiger, clone_seal
    t, fired, confirmed, repeats = 0.0, [], [], 0

    def feed(sign, seconds):
        nonlocal t, repeats
        for _ in range(int(seconds * 30)):
            p = None
            if sign:
                p = np.zeros(len(labels), np.float32)
                p[labels.index(sign)] = 1.0
            state = ctrl.update(p, t)
            if state.confirmed:
                confirmed.append(state.confirmed)
                repeats += state.repeat
            if state.effect:
                fired.append(state.effect)
            t += 1 / 30

    for sign in seq:
        feed(sign, 0.8)
        if sign != seq[-1]:
            feed(None, 0.2)                                          # dropout of 0.2 s: the latch is released
            # (the smoothing is per second: 0.2 s = 3 frames at its 15 fps reference rate)
            feed(sign, 0.8)                                          # ...and the same sign is confirmed again
        feed(None, 0.5)
    assert confirmed == ["ram", "ram", "snake", "snake", "tiger", "tiger", "clone_seal"] and repeats == 3
    assert fired == ["shadow_clone"]


def test_repeated_first_or_last_sign_is_harmless():
    for name, spec in config.JUTSU.items():
        seq = spec["sequence"]
        assert push_all(SequenceMatcher(config.JUTSU), [seq[0]] + seq) == [name]          # first sign twice
        assert push_all(SequenceMatcher(config.JUTSU), seq[:1] * 3 + seq[1:]) == [name]   # ... or three times
        m = SequenceMatcher(config.JUTSU)
        assert push_all(m, seq) == [name]
        assert m.push(seq[-1], 4.0) is None                          # last sign again after firing: no 2nd jutsu
    m = SequenceMatcher(config.JUTSU)
    m.push("monkey", 0.0)
    assert m.push("monkey", 0.5) is None and m.repeated and m.history == [("monkey", 0.5)]
    assert m.push("boar", 1.0) is None and not m.repeated and m.progress(1.0)["fire_style"] == 2


def test_a_repeat_does_not_refresh_the_max_gap_timer():
    """Live: 7 s (here 2 s) strictly after the last CONFIRMED step; holding or repeating that sign
    does not extend it."""
    seq = config.JUTSU["fire_style"]["sequence"]
    m = SequenceMatcher(config.JUTSU, max_gap=2.0)
    m.push(seq[0], 0.0)
    m.push(seq[1], 1.0)
    assert m.push(seq[1], 2.5) is None and m.repeated                # boar again: a repeat ...
    assert m.time_left(2.5) == pytest.approx(0.5)                    # ... that leaves the clock alone
    assert m.time_left(3.5) is None and m.progress(3.5)["fire_style"] == 0   # 2.5 s after boar: gone
    assert m.push(seq[2], 3.5) is None and m.progress()["fire_style"] == 0   # horse too late: nothing
    m = SequenceMatcher(config.JUTSU, max_gap=2.0)                   # a repeat after the gap is a fresh start
    m.push(seq[0], 0.0)
    assert m.push(seq[0], 5.0) is None and not m.repeated and m.history == [(seq[0], 5.0)]


def test_a_sequence_with_the_same_sign_twice_in_a_row_is_refused():
    with pytest.raises(ValueError, match="twice in a row"):
        SequenceMatcher({"double": {"sequence": ["a", "b", "b", "c"], "effect": "x"}})
    SequenceMatcher({"apart": {"sequence": ["a", "b", "a", "c"], "effect": "x"}})   # not in a row: fine
    SequenceMatcher(config.JUTSU)                                                   # the real four are fine


# ------------------------------------------------------------------ practice mode: no time limit, nothing reset
def practice_matcher(name):
    return SequenceMatcher({name: config.JUTSU[name]}, max_gap=None)


def test_practice_two_right_one_wrong_then_the_retry_finishes_the_sequence():
    m = practice_matcher("fire_style")                               # monkey, boar, horse, tiger
    assert push_all(m, ["monkey", "boar"]) == []
    assert m.push("snake", 2.0) is None and m.progress() == {"fire_style": 2}   # wrong: Horse is still the step
    assert m.push("horse", 3.0) is None and m.progress() == {"fire_style": 3}
    assert m.push("tiger", 4.0) == "fire_style"


def test_practice_has_no_time_limit():
    m = practice_matcher("fire_style")
    push_all(m, ["monkey", "boar"])                                  # boar at 1.0
    for wait in (30.0, 600.0):
        assert m.expire(1.0 + wait) == {} and m.progress(1.0 + wait) == {"fire_style": 2}
        assert m.time_left(1.0 + wait) is None
    assert push_all(m, ["horse", "tiger"], start=700.0) == ["fire_style"]


def test_practice_many_wrong_attempts_keep_the_steps_done():
    m = practice_matcher("chidori")                                  # snake, dog, tiger, monkey
    push_all(m, ["snake", "dog"])
    for i, wrong in enumerate(["ram", "boar", "horse", "ram", "clone_seal", "snake"]):
        assert m.push(wrong, 10.0 + i) is None and not m.repeated
        assert m.progress() == {"chidori": 2}
    assert push_all(m, ["tiger", "monkey"], start=20.0) == ["chidori"]


def test_reset_forgets_everything_and_the_first_sign_counts_again():
    m = practice_matcher("fire_style")
    push_all(m, ["monkey", "boar"])
    m.reset()                                                        # Retry
    assert m.progress() == {"fire_style": 0} and m.history == []
    assert m.push("monkey", 5.0) is None and not m.repeated and m.progress() == {"fire_style": 1}


# ------------------------------------------------------------------ free (Live) mode: SEQUENCE_MAX_GAP between steps
def test_free_mode_steps_up_to_max_gap_apart_fire_and_longer_pauses_do_not():
    gap, seq = config.SEQUENCE_MAX_GAP, config.JUTSU["fire_style"]["sequence"]
    assert push_all(SequenceMatcher(config.JUTSU), seq, gap=gap - 0.1) == ["fire_style"]
    assert push_all(SequenceMatcher(config.JUTSU), seq, gap=gap + 0.1) == []


def test_free_mode_a_wrong_sign_gives_the_same_step_a_fresh_time_limit():
    gap = config.SEQUENCE_MAX_GAP
    m = SequenceMatcher(config.JUTSU)
    push_all(m, ["monkey", "boar"])                                  # boar at 1.0
    assert m.push("dog", gap) is None and m.progress()["fire_style"] == 2   # wrong: kept, clock restarted
    assert m.time_left(gap + gap - 0.5) == pytest.approx(0.5)        # counted from the wrong attempt
    assert m.expire(1.0 + gap + 0.01) == {}                          # past boar's limit: still there
    assert m.expire(gap + gap - 0.01) == {}
    assert m.expire(gap + gap + 0.01) == {"fire_style": 2}           # no attempt for max_gap: back to 0, once
    assert m.expire(gap + gap + 1.0) == {} and m.progress()["fire_style"] == 0


def test_free_mode_mistakes_spread_over_more_than_max_gap_still_finish_the_jutsu():
    gap = config.SEQUENCE_MAX_GAP
    m = SequenceMatcher(config.JUTSU)
    push_all(m, ["monkey", "boar"])                                  # boar at 1.0
    t = 1.0
    for wrong in ["dog", "ram", "dog"]:                              # each attempt within the limit ...
        t += gap - 1.0
        assert m.push(wrong, t) is None and m.progress()["fire_style"] == 2
    assert t - 1.0 > gap                                             # ... but far more than max_gap after boar
    assert push_all(m, ["horse", "tiger"], start=t + gap - 1.0, gap=gap - 1.0) == ["fire_style"]


def test_a_leftover_run_level_with_the_real_one_cannot_take_its_restart():
    """Chidori at 2 (misread signs) and Fire Style at 2 (the user's): slow mistakes restart both, so
    Fire Style does not time out while the older Chidori run leads the tie."""
    m = SequenceMatcher(config.JUTSU)                                # 7 s
    push_all(m, ["snake", "dog", "monkey", "boar"])                  # chidori 2 (0, 1), fire 2 (2, 3)
    assert m.progress() == {"fire_style": 2, "chidori": 2, "shadow_clone": 0, "rasengan": 0}
    assert m.leader(3.0) == "chidori"                                # the tie goes to the older run
    assert m.push("ram", 9.0) is None and m.push("dog", 15.0) is None    # wrong for both, 6 s apart
    assert m.progress(15.0)["fire_style"] == 2                       # 12 s after boar: still there
    assert push_all(m, ["horse", "tiger"], start=21.0) == ["fire_style"]


def test_a_held_wrong_sign_is_a_repeat_that_does_not_extend_the_time_again():
    m = SequenceMatcher(config.JUTSU)
    push_all(m, ["monkey", "boar"])                                  # boar at 1.0
    assert m.push("dog", 2.0) is None and not m.repeated             # wrong sign: a new attempt
    assert m.push("dog", 3.0) is None and m.repeated                 # re-confirmed while held: a repeat
    assert m.time_left(3.0) == pytest.approx(config.SEQUENCE_MAX_GAP - 1.0)   # counted from the attempt, not the repeat


def test_free_mode_follows_every_jutsu_at_once():
    m = SequenceMatcher(config.JUTSU)
    m.push("ram", 0.0)                                               # shadow clone 1
    m.push("snake", 1.0)                                             # shadow clone 2 AND chidori 1
    assert m.advanced == ["chidori", "shadow_clone"]
    assert m.progress() == {"fire_style": 0, "chidori": 1, "shadow_clone": 2, "rasengan": 0}
    assert m.leader() == "shadow_clone"
    m.push("dog", 2.0)                                               # chidori 2, shadow clone keeps its 2
    assert m.progress()["chidori"] == 2 and m.progress()["shadow_clone"] == 2
    assert m.leader() == "shadow_clone"                              # same steps: the one in progress longest
    assert push_all(m, ["tiger", "clone_seal"], start=3.0) == ["shadow_clone"]   # tiger moves both
    assert all(v == 0 for v in m.progress().values())                # ... and the activation resets chidori too


def test_a_jutsu_hidden_in_order_inside_another_is_refused():
    with pytest.raises(ValueError, match="in order"):                # a ... c fires before d
        SequenceMatcher({"long": {"sequence": ["a", "b", "c", "d"], "effect": "x"},
                         "gaps": {"sequence": ["a", "c"], "effect": "y"}})
    SequenceMatcher({"long": {"sequence": ["a", "b", "c", "d"], "effect": "x"},     # ends with the same sign:
                     "end": {"sequence": ["b", "d"], "effect": "y"}})              # the longer one wins


def test_every_jutsu_in_progress_has_its_own_clock():
    m = SequenceMatcher(config.JUTSU)                                # 7 s
    m.push("monkey", 0.0)                                            # fire 1
    m.push("snake", 1.0)                                             # a wrong attempt for fire (it also starts chidori)
    assert m.time_left_all(2.0) == {"fire_style": pytest.approx(6.0), "chidori": pytest.approx(6.0)}
    assert m.leader(2.0) == "fire_style"                             # same steps: fire started first
    assert m.time_left(2.0) == pytest.approx(6.0)                    # fire got its full 7 s again
    assert m.time_left_all(7.5) == {"fire_style": pytest.approx(0.5), "chidori": pytest.approx(0.5)}
    assert m.time_left_all(8.5) == {}                                # nothing for 7 s: both time out
    assert SequenceMatcher(config.JUTSU, max_gap=None).time_left_all(1.0) == {}   # practice: no clocks


def test_a_wrong_first_sign_of_another_jutsu_still_gives_the_step_its_time_again():
    """The user's case: Fire Style at step 1, then wrong signs that each START another jutsu
    (snake, ram, clone_seal), each within 7 s of the last, then the right Boar: still at step 1, never reset."""
    m = SequenceMatcher(config.JUTSU)
    m.push("monkey", 0.0)                                            # fire 1
    for t, wrong in [(6.0, "snake"), (12.0, "ram"), (18.0, "clone_seal")]:
        assert m.push(wrong, t) is None
        assert m.progress(t)["fire_style"] == 1 and m.leader(t) == "fire_style"
    assert push_all(m, ["boar", "horse", "tiger"], start=24.0, gap=5.0) == ["fire_style"]


def test_a_wrong_sign_that_starts_another_jutsu_never_takes_the_lead():
    m = SequenceMatcher(config.JUTSU)
    m.push("clone_seal", 0.0)                                        # rasengan 1 (the user does Rasengan)
    m.push("monkey", 1.0)                                            # wrong for rasengan, starts fire
    assert m.progress()["rasengan"] == 1 and m.progress()["fire_style"] == 1
    assert m.leader(1.5) == "rasengan"                               # still the jutsu being performed
    m.push("dog", 2.0)                                               # the right sign: rasengan 2
    assert m.leader(2.0) == "rasengan" and m.progress()["rasengan"] == 2
    m2 = SequenceMatcher(config.JUTSU)                               # a real switch takes the lead with more steps
    m2.push("clone_seal", 0.0)
    m2.push("monkey", 1.0)
    m2.push("boar", 2.0)                                             # fire 2 > rasengan 1
    assert m2.leader(2.0) == "fire_style"

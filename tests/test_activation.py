"""Activation stages of a fired jutsu (effects/base.py): voice -> charge -> name -> release, timed by the
installed voice clips; the events that report them (events.py); hand effects that survive a lost hand."""

import wave

import numpy as np
import pytest

from shinobi import catalog, config
from shinobi.effects import EFFECTS, activation_stages
from shinobi.effects.base import EffectManager
from shinobi.events import EffectView, EventTracker, FrameView
from shinobi.tracking import Tracking

FRAME = np.full((360, 640, 3), 200, np.uint8)
MASK = np.zeros((360, 640), np.float32)
MASK[100:360, 250:390] = 1.0                      # a fake "person"


def write_wav(path, seconds, rate=16000):
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(rate)
        f.writeframes(b"\0\0" * int(seconds * rate))


def tracking(now, visible=True):
    return Tracking(hands=[], now=now, visible=visible, anchor=np.array([320.0, 180.0]), size=60.0,
                    direction=np.array([0.0, -1.0]))


def run(manager, start, end, fps=30, visible=True):
    """Render from start to end; returns {phase: first time seen}."""
    seen = {}
    for i in range(int(round((end - start) * fps))):
        now = start + i / fps
        out = manager.render(FRAME, tracking(now, visible), 1 / fps, (FRAME, MASK))
        assert out.shape == FRAME.shape and out.dtype == np.uint8
        if manager.active is not None:
            seen.setdefault(manager.active.phase(now)[0], now)
    return seen


# ------------------------------------------------------------------ stage lengths
def test_without_voice_clips_the_build_up_is_short(tmp_path):
    assert activation_stages("rasengan", audio_dir=tmp_path) == {
        "voice": config.VOICE_DEFAULT, "charge": config.ACTIVATION_CHARGE["rasengan"], "name": config.VOICE_DEFAULT}


def test_voice_and_name_last_as_long_as_their_wav_clips(tmp_path):
    write_wav(tmp_path / "voice" / "chidori" / "activation.wav", 1.0)
    write_wav(tmp_path / "voice" / "chidori" / "name.wav", 1.5)
    stages = activation_stages("chidori", audio_dir=tmp_path)
    assert stages["voice"] == pytest.approx(1.0 + config.VOICE_GAP)
    assert stages["name"] == pytest.approx(1.5 + config.VOICE_GAP)
    assert stages["charge"] == config.ACTIVATION_CHARGE["chidori"]
    assert activation_stages("fire_style", audio_dir=tmp_path)["voice"] == config.VOICE_DEFAULT   # other jutsu: none


def test_voice_listing_is_wav_only_and_gives_the_lengths(tmp_path):
    write_wav(tmp_path / "voice" / "rasengan" / "name.wav", 0.8)
    (tmp_path / "voice" / "rasengan" / "activation.mp3").write_bytes(b"\0" * 64)     # not WAV: not used
    (tmp_path / "voice" / "chidori").mkdir(parents=True)
    (tmp_path / "voice" / "chidori" / "activation.wav").write_bytes(b"RIFF....garbage")  # unreadable: not used
    clips = catalog.voice_clips(tmp_path)
    assert clips["rasengan"] == {"speaker": "Naruto", "activation": None, "name": "/audio/voice/rasengan/name.wav",
                                 "seconds": {"activation": None, "name": 0.8}}
    assert clips["chidori"]["activation"] is None and clips["chidori"]["seconds"]["activation"] is None
    assert activation_stages("chidori", audio_dir=tmp_path)["voice"] == config.VOICE_DEFAULT


# ------------------------------------------------------------------ stages of an activation
@pytest.mark.parametrize("name", list(EFFECTS))
def test_every_effect_builds_up_then_releases_on_time(name):
    stages = {"voice": 0.4, "charge": 1.2, "name": 0.4}
    manager = EffectManager(EFFECTS)
    manager.start(name, 10.0, stages)
    effect = manager.active
    assert effect.phase(10.0) == ("voice", pytest.approx(0.4))
    assert effect.phase(10.5)[0] == "charge" and effect.phase(11.7)[0] == "name"
    assert effect.release_at == pytest.approx(12.0) and effect.stage_plan == stages
    seen = run(manager, 10.0, 13.0)
    assert list(seen) == ["voice", "charge", "name", "release"]
    assert seen["release"] == pytest.approx(12.0, abs=1 / 30 + 1e-9)
    assert effect.t0 == pytest.approx(12.0)                     # the main effect is timed from the release


def test_effect_started_by_hand_has_no_build_up():
    manager = EffectManager(EFFECTS)
    manager.start("chidori", 0.0)
    assert manager.active.phase(0.0) == ("release", None) and manager.active.t0 == 0.0
    assert manager.active.stages == [] and manager.active.stage_plan == {}


def test_charge_level_rises_through_the_build_up():
    manager = EffectManager(EFFECTS)
    manager.start("rasengan", 0.0, {"voice": 0.4, "charge": 1.2, "name": 0.4})
    levels = [manager.active.charge_level(t) for t in (0.0, 0.3, 0.6, 1.0, 1.6, 1.9)]
    assert levels == sorted(levels) and levels[0] == 0.0 and levels[-1] == 1.0


def test_shadow_clone_pops_only_after_the_name_call():
    manager = EffectManager(EFFECTS)
    manager.start("shadow_clone", 0.0, {"voice": 0.4, "charge": 1.2, "name": 0.4})
    drawn = {}
    for i in range(int(4.0 * 30)):
        now = i / 30
        manager.render(FRAME, tracking(now), 1 / 30, (FRAME, MASK))
        drawn[round(now, 2)] = manager.active.drawn
    assert max(v for t, v in drawn.items() if t < 2.0) == 0          # nothing during the build-up
    assert drawn[3.97] == config.CLONE_COUNT                          # all 10 after the release


def test_stopped_during_the_build_up_fades_away_without_a_release():
    manager = EffectManager(EFFECTS)
    manager.start("fire", 0.0, {"voice": 0.4, "charge": 1.2, "name": 0.4})
    run(manager, 0.0, 0.8)
    manager.stop(0.8)
    seen = run(manager, 0.8, 2.6)
    assert "release" not in seen and manager.active is None


# ------------------------------------------------------------------ hand effects keep going
@pytest.mark.parametrize("name", ["fire", "chidori", "rasengan"])
def test_hand_effect_survives_a_lost_hand_for_its_whole_duration(name):
    manager = EffectManager(EFFECTS)
    manager.start(name, 0.0, {"voice": 0.4, "charge": 1.2, "name": 0.4})
    run(manager, 0.0, 2.0)                                       # build-up, hand visible
    run(manager, 2.0, 2.0 + config.EFFECT_DURATION[name] - 0.5, visible=False)   # hand lost at the release
    assert manager.active is not None and manager.active.stop_at is None
    run(manager, 2.0 + config.EFFECT_DURATION[name] - 0.5, 2.0 + config.EFFECT_DURATION[name] + 3.0, visible=False)
    assert manager.active is None                                 # then it ends on its own


def test_hand_loss_ends_it_after_the_configured_minimum(monkeypatch):
    monkeypatch.setattr(config, "HAND_EFFECT_MIN_SECONDS", 1.0)
    manager = EffectManager(EFFECTS)
    manager.start("chidori", 0.0)
    run(manager, 0.0, 0.9, visible=False)
    assert manager.active.stop_at is None
    run(manager, 0.9, 1.2, visible=False)
    assert manager.active is None or manager.active.stop_at is not None


# ------------------------------------------------------------------ events
JUTSU = {"chidori": config.JUTSU["chidori"]}
STAGES = {"voice": 0.4, "charge": 1.2, "name": 0.4}


def view(now, phase=None, key=1, fired=False, stopping=False, staged=True):
    effect = None if phase is None else EffectView(key=key, name="chidori", stopping=stopping, jutsu="chidori",
                                                   phase=phase, staged=staged)
    return FrameView(now=now, fired="chidori" if fired else None, fired_effect="chidori" if fired else None,
                     progress={"chidori": 0}, effect=effect, fired_stages=STAGES if fired else None)


def effect_events(events):
    return [e for e in events if e["type"] not in ("sign", "step", "wrong_sign", "sequence_failed")]


def test_jutsu_event_carries_the_stages_and_each_stage_is_reported_once():
    t = EventTracker(JUTSU)
    assert effect_events(t.update(view(0.0, "voice", fired=True))) == [
        {"type": "jutsu", "jutsu": "chidori", "effect": "chidori", "stages": STAGES}]
    assert t.update(view(0.2, "voice")) == []
    assert t.update(view(0.5, "charge")) == [{"type": "effect_phase", "effect": "chidori", "jutsu": "chidori",
                                              "phase": "charge"}]
    assert t.update(view(0.7, "charge")) == []
    assert [e["phase"] for e in t.update(view(1.7, "name"))] == ["name"]
    assert [e["phase"] for e in t.update(view(2.1, "release"))] == ["release"]
    assert t.update(view(3.0, "release")) == []
    assert [e["type"] for e in t.update(view(9.0, "release", stopping=True))] == ["effect_stopping"]
    assert [e["type"] for e in t.update(view(9.6, None))] == ["effect_end"]


def test_a_stage_skipped_by_a_slow_frame_is_still_reported_in_order():
    t = EventTracker(JUTSU)
    t.update(view(0.0, "voice", fired=True))
    assert [e["phase"] for e in t.update(view(2.5, "release"))] == ["charge", "name", "release"]


def test_effects_started_by_hand_report_no_stages():
    t = EventTracker(JUTSU)
    assert t.update(view(0.0, "release", staged=False)) == []
    assert t.update(view(0.5, "release", staged=False)) == []

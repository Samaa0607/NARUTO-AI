"""Train / validation / test sets by recording: splits.py, `python evaluate.py splits`, train.py.

Run:  python -m pytest -q
"""

import json
import subprocess
import sys

import joblib
import numpy as np
import pytest

import evaluate
import splits
from shinobi import config


def write_session(data, label, lighting="night", stamp="20261030_220000", person="me", n=24, folder=None):
    """A small single-sign recording in the collect_data.py format; returns its id."""
    sid = f"{person}_{lighting}_{stamp}"
    out = data / "landmarks" / (folder or label)
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(sum(sid.encode()))
    k = (config.GESTURES + ["chidori", "fire", "rasengan"]).index(label)
    img = np.zeros((n, 2, 21, 3), np.float32)
    img[:, 0, :, :2] = 0.4 + rng.normal(0, 0.02, (n, 21, 2))
    wld = rng.normal(0, 0.01, (n, 2, 21, 3)).astype(np.float32)
    wld[:, 0, :, 0] += k * 0.03 * np.arange(21) / 21                  # class-specific hand shape
    present = np.tile(np.array([1.0, 0.0], np.float32), (n, 1))
    np.savez_compressed(out / f"{sid}.npz", image_lm=img, world_lm=wld, present=present,
                        timestamps=np.arange(n) / 15.0,
                        meta=json.dumps({"label": label, "session": sid, "person": person,
                                         "lighting": lighting, "aspect": 16 / 9}))
    return sid


def write_take(data, jutsu, kind, lighting, stamp, person="me"):
    """A (frame-less) guided take: enough for the splits."""
    sid = f"{jutsu}_{kind}_{person}_{lighting}_{stamp}"
    out = data / "sequences" / jutsu
    out.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out / f"{sid}.npz", timestamps=np.zeros(1),
                        meta=json.dumps({"format": "shinobi-sequence-v1", "session": sid, "person": person,
                                         "lighting": lighting, "jutsu": jutsu, "kind": kind,
                                         "signs": config.JUTSU[jutsu]["sequence"]}))
    return sid


def assign_all(data, existing=None):
    recordings, ignored, _ = splits.scan(data)
    return splits.update(existing, recordings, ignored)


def set_of(result, rid):
    return result["sessions"][rid]["set"]


# ------------------------------------------------------------------ basic rules
def test_every_recording_is_in_exactly_one_set_and_legacy_labels_are_mapped(tmp_path):
    data = tmp_path / "data"
    palm = write_session(data, "rasengan", lighting="day", stamp="20261030_170000")   # old name of rasengan_palm
    old = write_session(data, "chidori", lighting="day", stamp="20261030_170100")     # no longer a sign
    idle = write_session(data, "idle", stamp="20261030_220000")
    result, new = assign_all(data)
    assert sorted(new) == sorted([palm, idle])
    assert result["sessions"][palm]["group"] == "rasengan_palm"
    assert old in result["ignored"] and old not in result["sessions"]
    assert all(entry["set"] in splits.SETS for entry in result["sessions"].values())
    path = tmp_path / "splits.json"
    splits.save(result, path)
    assert splits.load(path)["sessions"] == result["sessions"]                     # the file round-trips


def test_a_recording_listed_twice_or_with_an_unknown_set_is_refused(tmp_path):
    path = tmp_path / "splits.json"
    path.write_text('{"format": "%s", "sessions": {"a": {"set": "train"}, "a": {"set": "test"}}}' % splits.FORMAT)
    with pytest.raises(splits.SplitsError, match="twice"):
        splits.load(path)
    path.write_text(json.dumps({"format": splits.FORMAT, "sessions": {"a": {"set": "testing"}}}))
    with pytest.raises(splits.SplitsError, match="testing"):
        splits.load(path)


def test_two_files_with_the_same_id_are_refused(tmp_path):
    data = tmp_path / "data"
    write_session(data, "idle", stamp="20261030_220000")
    write_session(data, "tiger", stamp="20261030_220000")              # same person, light and second
    with pytest.raises(splits.SplitsError, match="same id"):
        splits.scan(data)


# ------------------------------------------------------------------ sticky
def test_assignments_are_sticky_and_hand_edits_win(tmp_path):
    data = tmp_path / "data"
    first = write_session(data, "tiger", stamp="20261030_220000")
    result, _ = assign_all(data)
    assert set_of(result, first) == "train"
    result["sessions"][first]["set"] = "test"                          # edited by hand (breaks the day rule)
    before = dict(result["sessions"][first])
    newer = [write_session(data, "tiger", stamp=f"20261030_22{m:02d}00") for m in (10, 20, 30)]
    result, new = assign_all(data, result)
    assert result["sessions"][first] == before                         # untouched, whatever it says
    assert sorted(new) == sorted(newer)
    again, new_again = assign_all(data, result)
    assert new_again == [] and again["sessions"] == result["sessions"]   # nothing moves on a second run


def test_only_new_recordings_get_a_set(tmp_path):
    data = tmp_path / "data"
    ids = [write_session(data, "idle", stamp=f"20261030_2200{s:02d}") for s in range(3)]
    result, new = assign_all(data)
    assert sorted(new) == sorted(ids)
    stamp_before = {rid: e["assigned_on"] for rid, e in result["sessions"].items()}
    extra = write_session(data, "idle", stamp="20261031_120000", lighting="day")
    result, new = assign_all(data, result)
    assert new == [extra]
    assert all(result["sessions"][rid]["assigned_on"] == stamp_before[rid] for rid in ids)


# ------------------------------------------------------------------ day / lighting rule
def test_test_comes_from_another_day_or_lighting_and_never_shares_it_with_train(tmp_path):
    data = tmp_path / "data"
    night = [write_session(data, "boar", stamp=f"20261030_2200{s:02d}") for s in range(5)]
    result, _ = assign_all(data)
    sets = [set_of(result, rid) for rid in night]
    assert sets[:3] == ["train"] * 3 and sets[3] == "validation"
    assert "test" not in sets                                          # same night as train: never test
    day = [write_session(data, "boar", lighting="day", stamp=f"20261031_1000{s:02d}") for s in range(2)]
    result, _ = assign_all(data, result)
    assert set_of(result, day[0]) == "test"                           # first from another day / light
    assert set_of(result, day[1]) != "train"                          # a test day + light never trains


def test_same_lighting_on_another_day_counts_as_different(tmp_path):
    data = tmp_path / "data"
    for s in range(3):
        write_session(data, "snake", stamp=f"20261030_2200{s:02d}")
    next_night = write_session(data, "snake", stamp="20261101_220000")
    result, _ = assign_all(data)
    assert set_of(result, next_night) == "test"


def test_fill_order_is_train_then_test_then_validation(tmp_path):
    data = tmp_path / "data"
    for s in range(3):
        write_session(data, "dog", stamp=f"20261030_2200{s:02d}")
    lamp = write_session(data, "dog", lighting="lamp", stamp="20261030_230000")   # same day, other light
    night = write_session(data, "dog", stamp="20261030_230100")
    result, _ = assign_all(data)
    assert set_of(result, lamp) == "test" and set_of(result, night) == "validation"


def test_takes_avoid_the_day_and_light_their_signs_were_trained_on(tmp_path):
    data = tmp_path / "data"
    write_session(data, "tiger", stamp="20261030_220000")              # chidori uses tiger: train, night 10-30
    same_night = write_take(data, "chidori", "correct", "night", "20261030_230000")
    other_day = write_take(data, "chidori", "correct", "day", "20261031_100000")
    result, _ = assign_all(data)
    assert result["sessions"][same_night]["group"] == "chidori/correct"
    assert set_of(result, same_night) == "validation"                 # takes are not trained on (quota 0)
    assert set_of(result, other_day) == "test"


def test_review_warns_about_missing_sets_and_a_test_from_the_training_day(tmp_path):
    data = tmp_path / "data"
    a = write_session(data, "horse", stamp="20261030_220000")
    b = write_session(data, "horse", stamp="20261030_220100")
    result, _ = assign_all(data)
    recordings, _, _ = splits.scan(data)
    splits.assign(result, recordings, b, "test")
    assert result["sessions"][b]["assigned_by"] == "manual"
    _, warnings = splits.review(result, recordings)
    text = "\n".join(warnings)
    assert "horse: has 1 train, 0 validation, 1 test" in text
    assert "shares day + lighting" in text and a in result["sessions"]
    assert "ram: no recordings at all" in text


# ------------------------------------------------------------------ the command writes only splits.json
def test_splits_command_writes_only_the_splits_file(tmp_path):
    data = tmp_path / "data"
    write_session(data, "idle", stamp="20261030_220000")
    write_session(data, "fire", lighting="day", stamp="20261030_180000")
    before = {p: (p.stat().st_mtime_ns, p.read_bytes()) for p in data.rglob("*") if p.is_file()}
    evaluate.main(["splits", "--data", str(data)])
    after = {p for p in data.rglob("*") if p.is_file()}
    assert after - set(before) == {data / "splits.json"}
    assert all((p.stat().st_mtime_ns, p.read_bytes()) == v for p, v in before.items())
    saved = splits.load(data / "splits.json")
    assert len(saved["sessions"]) == 1 and len(saved["ignored"]) == 1
    evaluate.main(["splits", "--data", str(data), "--assign", "me_night_20261030_220000=validation"])
    assert splits.load(data / "splits.json")["sessions"]["me_night_20261030_220000"]["set"] == "validation"


# ------------------------------------------------------------------ train.py respects the splits
def test_train_uses_train_sessions_only_and_never_opens_test_ones(tmp_path):
    data = tmp_path / "data"
    ids = {}
    for label in ("idle", "tiger", "rasengan"):
        ids[label] = [write_session(data, label, stamp=f"20261030_2{len(ids)}{s:02d}00") for s in range(4)]
        ids[label].append(write_session(data, label, lighting="day", stamp=f"20261031_1{len(ids)}0000"))
    evaluate.main(["splits", "--data", str(data)])
    result = splits.load(data / "splits.json")
    by_set = {s: sorted(r for r, e in result["sessions"].items() if e["set"] == s) for s in splits.SETS}
    assert len(by_set["test"]) == 3 and len(by_set["train"]) == 9 and len(by_set["validation"]) == 3
    for rid in by_set["test"]:                                         # if train.py opened these, it would crash
        next((data / "landmarks").glob(f"*/{rid}.npz")).write_bytes(b"not a recording")
    late = write_session(data, "idle", lighting="lamp", stamp="20261101_200000")   # not in splits.json yet
    out = tmp_path / "model" / "model.joblib"
    run = subprocess.run([sys.executable, "train.py", "--data", str(data / "landmarks"), "--out", str(out),
                          "--step", "1"], cwd=config.ROOT, capture_output=True, text=True)
    assert run.returncode == 0, run.stdout + run.stderr
    bundle = joblib.load(out)
    assert bundle["train_sessions"] == by_set["train"]
    assert bundle["validation_sessions"] == by_set["validation"]
    assert bundle["selection"] == "validation"
    assert late in run.stdout and "NOT" in run.stdout                  # the unassigned one is named, not used
    assert bundle["labels"] == ["idle", "tiger", "rasengan_palm"]

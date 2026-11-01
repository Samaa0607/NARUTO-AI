"""The guided recorders' helpers: training plan, six-frame review, saving, assigning to train / validation.

Run:  python -m pytest -q
"""

import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import pytest

import splits
from shinobi import config

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import assign_recordings  # noqa: E402
import record_test_session  # noqa: E402
import record_training_session as rts  # noqa: E402
import recording_review as review  # noqa: E402

from tests.test_splits import write_session  # noqa: E402


# ------------------------------------------------------------------ the 68-recording plan
def test_training_plan_has_the_approved_counts():
    want = {"train": {**{g: 6 for g in rts.WEAK}, **{g: 3 for g in rts.STRONG}, "idle": 6},
            "validation": {**{g: 2 for g in rts.WEAK}, **{g: 1 for g in rts.STRONG}, "idle": 2}}
    got = {"train": Counter(), "validation": Counter()}
    for session in rts.SESSIONS:
        for st in rts.plan(session):
            got[st["set"]][st["label"]] += 1
    assert {s: dict(c) for s, c in got.items()} == want
    assert sum(len(rts.plan(s)) for s in rts.SESSIONS) == 68


def test_validation_is_a_session_of_its_own_and_every_block_has_a_known_camera():
    assert {st["set"] for st in rts.plan(1) + rts.plan(2)} == {"train"}
    assert {st["set"] for st in rts.plan(3)} == {"validation"}
    blocks = [st["block"] for s in rts.SESSIONS for st in rts.plan(s)]
    assert sorted(set(blocks)) == list(range(1, 9))                       # blocks numbered over the sessions
    assert all(st["camera"] in rts.CAMERAS for s in rts.SESSIONS for st in rts.plan(s))
    steps = rts.plan(1)
    assert [st["step"] for st in steps] == list(range(1, len(steps) + 1))


def test_rasengan_palm_is_always_one_hand_and_idle_never_asks_for_an_open_palm():
    for s in rts.SESSIONS:
        for st in rts.plan(s):
            if st["label"] == "rasengan_palm":
                assert "ONE hand only" in st["extra"]
            if st["label"] == "idle":
                assert "open palm" not in st["hint"].lower() or "NOT" in st["hint"]


def test_plan_only_mode_needs_no_camera(capsys, monkeypatch):
    monkeypatch.setattr(rts, "Camera", lambda *a, **k: pytest.fail("the camera was opened"))
    assert rts.main(["--session", "2", "--plan"]) == 0
    out = capsys.readouterr().out
    assert "SESSION 2: 24 recordings" in out and "TRAIN set" in out


def test_session_3_needs_a_light_tag(monkeypatch):
    monkeypatch.setattr(rts, "Camera", lambda *a, **k: pytest.fail("the camera was opened"))
    with pytest.raises(SystemExit):
        rts.main(["--session", "3"])


# ------------------------------------------------------------------ the six-frame review
def test_review_picks_six_frames_spread_over_the_recording():
    picks = review.pick(300)
    assert len(picks) == 6 and picks[0] == 15 and picks[-1] == 284 and picks == sorted(set(picks))
    assert review.pick(0) == []
    assert len(review.pick(3)) <= 3


def test_review_sheet_has_the_camera_size_and_draws_the_hands():
    n = 40
    video = [np.full((480, 854, 3), 90, np.uint8) for _ in range(n)]
    frames = []
    for i in range(n):
        img = np.zeros((2, 21, 3), np.float32)
        img[0, :, :2] = 0.5
        img[0, 8, :2] = 0.7
        frames.append((img, img, np.array([1.0, 0.0], np.float32), i / 15))
    screen = review.sheet(video, list(range(n)), frames, "RAM: keep this recording?", ["hint"], None, (1280, 720))
    assert screen.shape == (720, 1280, 3)
    b, g, r = screen[..., 0].astype(int), screen[..., 1].astype(int), screen[..., 2].astype(int)
    assert ((g > 200) & (b < 80) & (r < 80)).any()                       # the green hand skeleton is drawn


@pytest.mark.parametrize("key,answer", [(13, "keep"), (ord("k"), "keep"), (ord("r"), "redo"),
                                        (ord("q"), "quit"), (27, "quit")])
def test_review_answers(monkeypatch, key, answer):
    keys = [255, 255, key]
    monkeypatch.setattr(review.cv2, "imshow", lambda *a: None)
    monkeypatch.setattr(review.cv2, "waitKey", lambda ms: keys.pop(0))
    monkeypatch.setattr(review.cv2, "getWindowProperty", lambda *a: 1.0)
    assert review.ask("w", np.zeros((10, 10, 3), np.uint8)) == answer


def test_review_closed_window_keeps_nothing(monkeypatch):
    monkeypatch.setattr(review.cv2, "imshow", lambda *a: None)
    monkeypatch.setattr(review.cv2, "waitKey", lambda ms: 255)
    monkeypatch.setattr(review.cv2, "getWindowProperty", lambda *a: 0.0)
    assert review.ask("w", np.zeros((10, 10, 3), np.uint8)) == "quit"


# ------------------------------------------------------------------ saving
def _frames(n=5):
    z = np.zeros((2, 21, 3), np.float32)
    return [(z, z, np.array([1.0, 0.0], np.float32), i / 15) for i in range(n)]


def test_save_new_keeps_extra_meta_but_never_overwrites(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "LANDMARKS_DIR", tmp_path / "landmarks")
    monkeypatch.setattr(config, "VIDEOS_DIR", tmp_path / "videos")
    video = [np.zeros((48, 85, 3), np.uint8)] * 3
    sid = record_test_session.save_new("ram", "me", "day", _frames(), video, 16 / 9,
                                       {"camera": "B", "planned_set": "train", "label": "WRONG"})
    with np.load(tmp_path / "landmarks" / "ram" / f"{sid}.npz") as d:
        meta = json.loads(str(d["meta"]))
    assert meta["camera"] == "B" and meta["planned_set"] == "train"
    assert meta["label"] == "ram"                                         # standard entries cannot be replaced
    assert (tmp_path / "videos" / "ram" / f"{sid}.mp4").exists()
    monkeypatch.setattr(record_test_session, "datetime", type("D", (), {"now": staticmethod(lambda: _same(sid))}))
    with pytest.raises(FileExistsError):
        record_test_session.save_new("ram", "me", "day", _frames(), video, 16 / 9)


def _same(sid):
    from datetime import datetime
    return datetime.strptime(sid.split("_", 2)[2], "%Y%m%d_%H%M%S")


# ------------------------------------------------------------------ assigning to train / validation
def _data(tmp_path):
    data = tmp_path / "data"
    old = write_session(data, "tiger", "day", "20261101_142054")               # an existing TEST recording
    recs, ignored, _ = splits.scan(data)
    sp, _ = splits.update(None, recs, ignored)
    splits.assign(sp, recs, old, "test")
    splits.save(sp, data / "splits.json")
    (data / "evaluation_exclusions.json").write_text(json.dumps({"recordings": {"me_day_20261101_140826": {}}}))
    return data, old


def _with_video(data, label, sid):
    (data / "videos" / label).mkdir(parents=True, exist_ok=True)
    (data / "videos" / label / f"{sid}.mp4").write_bytes(b"x")
    return sid


def _log(tmp_path, saved, set_name="train"):
    path = tmp_path / f"log_{len(list(tmp_path.glob('log_*')))}.json"
    path.write_text(json.dumps({"session": 1, "set": set_name, "saved": saved}))
    return str(path)


def test_assign_dry_run_writes_nothing_and_apply_keeps_old_entries(tmp_path):
    data, old = _data(tmp_path)
    a = _with_video(data, "ram", write_session(data, "ram", "day", "20261102_100000"))
    b = _with_video(data, "idle", write_session(data, "idle", "dim", "20261103_100000"))
    log = _log(tmp_path, [{"id": a, "label": "ram", "set": "train"}, {"id": b, "label": "idle", "set": "validation"}])
    before = (data / "splits.json").read_text()
    assert assign_recordings.main(["--log", log, "--data", str(data)]) == 0
    assert (data / "splits.json").read_text() == before                         # dry run
    assert assign_recordings.main(["--log", log, "--data", str(data), "--apply"]) == 0
    after = splits.load(data / "splits.json")["sessions"]
    assert after[a]["set"] == "train" and after[b]["set"] == "validation"
    assert after[a]["assigned_by"] == "manual"
    assert after[old] == json.loads(before)["sessions"][old]                     # the test entry is untouched


def test_assign_refuses_and_writes_nothing(tmp_path):
    data, old = _data(tmp_path)
    good = _with_video(data, "ram", write_session(data, "ram", "day", "20261102_100000"))
    no_video = write_session(data, "dog", "day", "20261102_100100")
    excl = _with_video(data, "tiger", write_session(data, "tiger", "day", "20261101_140826"))
    before = (data / "splits.json").read_text()
    for bad in ([{"id": old, "label": "tiger", "set": "train"}],               # already in the test set
                [{"id": excl, "label": "tiger", "set": "train"}],              # in the exclusion record
                [{"id": no_video, "label": "dog", "set": "train"}],            # video missing
                [{"id": good, "label": "snake", "set": "train"}],              # label differs from the file
                [{"id": good, "label": "ram", "set": "test"}],                 # never into test this way
                [{"id": "me_day_20991231_000000", "label": "ram", "set": "train"}],   # no file
                [{"id": good, "label": "ram", "set": "train"}, {"id": good, "label": "ram", "set": "train"}]):
        log = _log(tmp_path, [{"id": good, "label": "ram", "set": "train"}] + bad
                   if bad[0]["id"] != good else bad)
        assert assign_recordings.main(["--log", log, "--data", str(data), "--apply"]) == 1
        assert (data / "splits.json").read_text() == before

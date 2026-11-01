"""evaluate.py: metrics, video alignment, YOLOX replay schedule, app replay, leak guard, report.

Run:  python -m pytest -q
"""

import json

import cv2
import joblib
import numpy as np
import pytest

import evaluate as ev
from shinobi import config
from shinobi.seal_detector import Detection, SealResult
from tests.test_splits import write_session

IDS = {v: k for k, v in config.SEAL_CLASSES.items()}


def det(sign, score, box=(500, 300, 700, 500)):
    return Detection(sign, IDS.get(sign, 0), score, box)


# ------------------------------------------------------------------ metrics
def test_frame_metrics_on_a_known_example():
    truth = ["a", "a", "a", "b", "b", "c"]
    pred = ["a", "a", "b", "b", "b", "a"]
    m = ev.frame_metrics(truth, pred, labels=["a", "b", "c", "d"])
    assert m["frames"] == 6 and m["accuracy"] == pytest.approx(4 / 6)
    a, b, c, d = (m["per_class"][k] for k in "abcd")
    assert (a["precision"], a["recall"], a["f1"]) == pytest.approx((2 / 3, 2 / 3, 2 / 3))
    assert (b["precision"], b["recall"], b["f1"]) == pytest.approx((2 / 3, 1.0, 0.8))
    assert c["precision"] is None and c["recall"] == 0 and c["f1"] == 0       # never said, never found
    assert d["support"] == 0 and d["f1"] is None                             # not in the truth: not averaged
    assert m["macro_f1"] == pytest.approx((2 / 3 + 0.8 + 0) / 3)
    assert m["balanced_accuracy"] == pytest.approx((2 / 3 + 1 + 0) / 3)


def test_perfect_and_empty_predictions():
    assert ev.frame_metrics(["x"] * 5, ["x"] * 5)["macro_f1"] == 1.0
    empty = ev.frame_metrics([], [])
    assert empty["frames"] == 0 and empty["accuracy"] is None and empty["macro_f1"] is None


def test_confusion_can_have_other_rows_than_columns():
    rows, cols = ["idle", "tiger", "clone_seal"], ["idle", "tiger", "dog"]
    m = ev.confusion(["tiger", "tiger", "clone_seal", "idle"], ["tiger", "dog", "idle", "idle"], rows, cols)
    assert m.tolist() == [[1, 0, 0], [0, 1, 1], [1, 0, 0]]


def test_latency_summary():
    lat = ev.latency([10, 20, 30, 40])
    assert lat["n"] == 4 and lat["median"] == 25 and lat["max"] == 40
    assert ev.latency([]) is None


def test_take_outcomes():
    assert ev.take_outcome("correct", "chidori", [(5.0, "chidori")]) == "success"
    assert ev.take_outcome("correct", "chidori", []) == "missed"
    assert ev.take_outcome("correct", "chidori", [(5.0, "chidori"), (9.0, "chidori")]) == "fired twice"
    assert ev.take_outcome("correct", "chidori", [(5.0, "fire_style")]) == "wrong jutsu"
    assert ev.take_outcome("wrong_order", None, []) == "ok"
    assert ev.take_outcome("incomplete", None, [(3.0, "rasengan")]) == "false activation"


# ------------------------------------------------------------------ recordings
def test_saved_video_frames_follow_the_recorders_rule():
    t = np.arange(10) * 0.06                     # 60 ms per frame, the video takes one every >= 1/15 s
    assert ev.saved_video_frames(t).tolist() == [0, 2, 4, 6, 8]
    idx, exact = ev.align_video(t, 5)
    assert exact and idx.tolist() == [0, 2, 4, 6, 8]
    idx, exact = ev.align_video(t, 3)            # unexpected count: spread in time, flagged
    assert not exact and len(idx) == 3 and idx[0] == 0 and idx[-1] == 9


def test_hands_are_rebuilt_in_video_pixels():
    img = np.zeros((2, 21, 3), np.float32)
    img[0, :, :2] = 0.5
    hands = ev.hands_from_arrays(img, np.zeros((2, 21, 3), np.float32), np.array([1.0, 0.0]), 852, 480)
    assert len(hands) == 1 and np.allclose(hands[0].px, [426, 240])


def test_yolox_alone_skips_unused_classes_and_weak_scores():
    assert ev.yolox_sign([]) == "idle"
    assert ev.yolox_sign([det(None, 0.99), det("tiger", 0.9)]) == "tiger"     # rat etc. are skipped
    assert ev.yolox_sign([det("tiger", config.SEAL_MIN_SCORE - 0.01)]) == "idle"
    assert ev.yolox_truth("clone_seal") == "idle" and ev.yolox_truth("boar") == "boar"


def test_seal_schedule_is_rate_limited_and_takes_the_newest_frame():
    times = np.arange(0, 2, 0.03)                                            # a 33 fps stream
    runs = ev.seal_schedule(times, rate_hz=10, delay=0.05)
    starts = [usable - 0.05 for _, usable in runs]
    assert 19 <= len(runs) <= 21                                             # ~10 per second
    assert all(b - a >= 0.1 - 1e-9 for a, b in zip(starts, starts[1:]))
    frames = [k for k, _ in runs]
    assert frames == sorted(set(frames))                                     # never the same frame twice
    assert all(times[k] <= s + 1e-9 for k, s in zip(frames, starts))         # newest frame AT the wake-up
    assert frames[1] == 3                                                    # woke at 0.1: newest is 0.09
    sparse = ev.seal_schedule([0.0, 0.5, 1.0], rate_hz=10, delay=0.05)       # slow video: wait for frames
    assert [k for k, _ in sparse] == [0, 1, 2]
    assert [usable for _, usable in sparse] == pytest.approx([0.05, 0.55, 1.05])


def test_replay_fires_the_jutsu_once_like_the_app():
    """chidori from YOLOX seals held 0.8 s each, 0.5 s hands down in between, 30 fps."""
    fps, t, times, hands, runs = 30, 0.0, [], [], []
    img = np.zeros((2, 21, 3), np.float32)
    img[0, :, :2] = np.random.default_rng(0).uniform(0.45, 0.6, (21, 2))   # a hand around (600, 380) px
    on_hand = ev.hands_from_arrays(img, np.zeros((2, 21, 3), np.float32), np.array([1.0, 0.0]), 1280, 720)
    run_id = 0
    for sign in config.JUTSU["chidori"]["sequence"] + [None]:
        for _ in range(int(0.8 * fps) if sign else fps):
            if sign:
                run_id += 1
                runs.append((t + 0.05, SealResult(run_id, t, 40.0, [det(sign, 0.9)])))
            times.append(t)
            hands.append(on_hand if sign else [])
            t += 1 / fps
        for _ in range(int(0.5 * fps)):
            times.append(t)
            hands.append([])
            t += 1 / fps
    out = ev.replay(times, hands, [None] * len(times), None, runs)
    assert [j for _, j in out["fired"]] == ["chidori"]
    assert [s for _, s in out["confirmed"]] == config.JUTSU["chidori"]["sequence"]
    assert out["signs"][0] == "idle" and "tiger" in out["signs"]


# ------------------------------------------------------------------ the landmark model must never see its own training data
def test_a_model_trained_without_splits_is_not_used(tmp_path):
    path = tmp_path / "old.joblib"
    joblib.dump({"model": None, "labels": [], "feature_version": 1}, path)
    info, classifier = ev.model_status(path)
    assert classifier is None and info["exists"] and not info["usable"] and "without data/splits.json" in info["reason"]
    info, classifier = ev.model_status(tmp_path / "missing.joblib")
    assert classifier is None and not info["exists"]


# ------------------------------------------------------------------ end to end on synthetic recordings
def write_video(data, rec_id, label, n_frames):
    out = data / "videos" / label
    out.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(str(out / f"{rec_id}.mp4"), cv2.VideoWriter_fourcc(*"mp4v"), 15, (852, 480))
    for i in range(n_frames):
        writer.write(np.full((480, 852, 3), 90 + i % 5, np.uint8))           # plain grey: no seal anywhere
    writer.release()


def write_take_with_video(data, jutsu, kind, signs, lighting, stamp):
    """A guided take saved by record_sequences.save_take (no hands found) + its grey reference video."""
    import record_sequences as rs
    from dataclasses import asdict
    rid = f"{jutsu}_{kind}_me_{lighting}_{stamp}"
    timeline = rs.build_timeline(signs, hold=0.6, transition=0.3, lead=0.5)
    frames, t = [], 0.0
    while rs.segment_at(timeline, t) is not None:
        frames.append((np.zeros((2, 21, 3), np.float32), np.zeros((2, 21, 3), np.float32),
                       np.zeros(2, np.float32), t, rs.segment_at(timeline, t)))
        t += 1 / 16
    meta = {"format": "shinobi-sequence-v1", "session": rid, "person": "me", "lighting": lighting,
            "jutsu": jutsu, "kind": kind, "signs": signs, "aspect": 16 / 9,
            "expected_activation": jutsu if kind == "correct" else None,
            "timeline": [asdict(s) for s in timeline]}
    rs.save_take(data / "sequences" / jutsu / f"{rid}.npz", frames, meta)
    ts = np.array([f[3] for f in frames])
    write_video(data, rid, f"sequences/{jutsu}", len(ev.saved_video_frames(ts)))
    return rid


def test_run_writes_a_report_and_nothing_into_data(tmp_path):
    data = tmp_path / "data"
    for label, lighting, stamp in [("idle", "night", "20261030_220000"), ("tiger", "night", "20261030_220100"),
                                   ("idle", "day", "20261031_100000"), ("tiger", "day", "20261031_100100")]:
        rid = write_session(data, label, lighting=lighting, stamp=stamp, n=30)
        ts = np.load(data / "landmarks" / label / f"{rid}.npz")["timestamps"]
        write_video(data, rid, label, len(ev.saved_video_frames(ts)))
    seq = config.JUTSU["chidori"]["sequence"]
    correct = write_take_with_video(data, "chidori", "correct", seq, "day", "20261031_110000")
    wrong = write_take_with_video(data, "chidori", "wrong_order", [seq[1], seq[0]] + seq[2:], "day", "20261031_110500")
    ev.main(["splits", "--data", str(data), "--quota", "1,0,1"])        # night -> train, day -> test
    before = {p: p.stat().st_mtime_ns for p in data.rglob("*") if p.is_file()}
    out_dir = ev.main(["run", "--data", str(data), "--sets", "all", "--model", "none",
                       "--out", str(tmp_path / "reports"), "--title", "synthetic"])
    assert {p: p.stat().st_mtime_ns for p in data.rglob("*") if p.is_file()} == before   # data untouched
    metrics = json.loads((out_dir / "metrics.json").read_text(encoding="utf-8"))
    assert metrics["sessions_by_set"]["test"] and metrics["sessions_by_set"]["train"]
    yolox = metrics["frame_level"]["test"]["yolox"]
    fused = metrics["frame_level"]["test"]["fused"]
    assert yolox["per_class"]["idle"]["recall"] == 1.0                      # grey frames: no seal found
    assert fused["per_class"]["tiger"]["recall"] == 0.0 and fused["frames"] > 0
    assert metrics["frame_level"]["test"]["landmarks"]["frames"] == 0       # no model: no landmark numbers
    assert all(r["video"]["aligned"] == "exact" for r in metrics["recordings"])
    assert metrics["sequence_level"]["single_sign_streams"]["false_activations"] == 0
    takes = {r["id"]: r for r in metrics["recordings"] if r["kind"] == "take"}
    assert takes[correct]["outcome"] == "missed" and takes[wrong]["outcome"] == "ok"   # no hands, grey video
    chidori = metrics["sequence_level"]["takes"]["test"]["chidori"]
    assert chidori["correct_takes"] == 1 and chidori["activation_rate"] == 0.0
    assert chidori["negative_takes"]["wrong_order"] == {"takes": 1, "false_activations": 0}
    summary = (out_dir / "summary.md").read_text(encoding="utf-8")
    assert "takes - test set" in summary
    assert "synthetic" in summary and "No landmark model" in summary
    assert (out_dir / "confusion_yolox_test.png").exists() and (out_dir / "confusion_fused_train.png").exists()


# ------------------------------------------------------------------ recordings with invalid labels (exclusions)
REASON = "invalid label: no tiger at any time"
OLD_KEYS = ["format", "created", "command", "title", "notes", "settings", "sets_evaluated", "sessions_by_set",
            "model", "yolox_used", "yolox_requested", "frame_level", "sequence_level", "recordings", "ignored",
            "warnings", "seconds"]


def write_splits(data, assignment):
    """data/splits.json with these recordings put in their set by hand (the library, not the `splits` command)."""
    recordings, ignored, _ = ev.splits_mod.scan(data)
    result, _ = ev.splits_mod.update(None, recordings, ignored)
    for rid, set_name in assignment.items():
        ev.splits_mod.assign(result, recordings, rid, set_name)
    ev.splits_mod.save(result, data / "splits.json")


def exclusion_entry(set_name, label, reason=REASON):
    return {"set": set_name, "label": label, "reason": reason, "evidence": "reports/x/evidence.png",
            "decided_on": "2026-11-01", "decided_by": "user"}


def data_with_exclusions(tmp_path, typo=False):
    """Night recordings in train, day ones + two takes in test; the record excludes the day tiger + one take
    (typo: and an id that is no recording)."""
    data, ids = tmp_path / "data", {}
    for label, lighting, stamp in [("idle", "night", "20261030_220000"), ("tiger", "night", "20261030_220100"),
                                   ("idle", "day", "20261031_100000"), ("tiger", "day", "20261031_100100")]:
        ids[label, lighting] = write_session(data, label, lighting=lighting, stamp=stamp, n=30)
        ts = np.load(data / "landmarks" / label / f"{ids[label, lighting]}.npz")["timestamps"]
        write_video(data, ids[label, lighting], label, len(ev.saved_video_frames(ts)))
    seq = config.JUTSU["chidori"]["sequence"]
    ids["correct"] = write_take_with_video(data, "chidori", "correct", seq, "day", "20261031_110000")
    ids["wrong"] = write_take_with_video(data, "chidori", "wrong_order", [seq[1], seq[0]] + seq[2:], "day",
                                         "20261031_110500")
    write_splits(data, {rid: "train" if "night" in key else "test" for key, rid in ids.items()})
    excluded = {ids["tiger", "day"]: exclusion_entry("test", "tiger"),
                ids["wrong"]: exclusion_entry("test", "chidori/wrong_order", "invalid label: not a wrong-order take")}
    if typo:
        excluded["me_day_20990101_000000"] = exclusion_entry("test", "idle", "a typo in the record")
    (data / ev.EXCLUSIONS_FILE).write_text(json.dumps({"format": ev.EXCLUSIONS_FORMAT, "recordings": excluded}),
                                           encoding="utf-8")
    return data, ids


def test_the_exclusion_record_is_checked(tmp_path):
    path = tmp_path / "exclusions.json"
    assert ev.load_exclusions(path) == {}                                   # no file: nothing excluded
    good = exclusion_entry("test", "tiger")
    path.write_text(json.dumps({"format": ev.EXCLUSIONS_FORMAT, "about": "...", "recordings": {"r1": good}}))
    assert ev.load_exclusions(path) == {"r1": good}
    record = {"format": ev.EXCLUSIONS_FORMAT}
    for text, error in [
            ("{not json", "not valid JSON"),
            (json.dumps({"format": "shinobi-splits-v1", "recordings": {}}), "not an exclusion record"),
            (json.dumps({**record, "recordings": ["r1"]}), '"recordings" must be an object'),
            (json.dumps({**record, "recordings": {"r1": "bad label"}}), "'r1' must be an object"),
            (json.dumps({**record, "recordings": {"r1": {**good, "reason": " "}}}), "'r1' has no reason"),
            (json.dumps({**record, "recordings": {"r1": {"set": "test"}}}),
             "'r1' has no label, reason, decided_on, decided_by"),
            (json.dumps({**record, "recordings": {"r1": {**good, "set": "testing"}}}), "'r1' has set 'testing'"),
            ('{"format": "%s", "recordings": {"r1": %s, "r1": %s}}' % (ev.EXCLUSIONS_FORMAT, json.dumps(good),
                                                                      json.dumps(good)), "'r1' appears twice")]:
        path.write_text(text)
        with pytest.raises(ev.ExclusionsError, match=error):
            ev.load_exclusions(path)


def test_excluded_recordings_are_evaluated_but_scored_apart(tmp_path):
    data, ids = data_with_exclusions(tmp_path, typo=True)
    idle, tiger, wrong = ids["idle", "day"], ids["tiger", "day"], ids["wrong"]
    before = {p: p.stat().st_mtime_ns for p in data.rglob("*") if p.is_file()}
    out_dir = ev.main(["run", "--data", str(data), "--sets", "all", "--model", "none",
                       "--out", str(tmp_path / "reports")])                 # the record is found in data/
    assert {p: p.stat().st_mtime_ns for p in data.rglob("*") if p.is_file()} == before   # nothing deleted / moved
    m = json.loads((out_dir / "metrics.json").read_text(encoding="utf-8"))
    assert list(m["exclusions"]["recordings"]) == [tiger, wrong]            # only the ones in this run
    assert m["exclusions"]["recordings"][tiger]["reason"] == REASON
    assert tiger in m["sessions_by_set"]["test"] and wrong in m["sessions_by_set"]["test"]   # still test recordings
    rec = {r["id"]: r for r in m["recordings"]}
    assert rec[tiger]["excluded"]["reason"] == REASON and "excluded" not in rec[idle]
    assert rec[tiger]["yolox"]["accuracy"] == 0.0                           # still evaluated on its own
    for name in ("yolox", "fused"):
        valid, every = m["frame_level"]["test"][name], m["frame_level_all_recordings"]["test"][name]
        own = rec[idle][name]["frames"], rec[tiger][name]["frames"]
        assert valid["sessions"] == [idle] and valid["frames"] == own[0] > 0
        assert valid["accuracy"] == 1.0 and valid["confusion"]["rows"] == ["idle"]
        assert every["sessions"] == sorted([idle, tiger]) and every["frames"] == sum(own)
        assert every["per_class"]["tiger"]["support"] == own[1] and every["accuracy"] < 1.0
    assert list(m["frame_level_all_recordings"]) == ["test"]                # train has no exclusion: given once
    seq = m["sequence_level"]
    assert seq["single_sign_streams"]["sessions"] == 3 and seq["single_sign_streams_all_recordings"]["sessions"] == 4
    assert seq["takes"]["test"]["chidori"]["negative_takes"] == {}
    assert seq["takes_all_recordings"]["test"]["chidori"]["negative_takes"]["wrong_order"]["takes"] == 1
    assert any("me_day_20990101_000000', which is not a recording" in w for w in m["warnings"])
    assert "Signs whose only test recordings are excluded (invalid labels): tiger. They have no valid test number." \
        in m["warnings"]

    summary = (out_dir / "summary.md").read_text(encoding="utf-8")
    assert summary.index("## Excluded from the scores: 2 recording(s)") < summary.index("## 1. What was measured")
    assert "not deleted and not moved" in summary and f"| {REASON} |" in summary
    assert f"| test | {tiger} - **EXCLUDED: {REASON}** | tiger |" in summary
    assert f"- {wrong} - **EXCLUDED: invalid label: not a wrong-order take**" in summary
    glance = summary.index("## 2.")
    assert (glance < summary.index("Valid recordings only (exclusions applied)", glance)
            < summary.index("All recordings (includes 1 recording with invalid labels)", glance))
    assert (out_dir / "confusion_yolox_test.png").exists()
    assert (out_dir / "confusion_yolox_test_all_recordings.png").exists()
    assert not (out_dir / "confusion_yolox_train_all_recordings.png").exists()


def test_exclusions_outside_the_run_or_switched_off_change_nothing(tmp_path):
    data, ids = data_with_exclusions(tmp_path)                              # the record excludes TEST recordings
    runs = {tag: ev.main(["run", "--data", str(data), "--sets", "train", "--model", "none",
                          "--out", str(tmp_path / tag)] + extra)
            for tag, extra in (("default", []), ("off", ["--exclusions", "none"]))}
    metrics = {t: json.loads((d / "metrics.json").read_text(encoding="utf-8")) for t, d in runs.items()}
    for m in metrics.values():
        assert list(m) == OLD_KEYS and list(m["sequence_level"]) == ["takes_found", "takes", "single_sign_streams"]
        assert not any("excluded" in r for r in m["recordings"])
    assert metrics["default"]["settings"]["exclusions"] == str(data / ev.EXCLUSIONS_FILE)
    assert metrics["off"]["settings"]["exclusions"] is None

    def same(text):                                                         # without time stamp and timings
        return [line for line in text.splitlines()[1:] if not line.startswith("Time per")]

    summaries = {t: (d / "summary.md").read_text(encoding="utf-8") for t, d in runs.items()}
    assert same(summaries["default"]) == same(summaries["off"])
    assert [line for line in summaries["default"].splitlines() if line.startswith("## ")] == [
        "## 1. What was measured", "## 2. Results at a glance (frame level)", "## 3. Details per set and recogniser",
        "## 4. Every recording", "## 5. Jutsu (sequence level)", "## 6. Warnings and caveats",
        "## 7. How to read this report"]
    assert "EXCLUDED" not in summaries["default"] and "invalid label" not in summaries["default"]
    assert sorted(p.name for p in runs["default"].glob("*.png")) == ["confusion_fused_train.png",
                                                                     "confusion_yolox_train.png"]

    # switched off on the test set: the excluded recording is scored like any other
    out_dir = ev.main(["run", "--data", str(data), "--sessions", f"{ids['idle', 'day']},{ids['tiger', 'day']}",
                       "--recognizers", "yolox", "--model", "none", "--exclusions", "none",
                       "--out", str(tmp_path / "none")])
    m = json.loads((out_dir / "metrics.json").read_text(encoding="utf-8"))
    assert list(m) == OLD_KEYS
    assert m["frame_level"]["test"]["yolox"]["sessions"] == sorted([ids["idle", "day"], ids["tiger", "day"]])


def test_a_broken_exclusion_record_stops_the_run(tmp_path):
    data, out = tmp_path / "data", tmp_path / "reports"
    write_splits(data, {write_session(data, "tiger", lighting="day", stamp="20261031_100100"): "test"})
    run = ["run", "--data", str(data), "--model", "none", "--out", str(out)]
    (data / ev.EXCLUSIONS_FILE).write_text(json.dumps({"format": ev.EXCLUSIONS_FORMAT,
                                                       "recordings": {"r1": {"set": "test"}}}))
    with pytest.raises(SystemExit, match="ERROR: .*'r1' has no label, reason"):
        ev.main(run)
    with pytest.raises(SystemExit, match="ERROR: .*does not exist"):
        ev.main(run + ["--exclusions", str(tmp_path / "missing.json")])
    assert not out.exists()                                                 # failed before anything was evaluated

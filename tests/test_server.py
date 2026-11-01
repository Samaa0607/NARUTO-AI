"""shinobi/server.py: REST, WebSocket protocol (docs/web_protocol.md) and real end-to-end recognition.

Run:  python -m pytest -q tests/test_server.py

The end-to-end tests stream the user's own recordings (data/videos/<sign>/me_night_*.mp4, read only)
through the WebSocket like a browser camera does, in real time, and check that the real pipeline
(MediaPipe + YOLOX + landmark model + SignFusion + ActionController) fires the jutsu. Nothing is mocked
there. Shadow Clone and Rasengan need models/gesture_model.joblib (not in git): skipped without it.
"""

import re
import struct
import threading
import time
import wave

import anyio
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

import shinobi.server as server_module
from shinobi import catalog, config
from shinobi.effects import activation_stages
from shinobi.server import create_app, pack, unpack

VIDEOS = config.VIDEOS_DIR
CLIP_FPS = 15                       # the recordings are 15 fps
SIGN_SECONDS = 2.4                  # each sign is held this long (36 recorded frames)
# One night recording per sign, and the first of the 36 frames used (4 s in, the same for all).
# YOLOX finds the seal in 98-100% of these frames, NOT all of them: these windows contain real
# single misses (tiger: frame 84, snake: 61, 62, 71, 72). A miss in the middle of a held seal makes
# the stabilizer confirm that seal again; SequenceMatcher counts that as a repeat, not a new step
# (before that fix it broke the sequence, see tests/test_events.py and tests/test_sequences.py).
SIGN_VIDEOS = {
    "monkey": ("monkey/me_night_20261030_215808.mp4", 60), "boar": ("boar/me_night_20261030_220743.mp4", 60),
    "horse": ("horse/me_night_20261030_220040.mp4", 60), "tiger": ("tiger/me_night_20261030_220235.mp4", 60),
    "snake": ("snake/me_night_20261030_220610.mp4", 60), "dog": ("dog/me_night_20261030_215059.mp4", 60),
    "ram": ("ram/me_night_20261030_220443.mp4", 60),
    # landmark-model signs. clone_seal: the only recording there is, so the model was TRAINED on it (these
    # tests prove the wiring, not recognition on new recordings). rasengan_palm: the VALIDATION recording
    # (never trained on, but the same day and light as the training ones). See docs/14_evaluation.md.
    "clone_seal": ("clone_seal/me_night_20261030_214750.mp4", 60),
    "rasengan_palm": ("rasengan/me_day_20261030_175251.mp4", 60),
}
needs_landmark_model = pytest.mark.skipif(not config.GESTURE_MODEL_PATH.exists(),
                                          reason="clone_seal / rasengan_palm need models/gesture_model.joblib "
                                                 "(python train.py); it is not in git")
IDLE_HANDS_DOWN = "idle/me_night_20261030_221934.mp4"     # first 10 s: no hand in the picture
IDLE_HANDS_UP = "idle/me_night_20261030_222754.mp4"       # hands visible all the time, no seal

_video_cache = {}


def video(rel, count=10_000):
    """The first `count` frames of a recording (cached: decoding is slow on a busy CPU)."""
    if len(_video_cache.get(rel, ())) < count and not _video_cache.get(rel + ":complete"):
        cap = cv2.VideoCapture(str(VIDEOS / rel))
        frames = []
        while len(frames) < count:
            ok, frame = cap.read()
            if not ok:
                _video_cache[rel + ":complete"] = True
                break
            frames.append(frame)
        cap.release()
        assert frames, rel
        _video_cache[rel] = frames
    return _video_cache[rel][:count]


def browser_jpeg(frame):
    """The recordings were saved mirrored (shinobi/camera.py flips); a browser sends the camera
    picture NOT mirrored, so flip it back, then JPEG quality 0.8 like the web app."""
    ok, data = cv2.imencode(".jpg", cv2.flip(frame, 1), [cv2.IMWRITE_JPEG_QUALITY, 80])
    assert ok
    return data.tobytes()


def clip(signs, lead=1.0, tail=4.0):
    """JPEG frames at 15 fps: idle (hands down), each sign for SIGN_SECONDS, idle again."""
    n_lead, n_sign, n_tail = int(lead * CLIP_FPS), int(SIGN_SECONDS * CLIP_FPS), int(tail * CLIP_FPS)
    idle = video(IDLE_HANDS_DOWN, n_lead + n_tail)
    frames = idle[:n_lead]
    for sign in signs:
        rel, start = SIGN_VIDEOS[sign]
        frames += video(rel, start + n_sign)[start:]
    frames += idle[n_lead:n_lead + n_tail]
    return [browser_jpeg(f) for f in frames]


# ------------------------------------------------------------------ client helpers
def receive(ws, timeout=60.0):
    """Next server message ({"type": "websocket.send" | "websocket.close", ...}), with a timeout."""
    async def get():
        with anyio.fail_after(timeout):
            return await ws._send_rx.receive()
    return ws.portal.call(get)


def parse(message):
    """("frame", header, jpeg) | ("text", dict) | ("close", code)."""
    if message["type"] == "websocket.close":
        return "close", message.get("code")
    if message.get("bytes") is not None:
        header, jpeg = unpack(message["bytes"])
        return "frame", header, jpeg
    import json
    return "text", json.loads(message["text"])


def next_text(ws):
    kind, *rest = parse(receive(ws))
    assert kind == "text", (kind, rest)
    return rest[0]


def wait_idle(client, timeout=20.0):
    end = time.perf_counter() + timeout
    while client.get("/api/info").json()["sessions"]["active"] and time.perf_counter() < end:
        time.sleep(0.05)
    return client.get("/api/info").json()["sessions"]["active"]


def stream(ws, frames, fps_cap=15.0, max_in_flight=config.FRAME_MAX_IN_FLIGHT):
    """Play `frames` (15 fps) in real time like a browser camera: always the frame of 'now',
    at most `max_in_flight` unanswered, at most fps_cap per second. Frames the server is too slow
    for are never sent (a real camera does not wait either). Returns (frame headers, text messages)."""
    duration = len(frames) / CLIP_FPS
    headers, texts, in_flight = [], [], 0
    start = next_send = time.perf_counter()
    while True:
        now = time.perf_counter()
        elapsed = now - start
        if elapsed < duration and in_flight < max_in_flight:
            if now < next_send:
                time.sleep(next_send - now)
                continue
            ws.send_bytes(pack({"t": round(elapsed * 1000, 1)}, frames[min(int(elapsed * CLIP_FPS), len(frames) - 1)]))
            in_flight += 1
            next_send = now + 1.0 / fps_cap
            continue
        if in_flight == 0:
            return headers, texts
        kind, *rest = parse(receive(ws))
        if kind == "frame":
            headers.append(rest[0])
            in_flight -= 1
        elif kind == "text":
            texts.append(rest[0])
            in_flight -= rest[0]["type"] == "skipped"
        else:
            raise AssertionError(f"connection closed: {rest}")


def events_of(headers):
    return [e for h in headers for e in h["events"]]


def signs_of(events):
    """Confirmed signs, a held seal confirmed again (a repeat) counted once."""
    signs = [e["sign"] for e in events if e["type"] == "sign"]
    return [s for i, s in enumerate(signs) if i == 0 or s != signs[i - 1]]


# ------------------------------------------------------------------ fixtures
@pytest.fixture(scope="module")
def client():
    with TestClient(create_app(max_sessions=2)) as c:
        yield c


@pytest.fixture
def ws_client(client):
    assert wait_idle(client) == 0, "a session of an earlier test is still open"
    return client


# ------------------------------------------------------------------ REST
def test_info(client):
    info = client.get("/api/info").json()
    assert info["name"] == "SHINOBI AI" and info["protocol"] == 1 and info["version"] == config.APP_VERSION
    assert info["yolox"] is True                                     # models/yolox_nano.onnx is there
    assert info["landmark_model"] == config.GESTURE_MODEL_PATH.exists()
    if info["landmark_model"]:                                       # YOLOX seals + clone_seal / rasengan_palm
        assert info["recognizable"] == ["ram", "snake", "tiger", "dog", "monkey", "boar", "horse",
                                        "clone_seal", "rasengan_palm"]
        assert info["jutsu_available"] == {"fire_style": True, "chidori": True,
                                           "shadow_clone": True, "rasengan": True}
    else:
        assert info["recognizable"] == ["ram", "snake", "tiger", "dog", "monkey", "boar", "horse"]
        assert info["jutsu_available"] == {"fire_style": True, "chidori": True,
                                           "shadow_clone": False, "rasengan": False}
    assert info["sessions"]["max"] == 2
    assert info["frame"] == {"max_width": 1280, "max_height": 1280, "jpeg_quality": 0.8, "max_in_flight": 2}
    assert info["mirror"] is config.MIRROR


def test_catalog_follows_config_and_every_picture_is_served(client):
    cat = client.get("/api/jutsu").json()
    info = client.get("/api/info").json()
    assert [j["id"] for j in cat["jutsu"]] == list(config.JUTSU)
    for j in cat["jutsu"]:
        spec = config.JUTSU[j["id"]]
        assert [s["sign"] for s in j["steps"]] == spec["sequence"]
        assert [s["step"] for s in j["steps"]] == [1, 2, 3, 4]
        assert j["official"] is spec["official"] and j["effect"] == spec["effect"]
        assert j["available"] is info["jutsu_available"][j["id"]]
        assert j["missing_signs"] == [s for s in spec["sequence"] if s not in info["recognizable"]]
        assert j["name"] and j["kanji"] and j["description"] and "  " not in j["tag"] + j["provenance"]
        for url in [s["card"] for s in j["steps"]] + [j["sequence_image"]]:
            r = client.get(url)
            assert r.status_code == 200 and r.headers["content-type"] == "image/png", url
    assert set(cat["signs"]) == {s for spec in config.JUTSU.values() for s in spec["sequence"]}
    for sid, sign in cat["signs"].items():
        assert sign["id"] == sid and sign["recognizable"] is (sid in info["recognizable"])
        assert sign["recognizer"] == ("landmarks" if sid in config.LANDMARK_SIGNS else "yolox")
        assert client.get(sign["art"]).status_code == 200, sign["art"]
    assert cat["signs"]["rasengan_palm"]["official"] is False and cat["signs"]["tiger"]["hands"] == 2


def documented_sounds():
    """folder/file of every sound in the tables of assets/audio/ASSET_LICENSES.md (a section per folder,
    "## Fire Style (`fire_style/`)", one row per file, "| `hand_sign.wav` ..."), voice/ excluded."""
    folder, out = None, set()
    for line in (config.AUDIO_DIR / "ASSET_LICENSES.md").read_text(encoding="utf-8").splitlines():
        heading = re.match(r"^## .*\(`([a-z_]+)/`\)", line)
        if heading:
            folder = heading.group(1)
        elif line.startswith("## "):
            folder = None
        row = re.match(r"^\| `([^`]+\.(?:wav|flac))`", line)
        if row and folder and folder != "voice":
            out.add(f"{folder}/{row.group(1)}")
    return out


def test_credits_and_every_sound_is_served(client):
    sections = client.get("/api/credits").json()["sections"]
    assert len(sections) == 5
    for section in sections:
        assert all(set(item) == {"text", "url", "license", "license_url"} for item in section["items"])
    # every sound documented in assets/audio/ASSET_LICENSES.md is there and served as audio, and no sound
    # file is there without a licence entry (the character voice clips the user adds, in voice/, aside)
    documented = documented_sounds()
    assert len(documented) >= 19 and "music/leaf_trail_loop.flac" in documented
    present = {p.relative_to(config.AUDIO_DIR).as_posix() for p in config.AUDIO_DIR.rglob("*")
               if p.suffix in (".wav", ".flac") and p.relative_to(config.AUDIO_DIR).parts[0] != "voice"}
    assert present == documented, {"undocumented": present - documented, "missing": documented - present}
    for rel in sorted(documented):
        r = client.get("/audio/" + rel)
        assert r.status_code == 200 and r.headers["content-type"].startswith("audio/"), rel
    assert client.get("/audio/nope.wav").status_code == 404
    for sneaky in ("/references/../shinobi/config.py", "/%2e%2e/shinobi/config.py", "/references/%2e%2e/README.md"):
        r = client.get(sneaky)                                       # never a file outside the served folders
        assert "SEAL_MODEL_PATH" not in r.text and "Gesture References" not in r.text, sneaky


def test_voice_clips_listing(client, tmp_path, monkeypatch):
    voices = client.get("/api/voices").json()["voices"]
    assert set(voices) == set(catalog.JUTSU)
    assert {j: v["speaker"] for j, v in voices.items()} == {
        "fire_style": "Naruto", "chidori": "Sasuke", "shadow_clone": "Naruto", "rasengan": "Naruto"}
    monkeypatch.setattr(config, "AUDIO_DIR", tmp_path)              # the folder is read on each request
    folder = tmp_path / "voice" / "rasengan"
    folder.mkdir(parents=True)
    for name in ("activation.mp3", "name.ogg", "intro.ogg"):          # WAV only: the others are not used
        (folder / name).write_bytes(b"\0")
    with wave.open(str(folder / "name.wav"), "wb") as f:               # a real 0.5 s PCM clip
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(16000)
        f.writeframes(b"\0\0" * 8000)
    voices = client.get("/api/voices").json()["voices"]
    assert voices["rasengan"] == {"speaker": "Naruto", "activation": None, "name": "/audio/voice/rasengan/name.wav",
                                  "seconds": {"activation": None, "name": 0.5}}
    assert voices["chidori"] == {"speaker": "Sasuke", "activation": None, "name": None,
                                 "seconds": {"activation": None, "name": None}}


def test_frontend_spa_fallback_and_build_help(client, tmp_path, monkeypatch):
    assert client.get("/api/nothing").status_code == 404
    monkeypatch.setattr(config, "FRONTEND_DIST", tmp_path / "missing")
    page = client.get("/")
    assert page.status_code == 200 and "npm run build" in page.text
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>app</title>")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    monkeypatch.setattr(config, "FRONTEND_DIST", dist)
    for path in ("/", "/practice/fire_style", "/credits"):
        r = client.get(path)
        assert r.status_code == 200 and "<title>app</title>" in r.text, path
    js = client.get("/assets/app.js")
    assert js.text == "console.log(1)" and js.headers["content-type"].startswith("text/javascript")


# ------------------------------------------------------------------ framing
def test_pack_unpack_round_trip():
    data = pack({"t": 12.5, "x": "ü"}, b"\xff\xd8\xffjpeg")
    assert struct.unpack(">I", data[:4])[0] == len(data) - 4 - len(b"\xff\xd8\xffjpeg")
    assert unpack(data) == ({"t": 12.5, "x": "ü"}, b"\xff\xd8\xffjpeg")
    for bad in (b"", b"\x00\x00", struct.pack(">I", 99) + b"{}", struct.pack(">I", 2) + b"[]", struct.pack(">I", 1) + b"{"):
        with pytest.raises(ValueError):
            unpack(bad)


# ------------------------------------------------------------------ WebSocket protocol
def test_hello_ping_mode_options_reset(ws_client):
    with ws_client.websocket_connect("/ws") as ws:
        hello = next_text(ws)
        assert hello["type"] == "hello" and hello["protocol"] == 1 and len(hello["session"]) == 6
        assert hello["mode"] == {"mode": "free", "jutsu": None} and hello["info"]["sessions"]["active"] == 1
        ws.send_json({"type": "ping", "t": 42.5})
        assert next_text(ws) == {"type": "pong", "t": 42.5}
        ws.send_json({"type": "mode", "mode": "practice", "jutsu": "chidori"})
        assert next_text(ws) == {"type": "mode", "mode": "practice", "jutsu": "chidori"}
        for bad in ({"type": "mode", "mode": "practice", "jutsu": "kamehameha"}, {"type": "mode", "mode": "x"},
                    {"type": "options", "landmarks": "yes"}, {"type": "dance"}):
            ws.send_json(bad)
            error = next_text(ws)
            assert (error["type"], error["code"], error["fatal"]) == ("error", "bad_message", False)
        ws.send_text("not json")
        assert next_text(ws)["code"] == "bad_message"
        ws.send_json({"type": "reset"})                              # no answer, the session goes on
        frame = video(SIGN_VIDEOS["tiger"][0], 1)[0]
        ws.send_bytes(pack({"t": 1}, browser_jpeg(frame)))
        _, plain, plain_jpeg = parse(receive(ws))
        assert plain["mode"] == {"mode": "practice", "jutsu": "chidori"} and set(plain["progress"]) == {"chidori"}
        assert plain["time_left"] is None                            # practice mode has no time limit
        ws.send_json({"type": "options", "landmarks": True})
        ws.send_bytes(pack({"t": 2}, browser_jpeg(frame)))
        _, marked, marked_jpeg = parse(receive(ws))
        assert marked["hands"] >= 1
        a = cv2.imdecode(np.frombuffer(plain_jpeg, np.uint8), cv2.IMREAD_COLOR).astype(int)
        b = cv2.imdecode(np.frombuffer(marked_jpeg, np.uint8), cv2.IMREAD_COLOR).astype(int)
        assert (np.abs(a - b).max(axis=2) > 80).sum() > 500         # white landmark lines were drawn
        ws.send_json({"type": "mode", "mode": "free"})
        assert next_text(ws) == {"type": "mode", "mode": "free", "jutsu": None}


def test_frame_round_trip_mirroring_and_scaling(ws_client):
    recorded = video(SIGN_VIDEOS["tiger"][0], 1)[0]                         # already mirrored on disk
    with ws_client.websocket_connect("/ws") as ws:
        next_text(ws)
        ws.send_bytes(pack({"t": 123.25}, browser_jpeg(recorded)))
        kind, state, jpeg = parse(receive(ws))
        assert kind == "frame" and state["type"] == "frame" and state["seq"] == 1 and state["client_t"] == 123.25
        assert (state["width"], state["height"]) == (852, 480)
        back = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR).astype(int)
        assert np.abs(back - recorded).mean() < 6                    # mirrored back by the server
        assert np.abs(back - cv2.flip(recorded, 1)).mean() > 15
        assert set(state["timings"]) >= {"decode", "hands", "fx", "encode", "total"}
        for key in ("fps", "hands", "sign", "candidate", "hold", "latched", "history", "progress",
                    "time_left", "cooldown", "mode", "effect", "events"):
            assert key in state, key
        for (w, h), expected in (((1920, 1080), (1280, 720)), ((720, 1280), (720, 1280)),
                                 ((2000, 3000), (853, 1280)), ((640, 480), (640, 480))):
            ok, data = cv2.imencode(".jpg", cv2.resize(recorded, (w, h)))
            ws.send_bytes(pack({"t": 1.0}, data.tobytes()))
            _, state, jpeg = parse(receive(ws))
            assert (state["width"], state["height"]) == expected
            assert cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR).shape[:2] == expected[::-1]


def test_too_many_frames_in_flight_are_skipped_in_order(ws_client):
    jpeg = browser_jpeg(video(IDLE_HANDS_DOWN, 1)[0])
    with ws_client.websocket_connect("/ws") as ws:
        next_text(ws)
        for t in range(8):                                           # a client ignoring max_in_flight
            ws.send_bytes(pack({"t": t}, jpeg))
        answers = []
        for _ in range(8):
            kind, *rest = parse(receive(ws))
            answers.append(("frame", rest[0]["client_t"]) if kind == "frame" else (rest[0]["type"], rest[0]["client_t"]))
        assert [t for _, t in answers] == list(range(8))             # every frame answered, in order
        assert ("skipped", 1) in answers and answers[-1] == ("frame", 7)
        assert sum(kind == "frame" for kind, _ in answers) >= 3


def test_bad_frames_are_skipped_and_the_session_goes_on(ws_client):
    good = browser_jpeg(video(IDLE_HANDS_DOWN, 1)[0])
    ok, png = cv2.imencode(".png", video(IDLE_HANDS_DOWN, 1)[0])
    with ws_client.websocket_connect("/ws") as ws:
        next_text(ws)
        for data, t in ((b"garbage", None), (pack({"t": 5}, png.tobytes()), 5), (pack({"t": 6}, b"\xff\xd8\xff" + b"0" * 50), 6),
                        (pack({"t": 7}, b"\xff\xd8\xff" + bytes(config.FRAME_MAX_BYTES)), None)):
            ws.send_bytes(data)
            error = next_text(ws)
            assert (error["type"], error["code"], error["fatal"]) == ("error", "bad_frame", False)
            assert next_text(ws) == {"type": "skipped", "client_t": t}
        ws.send_bytes(pack({"t": 8}, good))
        kind, state, _ = parse(receive(ws))
        assert kind == "frame" and state["client_t"] == 8 and state["seq"] == 1


def test_busy_beyond_max_sessions_and_slot_freed_after_disconnect(ws_client):
    with ws_client.websocket_connect("/ws") as first, ws_client.websocket_connect("/ws") as second:
        assert next_text(first)["type"] == "hello" and next_text(second)["type"] == "hello"
        assert ws_client.get("/api/info").json()["sessions"]["active"] == 2
        with ws_client.websocket_connect("/ws") as third:
            busy = next_text(third)
            assert (busy["type"], busy["code"], busy["fatal"]) == ("error", "busy", True)
            assert parse(receive(third)) == ("close", 1013)
    assert wait_idle(ws_client) == 0                                  # both slots freed
    with ws_client.websocket_connect("/ws") as again:
        assert next_text(again)["type"] == "hello"


def test_a_crash_closes_only_that_session_and_frees_its_slot(ws_client, monkeypatch):
    class Broken(server_module.Engine):
        def process(self, frame, now):
            raise RuntimeError("boom")

    monkeypatch.setattr(server_module, "Engine", Broken)
    with ws_client.websocket_connect("/ws") as ws:
        next_text(ws)
        ws.send_bytes(pack({"t": 1}, browser_jpeg(video(IDLE_HANDS_DOWN, 1)[0])))
        error = next_text(ws)
        assert (error["code"], error["fatal"]) == ("internal", True) and "boom" in error["message"]
        assert parse(receive(ws)) == ("close", 1011)
    assert wait_idle(ws_client) == 0


# ------------------------------------------------------------------ real end-to-end recognition
PHASES = ["voice", "charge", "name", "release"]


def check_jutsu_run(headers, texts, jutsu, effect):
    events = events_of(headers)
    seq = config.JUTSU[jutsu]["sequence"]
    assert not [t for t in texts if t["type"] == "error"], texts
    assert signs_of(events) == seq
    assert [(e["jutsu"], e["step"], e["sign"]) for e in events if e["type"] == "step" and e["jutsu"] == jutsu] == \
        [(jutsu, i + 1, s) for i, s in enumerate(seq[:3])]
    assert [e for e in events if e["type"] == "jutsu"] == [
        {"type": "jutsu", "jutsu": jutsu, "effect": effect, "stages": activation_stages(jutsu)}]
    assert not [e for e in events if e["type"] in ("sequence_failed", "wrong_sign")], events
    after = events[[e["type"] for e in events].index("jutsu"):]
    # the build-up (voice, charge, name), then the main effect; every stage reported once, in order
    assert [e["phase"] for e in after if e["type"] == "effect_phase"] == ["charge", "name", "release"]
    assert all(e["effect"] == effect and e["jutsu"] == jutsu for e in after if e["type"] == "effect_phase")
    # it outlives the hands-down tail of the clip (a hand effect no longer ends when the hand is gone)
    assert "effect_end" not in [e["type"] for e in after] and headers[-1]["effect"]["name"] == effect
    with_effect = [h["effect"] for h in headers if h["effect"]]
    assert with_effect and all(e["name"] == effect and e["jutsu"] == jutsu for e in with_effect)
    phases = [PHASES.index(e["phase"]) for e in with_effect]
    assert phases == sorted(phases) and with_effect[-1]["phase"] == "release"
    assert all((e["phase_left"] is None) == (e["phase"] == "release") for e in with_effect)
    fired = next(i for i, h in enumerate(headers) if any(e["type"] == "jutsu" for e in h["events"]))
    assert headers[fired - 1]["progress"][jutsu] == 3 and headers[fired]["progress"][jutsu] == 0
    assert headers[fired]["cooldown"] > 1.0
    return events


def test_e2e_fire_style_from_the_real_recordings(ws_client):
    frames = clip(config.JUTSU["fire_style"]["sequence"])            # monkey, boar, horse, tiger
    with ws_client.websocket_connect("/ws") as ws:
        next_text(ws)
        headers, texts = stream(ws, frames)
    events = check_jutsu_run(headers, texts, "fire_style", "fire")
    print(f"\nfire_style: {len(headers)} frames answered, "
          f"{sum(t['type'] == 'skipped' for t in texts)} skipped, events {[e['type'] for e in events]}")


def test_e2e_chidori_in_practice_mode_from_the_real_recordings(ws_client):
    frames = clip(config.JUTSU["chidori"]["sequence"])               # snake, dog, tiger, monkey
    with ws_client.websocket_connect("/ws") as ws:
        next_text(ws)
        ws.send_json({"type": "mode", "mode": "practice", "jutsu": "chidori"})
        assert next_text(ws)["mode"] == "practice"
        headers, texts = stream(ws, frames)
    events = check_jutsu_run(headers, texts, "chidori", "chidori")
    print(f"\nchidori: {len(headers)} frames answered, signs {[e['sign'] for e in events if e['type'] == 'sign']}")
    assert all(h["mode"] == {"mode": "practice", "jutsu": "chidori"} for h in headers)


def test_e2e_wrong_order_fires_nothing(ws_client):
    frames = clip(["boar", "monkey", "horse", "tiger"], tail=1.5)
    with ws_client.websocket_connect("/ws") as ws:
        next_text(ws)
        headers, _ = stream(ws, frames)
    events = events_of(headers)
    assert signs_of(events) == ["boar", "monkey", "horse", "tiger"]
    assert not [e for e in events if e["type"] in ("jutsu", "effect_stopping", "effect_end")]
    assert all(h["effect"] is None for h in headers)
    wrong = [e for e in events if e["type"] == "wrong_sign"]
    assert wrong and wrong[0] == {"type": "wrong_sign", "jutsu": "fire_style", "step": 1, "expected": "boar",
                                  "got": "horse"}
    first_wrong = next(i for i, h in enumerate(headers) if any(e["type"] == "wrong_sign" for e in h["events"]))
    assert headers[first_wrong]["progress"]["fire_style"] == 1        # monkey still counts: nothing was reset
    # the wrong signs do not extend the time: 7 s after monkey Fire Style starts over (a timeout, nothing else)
    assert all(e["reason"] == "timeout" and e["jutsu"] == "fire_style" and e["step"] == 1
               for e in events if e["type"] == "sequence_failed")


def test_e2e_practice_a_wrong_sign_on_step_3_then_the_retry_finishes(ws_client):
    """Practice mode: monkey, boar, then snake instead of horse (a wrong sign: Horse stays the step,
    monkey and boar stay done), then horse and tiger: the jutsu fires."""
    frames = clip(["monkey", "boar", "snake", "horse", "tiger"])
    with ws_client.websocket_connect("/ws") as ws:
        next_text(ws)
        ws.send_json({"type": "mode", "mode": "practice", "jutsu": "fire_style"})
        assert next_text(ws)["mode"] == "practice"
        headers, texts = stream(ws, frames)
    events = events_of(headers)
    assert not [t for t in texts if t["type"] == "error"], texts
    assert signs_of(events) == ["monkey", "boar", "snake", "horse", "tiger"]
    assert [e for e in events if e["type"] == "wrong_sign"] == [
        {"type": "wrong_sign", "jutsu": "fire_style", "step": 2, "expected": "horse", "got": "snake"}]
    assert [e["step"] for e in events if e["type"] == "step"] == [1, 2, 3]
    assert [e["jutsu"] for e in events if e["type"] == "jutsu"] == ["fire_style"]
    assert not [e for e in events if e["type"] == "sequence_failed"]
    fired = next(i for i, h in enumerate(headers) if any(e["type"] == "jutsu" for e in h["events"]))
    steps = [h["progress"]["fire_style"] for h in headers[:fired]]
    assert steps == sorted(steps) and all(h["time_left"] is None for h in headers)


def test_e2e_two_sessions_only_the_one_doing_the_seals_gets_the_jutsu(ws_client):
    fire = clip(config.JUTSU["fire_style"]["sequence"], tail=2.0)
    idle = [browser_jpeg(f) for f in video(IDLE_HANDS_UP)]
    idle = (idle * 2)[:len(fire)]
    results = {}

    def run(name, frames):
        try:
            with ws_client.websocket_connect("/ws") as ws:
                next_text(ws)
                results[name] = stream(ws, frames)
        except BaseException as e:                                    # reported by the main thread
            results[name] = e

    threads = [threading.Thread(target=run, args=a) for a in (("fire", fire), ("idle", idle))]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=180)
    for name in ("fire", "idle"):
        assert not isinstance(results.get(name), BaseException), results.get(name)
    fire_events, idle_events = events_of(results["fire"][0]), events_of(results["idle"][0])
    assert [(e["jutsu"], e["effect"]) for e in fire_events if e["type"] == "jutsu"] == [("fire_style", "fire")]
    assert not [e for e in idle_events if e["type"] in ("jutsu", "step")]
    assert all(h["effect"] is None for h in results["idle"][0])
    assert results["fire"][0][-1]["seq"] > 20 and results["idle"][0][-1]["seq"] > 20


@needs_landmark_model
def test_e2e_shadow_clone_from_the_real_recordings(ws_client):
    """ram, snake, tiger (YOLOX) then clone_seal (landmark model). The clone_seal clip is the model's own
    training recording: this checks the whole chain, not recognition of new recordings."""
    # ram, snake, tiger, clone_seal; a longer tail: the clones pop only after the build-up (~2 s)
    frames = clip(config.JUTSU["shadow_clone"]["sequence"], tail=7.0)
    with ws_client.websocket_connect("/ws") as ws:
        next_text(ws)
        headers, texts = stream(ws, frames)
    events = check_jutsu_run(headers, texts, "shadow_clone", "shadow_clone")
    kinds = [e["type"] if e["type"] != "effect_phase" else e["phase"] for e in events]
    assert "clones" in kinds and kinds.index("clones") > kinds.index("release")   # they pop after the name call


@needs_landmark_model
def test_e2e_rasengan_from_the_real_recordings(ws_client):
    """clone_seal (landmarks), dog, horse (YOLOX), rasengan_palm (landmarks, the validation recording)."""
    frames = clip(config.JUTSU["rasengan"]["sequence"])              # clone_seal, dog, horse, rasengan_palm
    with ws_client.websocket_connect("/ws") as ws:
        next_text(ws)
        headers, texts = stream(ws, frames)
    check_jutsu_run(headers, texts, "rasengan", "rasengan")


def test_shadow_clone_rendering_through_the_websocket(ws_client, monkeypatch):
    """The Shadow Clone's rendering through a session, without depending on recognition (which needs the
    landmark model, not in git): the effect is started directly (Engine.start_effect, desktop key 1):
    no jutsu event, real segmentation and clones."""
    class StartsShadowClone(server_module.Engine):
        def process(self, frame, now):
            if self.effects.active is None and not getattr(self, "_started", False):
                self._started = True
                self.start_effect("shadow_clone", now)
            return super().process(frame, now)

    monkeypatch.setattr(server_module, "Engine", StartsShadowClone)
    frames = [browser_jpeg(f) for f in video(IDLE_HANDS_DOWN, 45)]   # 3 s
    with ws_client.websocket_connect("/ws") as ws:
        next_text(ws)
        headers, texts = stream(ws, frames)
    effects = [h["effect"] for h in headers]
    assert all(e is not None and e["name"] == "shadow_clone" and e["jutsu"] is None for e in effects)
    assert all(isinstance(e["crowded"], bool) for e in effects) and max(e["clones"] for e in effects) >= 5
    counts = [e["count"] for e in events_of(headers) if e["type"] == "clones"]
    assert counts and counts == sorted(counts) and len(set(counts)) == len(counts)
    assert not [e for e in events_of(headers) if e["type"] == "jutsu"]
    assert "seg" in headers[-1]["timings"]

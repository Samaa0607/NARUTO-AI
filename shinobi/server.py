"""SHINOBI AI web server: REST + WebSocket for the React app (contract: docs/web_protocol.md).

Run:  python -m shinobi.server [--host 127.0.0.1] [--port 8000] [--max-sessions 2]
                               [--ssl-certfile cert.pem --ssl-keyfile key.pem]

Every WebSocket connection is one Session with its own Engine (hand tracker, YOLOX worker,
segmentation, fusion, sequence state, effects). Its frames are processed in the session's own
single thread, off the event loop, so a slow session never blocks the others and its MediaPipe
objects are never used by two threads at once. The trained landmark classifier (if there is one)
is loaded once and shared, read-only. Every recognition and every jutsu comes from the engine.
"""

import argparse
import asyncio
import concurrent.futures
import contextlib
import json
import mimetypes
import secrets
import struct
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from shinobi import catalog, config
from shinobi.classifier import GestureClassifier
from shinobi.engine import Engine
from shinobi.events import EffectView, EventTracker, FrameView

# Windows takes MIME types from the registry, where .js is sometimes "text/plain": browsers then
# refuse to run the app's JavaScript modules. Set the types the built app needs explicitly.
for _type, _ext in (("text/javascript", ".js"), ("text/javascript", ".mjs"), ("text/css", ".css"),
                    ("image/svg+xml", ".svg"), ("application/wasm", ".wasm"), ("application/json", ".json"),
                    ("application/manifest+json", ".webmanifest"), ("audio/wav", ".wav"), ("audio/flac", ".flac")):
    mimetypes.add_type(_type, _ext)

YOLOX_SIGNS = [s for s in config.GESTURES if s in config.SEAL_CLASSES.values()]
HEADER_LEN = struct.Struct(">I")          # uint32 big-endian: length of the JSON header
# the frames sent back (effects drawn on them): finer than the camera frames, full colour resolution
OUTPUT_JPEG = [cv2.IMWRITE_JPEG_QUALITY, config.OUTPUT_JPEG_QUALITY]
if config.OUTPUT_JPEG_444:
    OUTPUT_JPEG += [cv2.IMWRITE_JPEG_SAMPLING_FACTOR, cv2.IMWRITE_JPEG_SAMPLING_FACTOR_444]

BUILD_HELP = """<!doctype html><html><head><meta charset="utf-8"><title>SHINOBI AI</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 42rem; margin: 3rem auto; line-height: 1.5">
<h1>SHINOBI AI server is running</h1>
<p>The web app is not built yet (<code>frontend/dist</code> is missing). Build it once, then reload:</p>
<pre style="background:#eee; padding:1rem">cd frontend
npm install
npm run build</pre>
<p>Or run the development server (<code>npm run dev</code> in <code>frontend/</code>) and open
<a href="http://localhost:5173">http://localhost:5173</a>.</p>
<p>The API is up: <a href="/api/info">/api/info</a> · <a href="/api/jutsu">/api/jutsu</a> ·
<a href="/api/credits">/api/credits</a></p>
</body></html>"""


# ------------------------------------------------------------------ binary framing
def pack(header, payload=b""):
    """[uint32 BE N][N bytes UTF-8 JSON header][payload]: the framing of both directions."""
    head = json.dumps(header, separators=(",", ":")).encode("utf-8")
    return HEADER_LEN.pack(len(head)) + head + payload


def unpack(data):
    """(header dict, payload bytes). Raises ValueError on a malformed message."""
    if len(data) < HEADER_LEN.size:
        raise ValueError("message shorter than its length prefix")
    (n,) = HEADER_LEN.unpack_from(data)
    if n > len(data) - HEADER_LEN.size:
        raise ValueError("header length larger than the message")
    try:
        header = json.loads(data[HEADER_LEN.size:HEADER_LEN.size + n].decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise ValueError(f"header is not JSON: {e}") from None
    if not isinstance(header, dict):
        raise ValueError("header is not a JSON object")
    return header, data[HEADER_LEN.size + n:]


def _number(value):
    """A JSON number (not bool) as float, else None."""
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _clean(text):
    """Card texts use double spaces as visual gaps; the web app gets single spaces."""
    return " ".join(text.split())


# ------------------------------------------------------------------ what this server can do
class Capabilities:
    def __init__(self, classifier="auto"):
        self.yolox = config.SEAL_MODEL_PATH.exists()
        if self.yolox:
            try:
                import onnxruntime  # noqa: F401
            except ImportError:
                self.yolox = False
        if classifier == "auto":
            classifier = None
            if GestureClassifier.exists():
                try:
                    classifier = GestureClassifier()
                except Exception as e:                    # e.g. trained with another feature version
                    print(f"landmark model off: {e}")
        self.classifier = classifier
        self.landmark_model = classifier is not None
        if self.yolox:                                     # same ownership rules as SignFusion
            signs = set(YOLOX_SIGNS) | (set(config.LANDMARK_SIGNS) if self.landmark_model else set())
        elif self.landmark_model:
            signs = set(classifier.labels) - {"idle"}
        else:
            signs = set()
        self.recognizable = [s for s in config.GESTURES if s in signs]
        self.jutsu_available = {j: all(s in signs for s in spec["sequence"]) for j, spec in config.JUTSU.items()}

    def recognizer(self, sign):
        if sign in YOLOX_SIGNS and (self.yolox or not self.landmark_model):
            return "yolox"
        return "landmarks"


def _sign_art(sid):
    """URL of a sign's drawing: the bold version made for the web app's sequence cards
    (tools/build_bold_signs.py), or the original thin line art when it is not there."""
    folder = "signs_bold" if (config.REFERENCES_DIR / "_sources" / "signs_bold" / f"{sid}.png").is_file() else "signs"
    return f"/references/_sources/{folder}/{sid}.png"


def build_catalog(caps):
    signs = {}
    for sid, s in catalog.SIGNS.items():
        signs[sid] = {"id": sid, "name": s["name"], "jp": s["jp"], "hands": s["hands"], "official": s["official"],
                      "cues": [_clean(c) for c in s["cues"]], "art": _sign_art(sid),
                      "recognizer": caps.recognizer(sid), "recognizable": sid in caps.recognizable}
    jutsu = []
    for jid, spec in config.JUTSU.items():
        card = catalog.JUTSU[jid]
        missing = [s for s in spec["sequence"] if s not in caps.recognizable]
        jutsu.append({
            "id": jid, "title": card["title"], "name": card["name"], "kanji": card["kanji"],
            "official": spec["official"], "tag": _clean(card["tag"]), "provenance": _clean(card["status"]),
            "description": card["description"], "effect": spec["effect"],
            "steps": [{"step": i + 1, "sign": s, "card": f"/references/{jid}/step_{i + 1}.png"}
                      for i, s in enumerate(spec["sequence"])],
            "sequence_image": f"/references/{jid}/sequence_reference.png",
            "available": not missing, "missing_signs": missing,
        })
    return {"signs": signs, "jutsu": jutsu}


class Slots:
    """Counts the open sessions (thread-safe: a slot is freed from the session's own thread)."""

    def __init__(self, maximum):
        self.max = maximum
        self.active = 0
        self._lock = threading.Lock()

    def acquire(self):
        with self._lock:
            if self.active >= self.max:
                return False
            self.active += 1
            return True

    def release(self):
        with self._lock:
            self.active = max(0, self.active - 1)


# ------------------------------------------------------------------ one browser session
class _Gone(Exception):
    """The client disconnected while we were sending."""


class Session:
    def __init__(self, ws, server):
        self.ws = ws
        self.server = server
        self.id = secrets.token_hex(3)
        self.mode = {"mode": "free", "jutsu": None}
        self.engine = None
        self.tracker = EventTracker(config.JUTSU)
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix=f"session-{self.id}")
        self.queue = deque()               # waiting work, in arrival order: (kind, ...)
        self.wakeup = asyncio.Event()
        self.send_lock = asyncio.Lock()
        self.seq, self.fps, self._last_done = 0, 0.0, None

    # ---------------------------------------------------------------- sending
    async def _send(self, text=None, data=None):
        try:
            async with self.send_lock:
                if data is not None:
                    await self.ws.send_bytes(data)
                else:
                    await self.ws.send_text(text)
        except Exception as e:                     # closed socket: the session is over
            raise _Gone() from e

    async def send_json(self, message):
        await self._send(text=json.dumps(message, separators=(",", ":"), ensure_ascii=False))

    async def send_error(self, code, message, fatal=False):
        await self.send_json({"type": "error", "code": code, "message": message, "fatal": fatal})

    # ---------------------------------------------------------------- lifetime
    async def run(self):
        loop = asyncio.get_running_loop()
        tasks = ()
        try:
            try:
                await loop.run_in_executor(self.executor, self._create_engine)
            except Exception as e:
                print(f"session {self.id}: engine failed to start: {e!r}")
                await self.send_error("internal", f"the AI engine failed to start: {e}", fatal=True)
                await self.ws.close(code=1011)
                return
            await self.send_json({"type": "hello", "protocol": config.PROTOCOL_VERSION, "session": self.id,
                                  "info": self.server.info(), "mode": dict(self.mode)})
            print(f"session {self.id}: connected ({self.server.slots.active}/{self.server.slots.max})")
            reader, worker = asyncio.create_task(self._reader()), asyncio.create_task(self._worker())
            tasks = (reader, worker)
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                error = task.exception()
                if error is not None and not isinstance(error, _Gone):
                    print(f"session {self.id}: crashed: {error!r}")
                    try:
                        await self.send_error("internal", f"the session crashed: {error!r}", fatal=True)
                        await self.ws.close(code=1011)
                    except Exception:
                        pass
                    break
        except _Gone:
            pass
        finally:
            # No await in here: when the server cancels this task, the cleanup must still happen.
            for task in tasks:
                task.cancel()
            closing = self.executor.submit(self._close_engine)     # after the frame in progress
            closing.add_done_callback(lambda _: self.server.slots.release())
            self.server.track_closing(closing)
            self.executor.shutdown(wait=False)

    def _create_engine(self):                  # session thread
        self.engine = Engine(classifier=self.server.caps.classifier, yolox=self.server.caps.yolox)
        self.engine.warm_up()                  # before `hello`: the first camera frame meets warm models

    def _close_engine(self):                   # session thread
        try:
            if self.engine is not None:
                self.engine.close()
        except Exception as e:
            print(f"session {self.id}: error while closing: {e!r}")
        print(f"session {self.id}: closed")

    # ---------------------------------------------------------------- incoming
    async def _reader(self):
        while True:
            message = await self.ws.receive()
            if message["type"] == "websocket.disconnect":
                return
            if message.get("bytes") is not None:
                self._on_frame(message["bytes"])
            elif message.get("text") is not None:
                await self._on_text(message["text"])

    def _enqueue(self, item):
        self.queue.append(item)
        frames = [i for i, it in enumerate(self.queue) if it[0] == "frame"]
        for i in frames[:max(0, len(frames) - config.FRAME_MAX_IN_FLIGHT)]:
            self.queue[i] = ("skip", self.queue[i][1])          # oldest waiting frames: answered "skipped"
        self.wakeup.set()

    def _on_frame(self, data):
        t = None
        try:
            if len(data) > config.FRAME_MAX_BYTES:
                raise ValueError(f"frame message too big ({len(data)} bytes, max {config.FRAME_MAX_BYTES})")
            header, jpeg = unpack(data)
            t = _number(header.get("t"))
            if jpeg[:3] != b"\xff\xd8\xff":
                raise ValueError("the image is not a JPEG")
        except ValueError as e:
            self._enqueue(("bad", t, str(e)))
            return
        self._enqueue(("frame", t, jpeg))

    async def _on_text(self, text):
        try:
            message = json.loads(text)
            kind = message.get("type") if isinstance(message, dict) else None
        except json.JSONDecodeError:
            kind = message = None
        if kind == "ping":
            await self.send_json({"type": "pong", "t": message.get("t")})
        elif kind == "reset":
            self._enqueue(("call", self._reset))
        elif kind == "mode" and message.get("mode") == "free":
            self._enqueue(("call", lambda: self._set_mode(None)))
        elif kind == "mode" and message.get("mode") == "practice" and message.get("jutsu") in config.JUTSU:
            jutsu = message["jutsu"]
            self._enqueue(("call", lambda: self._set_mode(jutsu)))
        elif kind == "options" and isinstance(message.get("landmarks", False), bool):
            if "landmarks" in message:
                show = message["landmarks"]
                self._enqueue(("call", lambda: self._set_landmarks(show)))
        else:
            what = "not a JSON object" if message is None else f"unknown or invalid message: {text[:200]}"
            await self.send_error("bad_message", what)

    # ---------------------------------------------------------------- session thread: control
    def _set_mode(self, jutsu):
        if jutsu is None:
            chosen, self.mode = config.JUTSU, {"mode": "free", "jutsu": None}
        else:
            chosen, self.mode = {jutsu: config.JUTSU[jutsu]}, {"mode": "practice", "jutsu": jutsu}
        self.engine.set_jutsu(chosen, practice=jutsu is not None)
        self.tracker.set_mode(chosen, practice=jutsu)
        return {"type": "mode", **self.mode}

    def _reset(self):
        self.engine.reset_sequence()
        self.tracker.reset()

    def _set_landmarks(self, show):
        self.engine.draw_landmarks = show

    # ---------------------------------------------------------------- processing
    async def _worker(self):
        loop = asyncio.get_running_loop()
        while True:
            while not self.queue:
                self.wakeup.clear()
                await self.wakeup.wait()
            kind, *args = self.queue.popleft()
            if kind == "skip":
                await self.send_json({"type": "skipped", "client_t": args[0]})
            elif kind == "bad":
                await self._bad_frame(*args)
            elif kind == "frame":
                data, problem = await loop.run_in_executor(self.executor, self._process, *args)
                if problem:
                    await self._bad_frame(args[0], problem)
                else:
                    await self._send(data=data)
            elif kind == "call":
                reply = await loop.run_in_executor(self.executor, args[0])
                if reply:
                    await self.send_json(reply)

    async def _bad_frame(self, t, problem):
        await self.send_error("bad_frame", problem)
        await self.send_json({"type": "skipped", "client_t": t})   # keeps the client's in-flight count right

    def _process(self, client_t, jpeg):         # session thread
        start = time.perf_counter()
        frame = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            return None, "the JPEG image could not be decoded"
        h, w = frame.shape[:2]
        scale = min(1.0, config.FRAME_MAX_WIDTH / w, config.FRAME_MAX_HEIGHT / h)
        if scale < 1.0:
            frame = cv2.resize(frame, (max(1, round(w * scale)), max(1, round(h * scale))),
                               interpolation=cv2.INTER_AREA)
        if min(frame.shape[:2]) < config.FRAME_MIN_SIZE:
            return None, f"frame too small ({w}x{h})"
        if config.MIRROR:
            frame = cv2.flip(frame, 1)          # selfie view, like the desktop camera
        decode_ms = (time.perf_counter() - start) * 1000

        result = self.engine.process(frame, time.perf_counter())
        effect = result.effect
        view = FrameView(
            now=result.now,
            confirmed=result.state.confirmed if result.state else None,
            repeat=bool(result.state and result.state.repeat),
            fired=result.state.jutsu if result.state and result.state.effect else None,
            fired_effect=result.state.effect if result.state else None,
            progress=result.progress,
            timed_out=result.state.timed_out if result.state else {},
            timeout=result.state.timeout if result.state else None,
            leader=result.state.leader if result.state else None,
            fired_stages=effect.stage_plan if effect is not None and result.state and result.state.effect else None,
            effect=None if effect is None else EffectView(
                key=result.effect_id if result.effect_id is not None else -id(effect), name=effect.name,
                stopping=effect.stop_at is not None,
                clones=int(effect.drawn) if effect.name == "shadow_clone" else None,
                jutsu=result.effect_jutsu, phase=result.effect_phase, staged=bool(effect.stages)))
        events = self.tracker.update(view)

        t = time.perf_counter()
        ok, encoded = cv2.imencode(".jpg", result.frame, OUTPUT_JPEG)
        if not ok:
            raise RuntimeError("JPEG encoding failed")
        done = time.perf_counter()
        timings = {"decode": decode_ms, **result.timings, "encode": (done - t) * 1000,
                   "total": (done - start) * 1000}

        self.seq += 1
        if self._last_done is not None:
            rate = 1.0 / max(done - self._last_done, 1e-3)
            self.fps = rate if self.seq == 2 else 0.9 * self.fps + 0.1 * rate
        self._last_done = done
        header = self._frame_state(result, events, client_t, timings, view)
        return pack(header, encoded.tobytes()), None

    def _frame_state(self, r, events, client_t, timings, view):
        stab = r.stabilizer
        candidate = latched = None
        hold = 0.0
        if stab is not None:
            if stab.candidate is not None and stab.candidate != stab.latched:
                candidate = stab.labels[stab.candidate]
            if stab.latched is not None:
                latched = stab.labels[stab.latched]
            hold = float(stab.hold_progress(r.now))
        if r.fused is not None:
            sign = {"name": r.fused.sign, "source": r.fused.source, "score": round(float(r.fused.score), 3)}
        else:
            sign = {"name": "idle", "source": "none", "score": 0.0}
        effect = None
        if r.effect is not None:
            clone = r.effect.name == "shadow_clone"
            left = None if r.effect_phase_left is None else round(float(r.effect_phase_left), 2)
            effect = {"name": r.effect.name, "jutsu": r.effect_jutsu,
                      "age": round(max(0.0, r.now - r.effect.activated_at), 2),
                      "stopping": view.effect.stopping, "clones": view.effect.clones,
                      "crowded": bool(getattr(r.effect, "crowded", False)) if clone else None,
                      "phase": r.effect_phase, "phase_left": left}
        h, w = r.frame.shape[:2]
        return {
            "type": "frame", "seq": self.seq, "client_t": client_t, "width": w, "height": h,
            "fps": round(self.fps, 1), "timings": {k: round(float(v), 1) for k, v in timings.items()},
            "hands": len(r.hands), "sign": sign, "candidate": candidate, "hold": round(hold, 2),
            "latched": latched, "history": list(r.history), "progress": dict(r.progress),
            "time_left": None if r.time_left is None else round(float(r.time_left), 2),
            "time_left_per_jutsu": {k: round(float(v), 2) for k, v in (r.time_left_per_jutsu or {}).items()},
            "ready": bool(r.ready),
            "cooldown": round(float(r.cooldown), 2), "mode": dict(self.mode), "effect": effect, "events": events,
        }


# ------------------------------------------------------------------ the app
class Server:
    def __init__(self, max_sessions=config.SERVER_MAX_SESSIONS, classifier="auto"):
        self.caps = Capabilities(classifier)
        self.slots = Slots(max_sessions)
        self.catalog = build_catalog(self.caps)
        self._closing = set()           # cleanups of ended sessions still running (futures)
        self._closing_lock = threading.Lock()

    def track_closing(self, future):
        with self._closing_lock:
            self._closing.add(future)

        def forget(done):
            with self._closing_lock:
                self._closing.discard(done)
        future.add_done_callback(forget)

    def wait_closed(self, timeout=10.0):
        """Wait for ended sessions to release their models (server shutdown: once Python is
        exiting, MediaPipe cannot close its models any more)."""
        with self._closing_lock:
            pending = list(self._closing)
        concurrent.futures.wait(pending, timeout=timeout)

    def info(self):
        return {
            "name": "SHINOBI AI", "version": config.APP_VERSION, "protocol": config.PROTOCOL_VERSION,
            "yolox": self.caps.yolox, "landmark_model": self.caps.landmark_model,
            "recognizable": list(self.caps.recognizable), "jutsu_available": dict(self.caps.jutsu_available),
            "sessions": {"active": self.slots.active, "max": self.slots.max},
            "frame": {"max_width": config.FRAME_MAX_WIDTH, "max_height": config.FRAME_MAX_HEIGHT,
                      "jpeg_quality": config.FRAME_JPEG_QUALITY / 100, "max_in_flight": config.FRAME_MAX_IN_FLIGHT},
            "mirror": config.MIRROR,
            "sequence_max_gap": config.SEQUENCE_MAX_GAP,
            "activation": {"charge": dict(config.ACTIVATION_CHARGE), "voice_default": config.VOICE_DEFAULT,
                           "voice_gap": config.VOICE_GAP},
        }


def create_app(max_sessions=config.SERVER_MAX_SESSIONS, classifier="auto"):
    server = Server(max_sessions, classifier)

    @contextlib.asynccontextmanager
    async def lifespan(app):
        yield
        await asyncio.to_thread(server.wait_closed)

    app = FastAPI(title="SHINOBI AI", version=config.APP_VERSION, lifespan=lifespan)
    app.state.server = server

    @app.get("/api/info")
    def api_info():
        return server.info()

    @app.get("/api/jutsu")
    def api_jutsu():
        return server.catalog

    @app.get("/api/credits")
    def api_credits():
        return {"sections": catalog.CREDITS}

    @app.get("/api/voices")
    def api_voices():
        """Character voice clips installed in assets/audio/voice (licensed files; none are bundled)."""
        return {"voices": catalog.voice_clips()}

    @app.websocket("/ws")
    async def ws_session(ws: WebSocket):
        await ws.accept()
        if not server.slots.acquire():
            await ws.send_text(json.dumps({"type": "error", "code": "busy", "fatal": True,
                                           "message": f"All {server.slots.max} sessions are in use. Try again later."}))
            await ws.close(code=1013)
            return
        await Session(ws, server).run()             # frees the slot when it ends

    app.mount("/references", StaticFiles(directory=config.REFERENCES_DIR), name="references")
    app.mount("/audio", StaticFiles(directory=config.AUDIO_DIR), name="audio")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        """The built React app; any other path is a client-side route (SPA fallback to index.html)."""
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="unknown API path")
        dist = config.FRONTEND_DIST.resolve()
        index = dist / "index.html"
        if not index.is_file():
            return HTMLResponse(BUILD_HELP)
        if path:
            file = (dist / path).resolve()
            if file.is_file() and file.is_relative_to(dist):
                return FileResponse(file)
        return FileResponse(index)

    return app


def main(argv=None):
    parser = argparse.ArgumentParser(description="SHINOBI AI web server (docs/13_web_server.md)")
    parser.add_argument("--host", default=config.SERVER_HOST, help="0.0.0.0 = reachable from other devices")
    parser.add_argument("--port", type=int, default=config.SERVER_PORT)
    parser.add_argument("--max-sessions", type=int, default=config.SERVER_MAX_SESSIONS,
                        help="browser sessions at the same time (each one runs its own models)")
    parser.add_argument("--ssl-certfile", help="HTTPS certificate (phones only allow the camera over HTTPS)")
    parser.add_argument("--ssl-keyfile", help="private key of that certificate")
    args = parser.parse_args(argv)
    if bool(args.ssl_certfile) != bool(args.ssl_keyfile):
        parser.error("--ssl-certfile and --ssl-keyfile go together")
    if args.max_sessions < 1:
        parser.error("--max-sessions must be at least 1")

    import uvicorn
    app = create_app(args.max_sessions)
    scheme = "https" if args.ssl_certfile else "http"
    shown = "localhost" if args.host in ("127.0.0.1", "0.0.0.0") else args.host
    print(f"SHINOBI AI: {scheme}://{shown}:{args.port}  (max {args.max_sessions} sessions)")
    uvicorn.run(app, host=args.host, port=args.port, ssl_certfile=args.ssl_certfile,
                ssl_keyfile=args.ssl_keyfile, log_level="info")


if __name__ == "__main__":
    main()

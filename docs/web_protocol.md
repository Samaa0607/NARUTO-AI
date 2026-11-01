# SHINOBI AI web app: backend ⇄ frontend contract (protocol v1)

This is the single source of truth for how the React web app (`frontend/`) talks to the Python
AI backend (`shinobi/server.py`). Both sides implement exactly this. If one side needs something
that is not here, change this file first, then both sides.

* Every recognition result and every jutsu activation comes from the real Python pipeline
  (`shinobi/engine.py`: MediaPipe hands, YOLOX seals, landmark classifier, `SignFusion`,
  `ActionController`, effects). The frontend never decides that a sign or a jutsu happened.
* JSON keys are `snake_case` on both sides (the TypeScript types mirror them as-is).
* Sign ids: `config.GESTURES` (`idle`, `ram`, `snake`, `tiger`, `dog`, `monkey`, `boar`, `horse`,
  `clone_seal`, `rasengan_palm`). Jutsu ids: keys of `config.JUTSU` (`fire_style`, `chidori`,
  `shadow_clone`, `rasengan`). Effect ids: `fire`, `chidori`, `shadow_clone`, `rasengan`.

---

## 1. Processes and URLs

| what | where |
|---|---|
| Backend | `python -m shinobi.server` (FastAPI + uvicorn), default `http://127.0.0.1:8000` |
| Built frontend | served by the backend at `/` (from `frontend/dist`, SPA fallback to `index.html`) |
| Frontend dev server | `npm run dev` in `frontend/` (Vite, port 5173), proxies `/api`, `/ws`, `/references`, `/audio` to the backend |
| Reference images | `/references/...` → the `gesture_references/` folder (read-only) |
| Sound files | `/audio/...` → the `assets/audio/` folder (read-only) |

Browsers only allow the camera on `localhost` or HTTPS. For phones/tablets on the LAN the server
must run with `--host 0.0.0.0 --ssl-certfile ... --ssl-keyfile ...`.

---

## 2. REST endpoints

### `GET /api/info` → `ServerInfo`

```json
{
  "name": "SHINOBI AI",
  "version": "0.1.0",
  "protocol": 1,
  "yolox": true,
  "landmark_model": false,
  "recognizable": ["ram", "snake", "tiger", "dog", "monkey", "boar", "horse"],
  "jutsu_available": {"fire_style": true, "chidori": true, "shadow_clone": false, "rasengan": false},
  "sessions": {"active": 0, "max": 2},
  "frame": {"max_width": 1280, "max_height": 1280, "jpeg_quality": 0.8, "max_in_flight": 2},
  "mirror": true,
  "sequence_max_gap": 7.0,
  "activation": {"charge": {"fire_style": 1.2, "chidori": 1.2, "shadow_clone": 1.2, "rasengan": 1.2},
                 "voice_default": 0.4, "voice_gap": 0.05}
}
```

* `yolox`: the official-seal detector (`models/yolox_nano.onnx` + onnxruntime) is loaded.
* `landmark_model`: a trained landmark classifier exists (`models/gesture_model.joblib`).
* `recognizable`: the signs this server can recognise right now (YOLOX signs if `yolox`,
  plus `config.LANDMARK_SIGNS` if `landmark_model`; all signs from the landmark model only if YOLOX
  is off, as in `SignFusion`).
* `jutsu_available[j]`: every sign of jutsu `j` is in `recognizable`.
* `sequence_max_gap`: free mode (Live) only: seconds allowed from one confirmed step to the next (`config.SEQUENCE_MAX_GAP`, 7.0); the full length of the `time_left` countdown. A limit, not a wait. Practice mode has no time limit at all (`time_left` is always null there).
* `mirror`: the server mirrors incoming frames (selfie view, `config.MIRROR`). Clients send the
  camera image as the camera delivers it (NOT mirrored) and show the returned frames as they are.
* `frame.jpeg_quality`: the quality the client should encode its camera frames with. The frames the
  server sends back (effects drawn) use `config.OUTPUT_JPEG_QUALITY` (90) at full colour resolution
  (4:4:4), so thin coloured lines (Chidori) stay sharp.
* `activation`: how a fired jutsu's build-up is timed (3.6, `jutsu` / `effect_phase`): `charge`
  seconds per jutsu (`config.ACTIVATION_CHARGE`); the `voice` and `name` stages last as long as the
  installed voice clip + `voice_gap`, or `voice_default` without one. The exact plan of each
  activation comes with its `jutsu` event.

### `GET /api/jutsu` → `Catalog`

```json
{
  "signs": {
    "tiger": {
      "id": "tiger", "name": "TIGER", "jp": "Tora · 寅", "hands": 2, "official": true,
      "cues": ["Palms pressed together", "..."],
      "art": "/references/_sources/signs/tiger.png",
      "recognizer": "yolox",
      "recognizable": true
    }
  },
  "jutsu": [
    {
      "id": "fire_style",
      "title": "FIRE STYLE",
      "name": "Great Fireball Technique",
      "kanji": "火遁・豪火球の術",
      "official": true,
      "tag": "Great Fireball Technique · OFFICIAL SEQUENCE (last 4 of 6 seals)",
      "provenance": "Official seals: Snake → Ram → [ Monkey → Boar → Horse → Tiger ]. ...",
      "description": "short original text about what the effect does in SHINOBI AI",
      "effect": "fire",
      "steps": [
        {"step": 1, "sign": "monkey", "card": "/references/fire_style/step_1.png"},
        {"step": 2, "sign": "boar", "card": "/references/fire_style/step_2.png"},
        {"step": 3, "sign": "horse", "card": "/references/fire_style/step_3.png"},
        {"step": 4, "sign": "tiger", "card": "/references/fire_style/step_4.png"}
      ],
      "sequence_image": "/references/fire_style/sequence_reference.png",
      "available": true,
      "missing_signs": []
    }
  ]
}
```

* The order of `steps` is `config.JUTSU[id]["sequence"]`. `official` is `config.JUTSU[id]["official"]`.
  Custom (non-official) sequences must be shown as custom in the UI.
* `name`, `jp`, `cues`, `title`, `tag`, `provenance` are the same texts as on the reference cards
  (`tools/build_gesture_references.py`, moved to `shinobi/catalog.py` so both use one copy).
* Jutsu order in the list: `fire_style`, `chidori`, `shadow_clone`, `rasengan` (config order).

> **Server note (implementation, 2026-10-31).** The cards use double spaces as visual gaps (e.g.
> `"Great Fireball Technique  ·  OFFICIAL ..."`); the API sends the same texts with runs of spaces
> collapsed to one. `provenance` is the card's status line. `recognizer` is `"landmarks"` for
> `clone_seal` / `rasengan_palm`, and also for the official seals when YOLOX is off but a landmark
> model exists (they are then recognised by the landmark backup); otherwise `"yolox"`.

### `GET /api/credits` → `Credits`

```json
{
  "sections": [
    {"title": "Hand-seal illustrations",
     "items": [{"text": "Line art by Schlum, Wikimedia Commons ...", "url": "https://...",
                "license": "CC BY-SA 4.0", "license_url": "https://creativecommons.org/licenses/by-sa/4.0/"}]},
    {"title": "Sound effects", "items": [{"text": "...", "url": "...", "license": "...", "license_url": "..."}]},
    {"title": "Hand-seal detector model", "items": [{"text": "...", "url": "...", "license": "...", "license_url": "..."}]},
    {"title": "Disclaimer", "items": [{"text": "...", "url": null, "license": null, "license_url": null}]}
  ]
}
```

Every item is an object with exactly these four keys (`CreditItem`).

Built from `gesture_references/README.md` (line-art licence), `assets/audio/SOURCES.md` (credits
block: 3 CC BY sounds need attribution) and `models/THIRD_PARTY_YOLOX.md`. `url`, `license` and
`license_url` may be `null`.

### `GET /api/voices` → `Voices`

```json
{
  "voices": {
    "fire_style":   {"speaker": "Naruto", "activation": null, "name": null,
                     "seconds": {"activation": null, "name": null}},
    "chidori":      {"speaker": "Sasuke", "activation": null, "name": "/audio/voice/chidori/name.wav",
                     "seconds": {"activation": null, "name": 1.42}},
    "shadow_clone": {"speaker": "Naruto", "activation": null, "name": null,
                     "seconds": {"activation": null, "name": null}},
    "rasengan":     {"speaker": "Naruto", "activation": null, "name": null,
                     "seconds": {"activation": null, "name": null}}
  }
}
```

The character voice clips installed in `assets/audio/voice/<jutsu>/`: `activation.wav` = hand-sign /
activation call, `name.wav` = technique name. **PCM WAV only** (2026-11-01): the server reads each
clip's length (`seconds`, Python's `wave` module) to time the activation's `voice` and `name` stages
(3.6), so the build-up lasts exactly as long as the voice. A file that is not a readable PCM WAV is
listed as `null` (not used). None are bundled: only licensed recordings the user adds
(`assets/audio/voice/README.md`). The folder is read on every request (and when a jutsu fires); a
`null` clip is skipped by the web app, never replaced. The app plays the activation call when the
`jutsu` event arrives and the name when the `name` stage starts (`effect_phase`), with the music and
sound effects ducked meanwhile.

---

## 3. WebSocket `/ws` (one connection = one independent session)

Every connection gets its own engine: its own hand tracker, YOLOX worker, fusion, sequence state,
effects and cooldown. Two browser tabs never share recognition state.

### 3.1 Connecting

* Sessions full (`sessions.active == sessions.max`): the server sends
  `{"type": "error", "code": "busy", "message": "...", "fatal": true}` and closes with code 1013.
* Otherwise the server's first message is a text JSON:

```json
{"type": "hello", "protocol": 1, "session": "a1b2c3", "info": {"...": "ServerInfo"},
 "mode": {"mode": "free", "jutsu": null}}
```

### 3.2 Binary framing (both directions)

```
[ uint32 big-endian N ][ N bytes: UTF-8 JSON header ][ JPEG bytes ]
```

**Client → server (camera frame).** Header: `{"t": <number>}`, the client's own timestamp in ms
(`performance.now()`), echoed back so the client can measure round-trip latency. Image: the camera
frame as JPEG (quality `frame.jpeg_quality`), NOT mirrored, scaled down so that it fits in
`frame.max_width` x `frame.max_height` (keep the aspect ratio). The client keeps at most
`frame.max_in_flight` frames unanswered (send the next one when an answer arrives).

**Server → client (processed frame).** Header: a `FrameState` (below). Image: the processed frame
as JPEG: mirrored, with the active effect drawn by the Python effect code (Shadow Clone with its 10
clones, Rasengan, Chidori, Fire), plus hand landmarks if the `landmarks` option is on. No HUD text.

The server answers every frame it receives, in order. If more than `max_in_flight` frames are
waiting, it skips the oldest ones and sends `{"type": "skipped", "client_t": <t>}` (text) for each,
so the client's in-flight count stays right.

> **Server note (implementation, 2026-10-31).** "Waiting" = received, not started yet. Every answer
> (`frame` or `skipped`) is sent in the order the frames arrived, so a client can also match
> answers first-in first-out. A well-behaved client (at most `max_in_flight` unanswered) never gets
> `skipped` for this reason.

### 3.3 Client → server text messages

| message | meaning |
|---|---|
| `{"type": "mode", "mode": "free"}` | Live Demo: all four jutsu can fire; `SEQUENCE_MAX_GAP` seconds allowed between two confirmed steps |
| `{"type": "mode", "mode": "practice", "jutsu": "<jutsu_id>"}` | Practice: only this jutsu can fire, no time limit; wrong signs are reported against it (`wrong_sign`) and never reset it |
| `{"type": "reset"}` | forget every sequence in progress (Retry / Reset button): the only way, besides a mode change, a free-mode timeout or a fired jutsu, that `progress` goes back. The effect that is running keeps running |
| `{"type": "options", "landmarks": true}` | draw / hide the MediaPipe hand landmarks on the returned frames (default: false) |
| `{"type": "ping", "t": <number>}` | the server answers `{"type": "pong", "t": <same number>}` |

A mode change starts a fresh sequence state (new `ActionController` for those jutsu). The server
confirms every mode change with `{"type": "mode", "mode": "...", "jutsu": ...}`.

> **Server note (implementation, 2026-10-31).** `mode`, `reset` and `options` are applied in order
> with the frames: frames sent before them are still answered with the old settings, every answer
> after the `mode` confirmation uses the new mode. `ping` is answered at once (not queued behind
> frames). `reset` and `options` have no answer. An unknown or invalid message (e.g. practice with an
> unknown jutsu, `landmarks` not a boolean, not JSON) gets a non-fatal `bad_message` error.

### 3.4 Server → client text messages

`hello`, `mode` (confirmation), `pong`, `skipped`, and
`{"type": "error", "code": "busy" | "bad_frame" | "bad_message" | "internal", "message": "...", "fatal": false}`.
`fatal: true` means the server closes the connection next.

### 3.5 `FrameState` (header of every processed frame)

```json
{
  "type": "frame",
  "seq": 128,
  "client_t": 53211.4,
  "width": 1280, "height": 720,
  "fps": 10.4,
  "timings": {"decode": 6.1, "hands": 58.0, "model": 0.4, "yolox": 45.2, "seg": 0.0, "fx": 0.0,
              "encode": 7.9, "total": 81.0},
  "hands": 2,
  "sign": {"name": "tiger", "source": "yolox", "score": 0.93},
  "candidate": "tiger",
  "hold": 0.6,
  "latched": null,
  "history": ["monkey", "boar", "horse"],
  "progress": {"fire_style": 3, "chidori": 0, "shadow_clone": 0, "rasengan": 0},
  "time_left": 2.7,
  "time_left_per_jutsu": {"fire_style": 2.7},
  "cooldown": 0.0,
  "mode": {"mode": "free", "jutsu": null},
  "effect": null,
  "events": []
}
```

| field | meaning |
|---|---|
| `seq` | frames processed in this session so far (1, 2, ...) |
| `client_t` | the `t` of the client frame this answers |
| `fps` | the session's processing rate (smoothed; measured between processed frames, so it drops while the client sends nothing) |
| `timings` | milliseconds per stage of this frame (keys may be missing when a stage did not run) |
| `hands` | hands MediaPipe found in this frame |
| `sign` | this frame's fused decision (`SignFusion`): `name` is a sign id or `"idle"`, `source` is `"yolox"`, `"landmarks"`, `"landmarks-backup"` or `"none"`, `score` is that model's own score (0 for idle) |
| `candidate` | the sign the stabilizer is waiting on (held, not confirmed yet), or null |
| `hold` | 0..1, how far `candidate` is towards being confirmed |
| `latched` | the last confirmed sign while it is still being held, or null |
| `history` | the last confirmed signs (up to 4, oldest first, repeats shown once), right or wrong; emptied by a fired jutsu, a `reset`, a mode change, or when every sequence timed out |
| `progress` | per jutsu of the current mode: how many of its steps are done, in order (never the full length: a completed sequence fires and resets every sequence). It never goes down on a wrong sign; only a fired jutsu, `reset`, a mode change or (free mode) a timeout sets it back to 0 |
| `time_left` | free mode: seconds the jutsu furthest along (most steps; on a tie the one in progress the longest, i.e. its first step is the oldest) has left for its next sign before it starts over (`config.SEQUENCE_MAX_GAP`, counted from its last confirmed step or from the last wrong attempt at its next step, which gives that step the full time again; holding / repeating a sign never extends it). The clock is the time the AI could see the user: one processed frame adds at most `config.SEQUENCE_CLOCK_MAX_STEP` (0.4 s), so a stall (no frame processed) does not eat into the limit, or null when nothing is in progress. Practice mode: always null (no time limit) |
| `time_left_per_jutsu` | free mode: `{jutsu: seconds left}` for EVERY jutsu in progress, each on its own clock (same rule as `time_left`). Show the countdown of the jutsu on screen from here, not from `time_left` (that is the leader's, which may be another jutsu). Practice mode: `{}` |
| `ready` | false while the AI is still getting ready: the models are warmed up before `hello` (`Engine.warm_up`), then signs count only once `config.READY_FRAMES` frames in a row were processed in under `config.READY_MAX_MS`. Until then no sign is confirmed, so no step and no time limit can start. The client shows "AI is getting ready". Older servers do not send it (= ready). |
| `cooldown` | seconds before another jutsu may fire |
| `mode` | the current mode |
| `effect` | null, or `{"name": "<effect_id>", "jutsu": "<jutsu_id>" or null, "age": <s>, "stopping": <bool>, "clones": <int or null>, "crowded": <bool or null>, "phase": "voice" \| "charge" \| "name" \| "release", "phase_left": <s or null>}`. `age`: seconds since the jutsu fired (the activation, build-up included). `phase`: the activation stage (3.6): `voice`, `charge`, `name` while the chakra builds up (no main effect yet), then `release` (the main effect); an effect started by hand (desktop keys) is in `release` from the start. `phase_left`: seconds left in the current build-up stage, null in `release`. `stopping`: fading out (also a build-up that was stopped before its release). `clones`: Shadow Clone only, the number of clones visible in the returned frame. `crowded`: Shadow Clone only (`ShadowClone.crowded`): true when the frame has too little free room around the user for all 10 clones even after shrinking a row to 80 % (narrow/portrait frame, user very close): every clone is still drawn, but they overlap; the UI should say so (e.g. "Not enough room: step back or turn the device to landscape") instead of hiding anything |
| `events` | what happened in this frame, in order (below) |

### 3.6 Events (`FrameState.events`)

| event | when |
|---|---|
| `{"type": "sign", "sign": "<sign_id>"}` | the stabilizer confirmed a sign (once per held sign) |
| `{"type": "step", "jutsu": "<id>", "step": 2, "total": 4, "sign": "<sign_id>"}` | a confirmed sign advanced that jutsu's sequence; `step` = steps done now. One event per jutsu that advanced. Not sent for the last step: that one is the `jutsu` event |
| `{"type": "wrong_sign", "jutsu": "<id>", "step": 2, "expected": "<sign_id>", "got": "<sign_id>"}` | a confirmed sign is not the next sign of the sequence in progress. **Nothing is reset**: `step` (= steps done) stays done and the user tries `expected` again, as often as needed. Free mode: reported for the jutsu furthest along (most steps, at least 1; on a tie the most recent step). Practice mode: reported for the practised jutsu whenever the confirmed sign is not its next sign, also at step 0. Never for a repeat |
| `{"type": "sequence_failed", "reason": "timeout", "jutsu": "<id>", "step": 2, "expected": "<sign_id>", "got": null}` | free mode only: more than `SEQUENCE_MAX_GAP` seconds since that jutsu's last confirmed step (or, for the jutsu furthest along, its last wrong attempt), so it started over at step 0. Reported for the jutsu that was furthest along. Never in practice mode (no time limit). `reason` is always `"timeout"` (wrong signs are `wrong_sign` events) |
| `{"type": "jutsu", "jutsu": "<id>", "effect": "<effect_id>", "stages": {"voice": 0.4, "charge": 1.2, "name": 0.4}}` | the full sequence was validated by `ActionController`. Its activation starts in this frame with the `voice` stage of its build-up; `stages` = the seconds each build-up stage will last (`voice` / `name`: the installed voice clip + gap, or 0.4 s without one; `charge`: `config.ACTIVATION_CHARGE`). The main effect starts after the build-up (`effect_phase` `release`) |
| `{"type": "effect_phase", "effect": "<effect_id>", "jutsu": "<id>", "phase": "charge"}` | the activation entered its next stage: `"charge"` (chakra charging), `"name"` (the jutsu's name is called), `"release"` (the main effect starts: release / impact sounds). Once each, in that order; a stage that a slow frame skipped is still reported (all of them, in order, in the frame that saw the later one). Only for activations with a build-up (a fired jutsu), never for effects started by hand |
| `{"type": "effect_stopping", "effect": "<effect_id>"}` | the effect started fading out (its time is up; a build-up stopped before its release fades too) |
| `{"type": "effect_end", "effect": "<effect_id>"}` | the effect is gone (also sent for the old effect when a new jutsu replaces it) |
| `{"type": "clones", "count": 3}` | Shadow Clone: more clones became visible in this frame (`count` = visible now). Used to time the smoke-poof sounds |

The frontend plays sounds and UI animations on these events (and on `FrameState` changes), never
on its own guesses.

> **Server notes (implementation, `shinobi/events.py`, 2026-10-31).**
> * **Sequence rules (2026-10-31, `SequenceMatcher`).** Every jutsu keeps its own steps done and the
>   time of its last confirmed step. A confirmed sign advances every jutsu whose next sign it is; a
>   sign that is not a jutsu's next sign leaves it where it is (a wrong sign never resets anything,
>   in either mode). A completed sequence fires (longest sequence first, then config order) and
>   resets every sequence, so one performance never fires twice or starts another jutsu. Free mode:
>   a jutsu whose last confirmed step is more than `SEQUENCE_MAX_GAP` old starts over. Practice: no
>   time limit.
> * **A wrong attempt restarts the leader's clock (2026-11-01, `SequenceMatcher.push`).** In free mode
>   a new sign that advances none of the jutsu furthest along (the one that gets the `wrong_sign`,
>   and any other run level with it) gives their next step the full `SEQUENCE_MAX_GAP` again, so a
>   leftover run tied with the real one never takes the time away from it; a mistake never costs the steps done;
>   only 7 s without a new sign does. Not when the sign brings another jutsu level with it (the user
>   may be switching: both keep their own clocks), and never for a repeat. `time_left` then goes back
>   up, and the countdown on the card follows it.
> * Order inside one frame: `sequence_failed`/timeout, `sign`, `wrong_sign`, `step` (config order of
>   the jutsu), `effect_end` (of the replaced or faded effect), `jutsu`, `effect_phase`,
>   `effect_stopping`, `clones`.
> * **Activation stages (2026-11-01, `effects/base.py`).** A fired jutsu builds up first: `voice`
>   (the activation call; as long as `assets/audio/voice/<jutsu>/activation.wav` + 0.05 s, else 0.4 s),
>   `charge` (`config.ACTIVATION_CHARGE`, 1.2 s), `name` (as long as `name.wav` + 0.05 s, else 0.4 s);
>   the returned frames show the chakra gathering (Rasengan: streaks spiralling into the palm and a
>   small sphere; Chidori: crackles and sparks at the hand; Fire Style: embers and a heat glow in front
>   of the hand; Shadow Clone: an aura around the user and smoke wisps). Then `release`: the main
>   effect, timed from that moment (Shadow Clone: the clones pop in from then on, after the name).
>   The stage lengths are fixed when the jutsu fires (in the `jutsu` event's `stages`).
> * **Hand effects outlive a lost hand (2026-11-01).** Fire Style, Chidori and Rasengan no longer end
>   when MediaPipe loses the hand (two-hand seals often hide it): they stay at the hand's last place
>   and play their whole `EFFECT_DURATION`, then `effect_stopping` / `effect_end`
>   (`config.HAND_EFFECT_MIN_SECONDS` can shorten that).
> * **Repeat (`SequenceMatcher.push`).** The same sign confirmed again is a repeat, not a new step: a
>   held seal is re-confirmed whenever the recogniser drops out for a moment (one missed YOLOX result
>   is enough). A repeat gets its `sign` event and nothing else: never a `step` and never a
>   `wrong_sign` (a held wrong sign is warned about once), in free and practice mode. It does NOT
>   refresh any clock: holding or repeating a sign never extends the time (only a new attempt does). The same sign is a new step again when it is some jutsu's next sign
>   (it started over after a timeout, a `reset` or an activation). `history` does not show a repeat
>   twice. (A config with the same sign twice in a row is refused.)
> * One sign can be wrong for the jutsu furthest along and still advance another one (e.g. Snake
>   while Fire Style waits for Horse: Chidori starts): then the `wrong_sign` is followed by a `step`
>   for that jutsu.
> * A sign that completes a jutsu never gets a `wrong_sign`.
> * `timeout` (free mode only) is sent in the first frame after the time ran out (or together with
>   the next sign, before its `sign` event), for the jutsu that was furthest along. A `reset` or a
>   mode change forgets the sequences silently (no `timeout`).
> * `effect_stopping` always comes before `effect_end` of the same activation (both in one frame if
>   the fade-out happened between two frames). A replaced effect gets only `effect_end`.
> * `clones` is sent when more clones are visible than ever before in this activation (a clone that
>   flickers out and back does not repeat it), so it matches the smoke puffs.
> * If the frames change size during a Shadow Clone (camera switched, phone turned), that effect
>   ends (`effect_end`): its clone layer is one frame behind and cannot be blended onto the new size.
>   Hand effects just continue.
> * A full sequence completed during the cooldown is ignored by `ActionController` (every sequence
>   reset, no jutsu): only its `sign` event is sent. In practice it cannot happen (4 signs take > 1.5 s).

---

## 4. Error handling expectations

* Client: show the connection state (connecting / connected / reconnecting / offline / busy),
  reconnect with backoff, and never show recognition or activations while disconnected.
* Server: a bad frame (not a JPEG, too big) gives a non-fatal `bad_frame` error and is skipped. A
  crash inside one session closes only that session (`internal`, fatal) and frees its slot.

> **Server note (implementation, 2026-10-31).** "Skipped" is literal: a bad frame is answered with
> the `bad_frame` error followed by `{"type": "skipped", "client_t": <t>}`, so the in-flight count
> stays right (`client_t` is `null` when the header itself could not be read). Bad = message longer
> than 4 MiB, malformed header, image not starting with the JPEG signature, JPEG that does not decode,
> or a frame smaller than 32 px (after scaling). A crash closes the socket with code 1011, `busy`
> with 1013. A session's slot is freed once its models are released (a fraction of a second after
> the socket closes).
* Closing the socket ends the session and releases its threads and models.

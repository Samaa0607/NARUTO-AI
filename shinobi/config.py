"""Central configuration: every path, threshold and tunable lives here."""

from pathlib import Path

# ---------------------------------------------------------------- paths
ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models"
DATA_DIR = ROOT / "data"
LANDMARKS_DIR = DATA_DIR / "landmarks"
VIDEOS_DIR = DATA_DIR / "videos"

HAND_MODEL_PATH = MODELS_DIR / "hand_landmarker.task"
SEGMENTER_MODEL_PATH = MODELS_DIR / "selfie_segmenter.tflite"
GESTURE_MODEL_PATH = MODELS_DIR / "gesture_model.joblib"

# ---------------------------------------------------------------- camera
CAMERA_INDEX = None   # None = use the first camera that shows a real (non-black) picture
CAMERA_WIDTH = 1280
CAMERA_HEIGHT = 720
MIRROR = True  # selfie view: what you see behaves like a mirror

# ---------------------------------------------------------------- hand tracking
MAX_HANDS = 2
MIN_DETECTION_CONFIDENCE = 0.5
MIN_PRESENCE_CONFIDENCE = 0.5
MIN_TRACKING_CONFIDENCE = 0.5

# ---------------------------------------------------------------- gestures
# The signs used by the jutsu sequences (see gesture_references/ for pictures and sources).
# Index 0 must be "idle". Order matters: it is saved with the trained model.
GESTURES = ["idle", "ram", "snake", "tiger", "dog", "monkey", "boar", "horse", "clone_seal", "rasengan_palm"]
GESTURE_HINTS = {
    "idle": "anything else: hands down, waving, touching face, half-formed signs",
    "ram": "both hands: like Tiger but stacked, raised fingertips staggered",
    "snake": "both hands clasped, all ten fingers interlaced",
    "tiger": "palms together, index fingers straight up, other fingers interlocked",
    "dog": "one fist, the other hand flat on top of it",
    "monkey": "both hands flat, one lying on top of the other",
    "boar": "palms down, fingers bent down, fingertips touching (a V)",
    "horse": "index fingertips touching like a roof, other fingers interlocked",
    "clone_seal": "both hands: index+middle up, crossed like a plus sign",
    "rasengan_palm": "one hand: open palm toward camera, fingers spread",
}
# Recordings made before the sign set changed. Their files stay where they are; the
# label is translated when loading. Labels missing here and in GESTURES (the old
# "chidori" claw and "fire" OK-ring) are kept on disk but not used for training.
LEGACY_LABELS = {"rasengan": "rasengan_palm"}
REFERENCES_DIR = ROOT / "gesture_references"

# ---------------------------------------------------------------- YOLOX hand-seal detector
# Pretrained YOLOX-Nano from Kazuhito00/NARUTO-HandSignDetection. Licences: models/THIRD_PARTY_YOLOX.md
# (code MIT; weights and training data NOT clearly licensed -> personal / educational use only).
SEAL_MODEL_PATH = MODELS_DIR / "yolox_nano.onnx"
SEAL_INPUT_SIZE = 416        # the ONNX model only accepts 416 x 416
SEAL_THREADS = 2             # measured on this laptop: best speed per CPU core used
SEAL_RATE_HZ = 10            # at most this many detections per second, in its own thread
# model class id -> our sign. The other official seals it knows (rat, ox, hare, dragon, bird)
# and its extra classes (gassho, unknown, mizunoe) are not used by any jutsu: ignored.
SEAL_CLASSES = {2: "tiger", 5: "snake", 6: "horse", 7: "ram", 8: "monkey", 10: "dog", 11: "boar"}

# ---------------------------------------------------------------- recognition fusion (shinobi/fusion.py)
# YOLOX owns the 7 official seals; the landmark classifier owns these two (YOLOX has no such classes).
LANDMARK_SIGNS = ["clone_seal", "rasengan_palm"]
SEAL_MIN_SCORE = 0.70        # YOLOX score needed when its box lies on a hand MediaPipe sees
SEAL_NO_HAND_SCORE = 0.85    # ...when MediaPipe sees no hand at all (seals that hide the fingers)
SEAL_CONFIRM = 2             # the same seal in this many YOLOX results in a row
SEAL_MAX_AGE = 0.35          # seconds a YOLOX result stays valid
LANDMARK_MIN_PROB = 0.60     # landmark probability needed for clone_seal / rasengan_palm
LANDMARK_BACKUP_PROB = 0.90  # landmark classifier may report an official seal only if YOLOX is off
# An uncertain landmark prediction is no sign: clone_seal / rasengan_palm also need top1 - top2 >= this
# (held-out rasengan_palm recordings: 5th percentile of the margin 0.84; measured 2026-11-01).
LANDMARK_MIN_MARGIN = 0.30
# rasengan_palm is an OPEN palm: the thumb tip must be away from the index tip, at least this share of
# the hand's size (wrist -> middle knuckle, 3D landmarks). The OK sign (thumb touching the index) was
# called a palm by the classifier, which never saw one: its gap is ~0.3-0.5, real palms 0.8-1.2.
PALM_MIN_THUMB_GAP = 0.60

# ---------------------------------------------------------------- recognition -> action
PROB_SMOOTHING = 0.4     # EMA weight of the newest prediction (0..1) at PROB_SMOOTHING_FPS
PROB_SMOOTHING_FPS = 15  # the frame rate that weight was tuned at: per second it is the same at any fps
CONF_ON = 0.75           # smoothed probability needed to start confirming
CONF_OFF = 0.45          # probability below which a confirmed gesture is released
MIN_MARGIN = 0.25        # top1 - top2 must be at least this
HOLD_SECONDS = 0.30      # gesture must stay above CONF_ON this long
COOLDOWN_SECONDS = 1.5   # after a jutsu fires, ignore new jutsu for this long
# Max seconds from one CONFIRMED sign to the next one of the same sequence. It is a limit, not a
# wait: the next sign counts as soon as it is confirmed. The timer restarts at every confirmed sign
# (also when the same sign is re-confirmed while held). Raised from 3.5 s: changing hands between two
# seals took longer than that in real use, and the sequence reset while the user was getting ready.
SEQUENCE_MAX_GAP = 7.0
# The Live time limit runs on the time the AI could actually see the user: one processed frame adds
# at most this many seconds, so a stall (the first frames of a session, a busy server or browser)
# does not eat into the 7 s. At 2.5+ processed frames per second it is the wall clock.
SEQUENCE_CLOCK_MAX_STEP = 0.4
# Readiness: the models are warmed up when a session starts (Engine.warm_up); after that, signs count
# only once this many frames in a row were processed in under READY_MAX_MS (camera and AI running at
# a usable pace). Before that no sign is confirmed, so no step and no time limit can start.
READY_FRAMES = 5
READY_MAX_MS = 500

# A jutsu is an ordered list of signs; it fires only when all of them are done in this order.
# Rule (checked at start-up): no jutsu may appear inside another one before its last sign.
# "official": the four signs are consecutive official seals; False = custom SHINOBI AI sequence.
# Sources and reasons: gesture_references/README.md
JUTSU = {
    "fire_style": {"sequence": ["monkey", "boar", "horse", "tiger"], "effect": "fire", "official": True},
    "chidori": {"sequence": ["snake", "dog", "tiger", "monkey"], "effect": "chidori", "official": True},
    "shadow_clone": {"sequence": ["ram", "snake", "tiger", "clone_seal"], "effect": "shadow_clone",
                     "official": False},
    "rasengan": {"sequence": ["clone_seal", "dog", "horse", "rasengan_palm"], "effect": "rasengan",
                 "official": False},
}

# ---------------------------------------------------------------- effects
EFFECT_DURATION = {"shadow_clone": 10.0, "rasengan": 8.0, "chidori": 8.0, "fire": 6.0}
EFFECT_KEYS = {ord("1"): "shadow_clone", ord("2"): "rasengan", ord("3"): "chidori", ord("4"): "fire"}
HAND_LOST_GRACE = 0.6    # seconds the hand anchor counts as "visible" after MediaPipe lost the hand
# A hand effect keeps running when MediaPipe loses the hand (two-hand seals often hide it): it stays
# at the hand's last place. Hand loss ends it only after this many seconds of its main effect
# (None = never: it plays its whole EFFECT_DURATION).
HAND_EFFECT_MIN_SECONDS = None

# Activation stages (effects/base.py): a jutsu fired by its sequence first builds up chakra while the
# character calls out the activation ("voice"), charges ("charge") and says the jutsu's name ("name");
# then its main effect starts ("release"). voice / name last as long as the installed voice clip
# (assets/audio/voice/<jutsu>/activation.wav, name.wav, read with the wave module) + VOICE_GAP, or
# VOICE_DEFAULT without a clip. Effects started by hand (desktop keys 1-4) skip the build-up.
ACTIVATION_CHARGE = {"fire_style": 1.2, "chidori": 1.2, "shadow_clone": 1.2, "rasengan": 1.2}
ACTIVATION_CHARGE_DEFAULT = 1.2
VOICE_DEFAULT = 0.4
VOICE_GAP = 0.05

# Shadow clone: CLONE_COUNT clones around the real person (11 people on screen), in three rows:
# 2 in front, 4 in the middle, 4 at the back. Clones with the same scale + lift form one row.
# One entry per clone in each list, matched by index (front row first). Back rows are smaller
# and clearly higher: a smaller clone's head sits lower, so without enough lift the back heads
# end up exactly behind the front heads (measured: 2 of 10 clones fully hidden with lifts
# 0 / 0.10 / 0.20).
# Positions are ADAPTIVE (effects/shadow_clone.py, plan_row): every frame each row is spread over
# the free room left and right of the user, in proportion to that room (user in the middle: 5 + 5;
# user at an edge: all 10 on the other side). No clone is ever dropped.
#   offset: the clone's place in the left-to-right order of its row (and its first spot before
#           the user is found), as a fraction of the frame width from the middle
#   scale:  clone size compared to the real person (a row may shrink to 80 % when space is short)
#   lift:   how far the clone's bottom edge is raised, as a fraction of the frame height
#   delay:  seconds the clone lags behind the user (all different, so they don't move in sync)
CLONE_COUNT = 10
CLONE_OFFSETS = [-0.36, 0.36, -0.46, -0.27, 0.27, 0.46, -0.19, 0.19, -0.37, 0.37]
CLONE_SCALES = [0.68, 0.68, 0.56, 0.56, 0.56, 0.56, 0.45, 0.45, 0.45, 0.45]
CLONE_LIFTS = [0.00, 0.00, 0.22, 0.22, 0.22, 0.22, 0.40, 0.40, 0.40, 0.40]
CLONE_DELAYS = [0.25, 0.40, 0.55, 0.70, 0.85, 1.00, 1.15, 1.30, 1.45, 1.60]
CLONE_PARALLEL = True              # build the clone layer on a worker thread (shadow_clone.py)
SEGMENT_WIDTH = 640                # segmentation runs at this width (speed)
MASK_SMOOTHING = 0.5               # EMA weight of newest mask (less = steadier)

# One Euro filter for effect anchors (smaller min_cutoff = smoother, more lag)
FILTER_MIN_CUTOFF = 1.5
FILTER_BETA = 0.02

# ---------------------------------------------------------------- data collection
RECORD_SECONDS = 20
COUNTDOWN_SECONDS = 3

# Guided sequence recordings (record_sequences.py). The screen asks for each sign for
# SEQ_HOLD_SECONDS, with SEQ_TRANSITION_SECONDS to change hands in between, and
# SEQ_LEAD_SECONDS of hands-down before the first and after the last sign.
SEQUENCES_DIR = DATA_DIR / "sequences"
SEQUENCE_VIDEOS_DIR = VIDEOS_DIR / "sequences"
SEQ_HOLD_SECONDS = 1.5
SEQ_TRANSITION_SECONDS = 1.5
SEQ_LEAD_SECONDS = 1.5

# ---------------------------------------------------------------- web server (shinobi/server.py)
# Contract with the React app: docs/web_protocol.md. Run:  python -m shinobi.server
APP_VERSION = "0.1.0"
PROTOCOL_VERSION = 1
SERVER_HOST = "127.0.0.1"          # 0.0.0.0 = reachable from the LAN (phones need HTTPS for the camera)
SERVER_PORT = 8000
SERVER_MAX_SESSIONS = 2            # browser sessions at the same time; each one runs its own models
FRAME_MAX_WIDTH = 1280             # bigger camera frames are scaled down to fit (aspect ratio kept)
FRAME_MAX_HEIGHT = 1280
FRAME_MIN_SIZE = 32                # smaller frames (after scaling) are refused as bad_frame
FRAME_JPEG_QUALITY = 80            # 0..100, the camera frames the browser sends (it gets 0.8 in /api/info)
OUTPUT_JPEG_QUALITY = 90           # the frames the server sends back, with the effects drawn on them
OUTPUT_JPEG_444 = True             # ...at full colour resolution (no 4:2:0): thin coloured lines stay sharp
FRAME_MAX_IN_FLIGHT = 2            # frames a client may send before it gets an answer
FRAME_MAX_BYTES = 4 * 1024 * 1024  # bigger binary messages are refused as bad_frame
FRONTEND_DIST = ROOT / "frontend" / "dist"   # the built React app (npm run build)
AUDIO_DIR = ROOT / "assets" / "audio"

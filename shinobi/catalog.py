"""Display texts of the signs and jutsu, and the credits. Pure data (no PIL, no models).

One copy, used by two programs:
  * tools/build_gesture_references.py draws them on the reference cards (gesture_references/),
  * shinobi/server.py sends them to the web app (/api/jutsu, /api/credits).
Change a text here and re-run the tool, so the cards and the web app keep saying the same thing.
The ORDER of the steps is not here: it is config.JUTSU[id]["sequence"], the table the app uses.
"""

from shinobi import config

# Card footers (credit lines printed on every card).
COMMONS_CREDIT = ("Line art: Schlum / Wikimedia Commons, CC BY-SA 4.0 (traced from a photograph), "
                  "placed on a labelled card by SHINOBI AI. Illustration, not an anime screenshot.")
PALM_CREDIT = ("Drawing rendered by SHINOBI AI from a recorded webcam hand pose (custom pose). "
               "Illustration, not an anime screenshot.")

# Every sign used by the four sequences. cues = what to do, shown on the step card.
SIGNS = {
    "ram": dict(name="RAM", jp="Hitsuji · 未", hands=2, official=True, cues=[
        "Both hands, fingers pointing up",
        "Raised fingers pressed together, tips staggered (one higher)",
        "One hand's other fingers wrap around the other hand",
        "Not interlocked like Tiger"]),
    "snake": dict(name="SNAKE", jp="Mi · 巳", hands=2, official=True, cues=[
        "Clasp both hands",
        "Interlace ALL ten fingers",
        "Knuckles on top",
        "No finger points up"]),
    "tiger": dict(name="TIGER", jp="Tora · 寅", hands=2, official=True, cues=[
        "Palms pressed together",
        "Index fingers straight up, pressed together",
        "Other fingers interlock over the backs of the hands",
        "Symmetric: both tips at the same height"]),
    "dog": dict(name="DOG", jp="Inu · 戌", hands=2, official=True, cues=[
        "One hand: a fist",
        "Other hand: flat, palm down, resting on the fist",
        "Flat fingers together, pointing sideways"]),
    "monkey": dict(name="MONKEY", jp="Saru · 申", hands=2, official=True, cues=[
        "Both hands flat, fingers straight and together",
        "Lay one hand on top of the other",
        "Both hands point the same way (sideways)",
        "Thumbs tucked in"]),
    "boar": dict(name="BOAR", jp="I · 亥", hands=2, official=True, cues=[
        "Hands at chest height, palms facing down",
        "Fingers together, bent downward",
        "Fingertips of both hands touch in the middle",
        "Shape: a V pointing down"]),
    "horse": dict(name="HORSE", jp="Uma · 午", hands=2, official=True, cues=[
        "Index fingertips touch, pointing up (a roof)",
        "Middle, ring and little fingers interlock below",
        "Thumbs tucked underneath"]),
    "clone_seal": dict(name="CLONE SEAL", jp="Kage Bunshin · 影分身", hands=2, official=True, cues=[
        "Each hand: index + middle fingers straight, others folded",
        "One hand vertical, fingers up",
        "Other hand horizontal, fingers sideways",
        "Cross them to make a  +"]),
    "rasengan_palm": dict(name="RASENGAN PALM", jp="custom pose", hands=1, official=False, cues=[
        "ONE hand, palm facing the camera",
        "Fingers straight and spread apart",
        "In front of your chest / shoulder",
        "Other hand down, out of the frame"]),
}

# Per jutsu. On the cards: title, color (RGB of the header), tag (sub-title), status (provenance of
# the sequence). Web app only: name, kanji (first line of gesture_references/<id>/instructions.md)
# and description (what the effect does in SHINOBI AI; our own words).
_SECONDS = config.EFFECT_DURATION
JUTSU = {
    "fire_style": dict(
        title="FIRE STYLE", color=(216, 67, 21),
        tag="Great Fireball Technique  ·  OFFICIAL SEQUENCE (last 4 of 6 seals)",
        status=("Official seals: Snake → Ram → [ Monkey → Boar → Horse → Tiger ].  "
                "SHINOBI AI uses the last four, in the original order."),
        name="Great Fireball Technique", kanji="火遁・豪火球の術",
        description=(f"A roaring jet of flame bursts from your hand, in the direction your fingers point, "
                     f"and keeps following the hand for about {_SECONDS['fire']:.0f} seconds. When it stops, "
                     f"the last flames burn out and drift upward as dark smoke.")),
    "chidori": dict(
        title="CHIDORI", color=(81, 45, 168),
        tag="OFFICIAL SEQUENCE (last 4 seals of the 9-seal anime version, ep. 67)",
        status=("Official 9-seal version: Monkey → Dragon → Rat → Bird → Ox → [ Snake → Dog → Tiger → Monkey ].  "
                "SHINOBI AI uses the last four, in the original order."),
        name="One Thousand Birds", kanji="千鳥",
        description=(f"Blue lightning crackles around your hand: forked bolts redrawn about twenty times a "
                     f"second, sparks raining down and quick blue flashes over the whole picture. It stays "
                     f"on your hand for about {_SECONDS['chidori']:.0f} seconds.")),
    "shadow_clone": dict(
        title="SHADOW CLONE", color=(239, 108, 0),
        tag="CUSTOM SHINOBI AI SEQUENCE  ·  made only of official seals",
        status=("Custom sequence. Steps 1-3 = official Clone Technique seals (Ram → Snake → Tiger); "
                "step 4 = the official Shadow Clone seal. The Shadow Clone itself needs only one seal."),
        name="Shadow Clone Technique", kanji="影分身の術",
        description=(f"Ten copies of you pop up one after another, each in a puff of smoke: "
                     f"{config.CLONE_COUNT + 1} people on screen. They are cut out of the live camera "
                     f"picture, stand in three rows around you and copy your moves a little late, each "
                     f"with its own delay. After about {_SECONDS['shadow_clone']:.0f} seconds they "
                     f"vanish in smoke.")),
    "rasengan": dict(
        title="RASENGAN", color=(21, 101, 192),
        tag="CUSTOM SHINOBI AI SEQUENCE  ·  the Rasengan has no official hand seals",
        status=("Custom sequence. Step 1 nods to Naruto using shadow clones to shape the Rasengan; "
                "steps 2-3 were picked to be easy to tell apart on a webcam; step 4 is a custom palm pose."),
        name="Spiralling Sphere", kanji="螺旋丸",
        description=(f"A sphere of blue energy grows on your open palm and spins: bright core, whirling "
                     f"rings, orbiting sparks and streaks of wind thrown off its rim. It follows your hand "
                     f"for about {_SECONDS['rasengan']:.0f} seconds.")),
}

# ---------------------------------------------------------------- credits (/api/credits)
# Sources: gesture_references/README.md (section 5) and _sources/signs/CREDITS.txt,
# assets/audio/SOURCES.md (credits block) and models/THIRD_PARTY_YOLOX.md.
CC_BY_SA_4 = "https://creativecommons.org/licenses/by-sa/4.0/"
CC_BY_4 = "https://creativecommons.org/licenses/by/4.0/"
CC_BY_3 = "https://creativecommons.org/licenses/by/3.0/"
CC0 = "https://creativecommons.org/publicdomain/zero/1.0/"


def _item(text, url=None, license=None, license_url=None):
    return {"text": text, "url": url, "license": license, "license_url": license_url}


CREDITS = [
    {"title": "Hand-seal illustrations", "items": [
        _item("Hand-seal illustrations (Ram, Snake, Tiger, Dog, Monkey, Boar, Horse, Clone seal): line art by "
              "Schlum, Wikimedia Commons, \"Naruto Mudra\" series, vectorized from photographs. Cropped and "
              "placed on labelled cards for SHINOBI AI; the web app shows them with thicker, darker lines "
              "(tools/build_bold_signs.py). The cards and the adapted drawings are CC BY-SA 4.0 as well.",
              "https://commons.wikimedia.org/wiki/User:Schlum", "CC BY-SA 4.0", CC_BY_SA_4),
        _item("Rasengan palm drawing: rendered by SHINOBI AI from one recorded webcam hand pose (a custom "
              "pose, no published illustration exists)."),
        _item("All pictures are illustrations, not screenshots from the anime or the manga."),
    ]},
    {"title": "Sound effects", "items": [
        _item("\"8 Magic Attacks\" (Fire explosion, Thunder, Wind, Charge) by leohpaz. Modified: converted to "
              "16-bit WAV, layered with other sounds, level-adjusted.", "https://opengameart.org/content/8-magic-attacks",
              "CC BY 4.0", CC_BY_4),
        _item("\"Fantasy SFX Pack Vol 1\" by JC Sounds. Modified: layered and mixed with other sounds, filtered, "
              "level-adjusted (hand seal, jutsu hand-sign, charge, release and impact sounds).",
              "https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1", "CC BY 4.0", CC_BY_4),
        _item("\"Force field electric hum\" by Hansjörg Malthaner (http://opengameart.org/users/varkalandar). "
              "Unmodified.", "https://opengameart.org/content/force-field-electric-hum", "CC BY 4.0", CC_BY_4),
        _item("\"Fire Loop\" by qubodup. Modified: converted to WAV, resampled to 44.1 kHz, loop seam "
              "crossfaded.", "https://opengameart.org/content/fire-loop", "CC BY 3.0", CC_BY_3),
        _item("\"Poof Noises\" (poof_1.wav) by dklon. Modified: layered with other sounds, level-adjusted.",
              "https://opengameart.org/content/poof-noises", "CC BY 3.0", CC_BY_3),
        _item("Other sounds: CC0 / public domain, via OpenGameArt.org, by faxcorp, pyranostudios, qubodup, "
              "BMacZero (Brian MacIntosh), Julien Matthey, wobbleboxx (WobbleBoxx Workshop), fins, Fupi, "
              "Kenney (www.kenney.nl), rubberduck, artisticdude, jaggedstone, ogrebane and zeroisnotnull; the "
              "hand-seal sound is made from \"Thwack Sounds\" by Jordan Irwin (AntumDeluge) and \"Fabric "
              "Rustling\" by iochi-glaucus. Credit for these is optional.",
              "https://opengameart.org/", "CC0 1.0", CC0),
        _item("All sounds are generic sound effects: no anime audio, dialogue or soundtrack."),
        _item("Background music \"Leaf Trail\": an original instrumental loop (koto-like plucks, bamboo "
              "flute, taiko) composed and synthesised for SHINOBI AI. No anime soundtrack or third-party "
              "recording is used (assets/audio/SOURCES.md, \"Background music\")."),
    ]},
    {"title": "Music during the hand-sign sequences (not the original Naruto soundtrack)", "items": [
        _item("\"Blackmoor Ninjas (Battle Theme)\" by Matthew Pablo (http://www.matthewpablo.com), Rasengan. "
              "Modified: a 16-bar section made into a loop.",
              "https://opengameart.org/content/blackmoor-ninjas-battle-theme", "CC BY 3.0", CC_BY_3),
        _item("\"Taiko drums (seamless loop)\" by congusbongus, cut from \"Taiko drums.wav\" by jobro "
              "(https://freesound.org/people/jobro/sounds/112248/), Fire Style. Modified: a 16-bar section made "
              "into a loop.", "https://opengameart.org/content/taiko-drums-seamless-loop", "CC BY 3.0", CC_BY_3),
        _item("\"Revenge\" by TAD, Chidori. Modified: a 16-bar section made into a loop.",
              "https://opengameart.org/content/revenge", "CC BY 4.0", CC_BY_4),
        _item("\"Samurai\" by TAD, Shadow Clone. Modified: a 24-bar section made into a loop.",
              "https://opengameart.org/content/samurai", "CC BY 4.0", CC_BY_4),
        _item("The original Naruto soundtrack is not used: it needs a licence from its label and publisher "
              "(assets/audio/ASSET_LICENSES.md)."),
    ]},
    {"title": "Hand-seal detector model", "items": [
        _item("YOLOX-Nano hand-seal detector (yolox_nano.onnx) from NARUTO-HandSignDetection by "
              "Kazuhito Takahashi (Kazuhito00). The project's code is MIT licensed.",
              "https://github.com/Kazuhito00/NARUTO-HandSignDetection", "MIT",
              "https://opensource.org/license/mit"),
        _item("The pretrained weights have no explicit licence, and their private training data includes "
              "third-party anime images. SHINOBI AI uses the model for personal and educational purposes "
              "only; any public release, redistribution of the model or commercial use would first need "
              "these rights to be clarified (or a model trained only on our own recordings)."),
    ]},
    {"title": "Disclaimer", "items": [
        _item("SHINOBI AI is an unofficial fan project for personal and educational use. It is not affiliated "
              "with or endorsed by the rights holders of NARUTO."),
        _item("NARUTO, its characters, jutsu and hand-seal names belong to their rights holders "
              "(Masashi Kishimoto / Shueisha / Studio Pierrot)."),
        _item("No anime footage, screenshots or audio are used: the effects are drawn live by our own code, "
              "the seal pictures are line-art illustrations and the sounds are generic sound effects."),
    ]},
]

# ------------------------------------------------------------------ character voice clips
# None are bundled. Only licensed recordings supplied by the user go in assets/audio/voice (see its
# README.md). Drop-in convention, one folder per jutsu:
#   assets/audio/voice/<jutsu>/activation.wav   the hand-sign / activation call
#   assets/audio/voice/<jutsu>/name.wav         the technique name
# PCM WAV only: the server reads each clip's length (wave module) to time the activation stages
# (effects/base.py), so the build-up lasts exactly as long as the voice. A file it cannot read as PCM
# WAV is not listed (and not used). The web app plays them only when the backend fires that jutsu;
# a missing clip is skipped, never replaced.
VOICE_PARTS = ("activation", "name")
VOICE_FORMATS = (".wav",)
VOICE_SPEAKER = {"fire_style": "Naruto", "chidori": "Sasuke", "shadow_clone": "Naruto", "rasengan": "Naruto"}


def wav_seconds(path):
    """Length of a PCM WAV file in seconds, or None when it is missing or not a readable PCM WAV."""
    import wave
    try:
        with wave.open(str(path), "rb") as f:
            rate = f.getframerate()
            return f.getnframes() / rate if rate > 0 else None
    except (OSError, EOFError, wave.Error):
        return None


def voice_seconds(jutsu, audio_dir=None):
    """{part: seconds or None} of the installed voice clips of one jutsu."""
    root = (config.AUDIO_DIR if audio_dir is None else audio_dir) / "voice" / jutsu
    return {part: wav_seconds(root / f"{part}.wav") for part in VOICE_PARTS}


def voice_clips(audio_dir=None):
    """The installed voice clips: {jutsu: {"speaker", "activation": url or None, "name": url or None,
    "seconds": {"activation": s or None, "name": s or None}}}."""
    clips = {}
    for jutsu in JUTSU:
        seconds = voice_seconds(jutsu, audio_dir)
        entry = {"speaker": VOICE_SPEAKER.get(jutsu)}
        for part in VOICE_PARTS:
            entry[part] = f"/audio/voice/{jutsu}/{part}.wav" if seconds[part] is not None else None
        entry["seconds"] = {part: None if v is None else round(v, 3) for part, v in seconds.items()}
        clips[jutsu] = entry
    return clips

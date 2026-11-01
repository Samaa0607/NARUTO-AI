from shinobi import catalog, config
from shinobi.effects.chidori import Chidori
from shinobi.effects.fire import FireStyle
from shinobi.effects.rasengan import Rasengan
from shinobi.effects.shadow_clone import ShadowClone

# name -> function that builds a fresh effect (a new object every activation)
EFFECTS = {
    "shadow_clone": lambda: ShadowClone(config.EFFECT_DURATION["shadow_clone"]),
    "rasengan": lambda: Rasengan(config.EFFECT_DURATION["rasengan"]),
    "chidori": lambda: Chidori(config.EFFECT_DURATION["chidori"]),
    "fire": lambda: FireStyle(config.EFFECT_DURATION["fire"]),
}


def activation_stages(jutsu, audio_dir=None):
    """Build-up of a fired jutsu (effects/base.py): {"voice": s, "charge": s, "name": s}.
    voice / name: the installed voice clip's length + VOICE_GAP, or VOICE_DEFAULT without one;
    charge: config.ACTIVATION_CHARGE."""
    seconds = catalog.voice_seconds(jutsu, audio_dir) if jutsu in catalog.JUTSU else {}

    def spoken(part):
        clip = seconds.get(part)
        return config.VOICE_DEFAULT if clip is None else clip + config.VOICE_GAP

    return {"voice": round(spoken("activation"), 3),
            "charge": float(config.ACTIVATION_CHARGE.get(jutsu, config.ACTIVATION_CHARGE_DEFAULT)),
            "name": round(spoken("name"), 3)}

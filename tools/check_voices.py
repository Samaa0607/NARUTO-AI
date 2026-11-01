"""Check the 8 character voice clips in assets/audio/voice/ before they are used.

Run:  python tools/check_voices.py

For each clip (<jutsu>/activation.wav and <jutsu>/name.wav, 4 jutsu) it reports: missing, or the
format (16-bit PCM WAV, mono, 44.1 or 48 kHz), the length, the silence before the voice starts, the
peak and the loudness (integrated LUFS, ITU-R BS.1770 K-weighting with gating). The server reads the
clips' lengths to time the activation (voice -> charge -> name -> release), so only WAV is used.
Exit code 0 only when all 8 clips are present and within the spec (assets/audio/voice/README.md).

It checks files; it cannot check where a recording comes from. Only licensed recordings belong there
(see the README): never anime, game or film audio without the rights holders' permission, and never
synthetic copies of the original voice actors.
"""

import sys
import wave
from pathlib import Path

import numpy as np
from scipy.signal import lfilter

ROOT = Path(__file__).resolve().parents[1]
VOICE = ROOT / "assets" / "audio" / "voice"
CLIPS = [  # jutsu, speaker, part, what is said
    ("fire_style", "Naruto", "activation", "activation shout"),
    ("fire_style", "Naruto", "name", "\"Katon: Gōkakyū no Jutsu!\""),
    ("chidori", "Sasuke", "activation", "activation / charging call"),
    ("chidori", "Sasuke", "name", "\"Chidori!\""),
    ("shadow_clone", "Naruto", "activation", "hand-sign shout"),
    ("shadow_clone", "Naruto", "name", "\"Kage Bunshin no Jutsu!\""),
    ("rasengan", "Naruto", "activation", "charging shout"),
    ("rasengan", "Naruto", "name", "\"Rasengan!\""),
]
MAX_LENGTH = {"activation": 2.0, "name": 2.5}   # seconds
MIN_LENGTH = 0.25
MAX_LEAD = 0.03                                  # seconds of silence before the voice
RATES = (44100, 48000)
PEAK_MAX = -1.0                                  # dBFS
LUFS_TARGET, LUFS_TOLERANCE = -16.0, 2.0


def db(x):
    return 20 * np.log10(max(float(x), 1e-12))


def k_weighting(rate):
    """The two BS.1770 pre-filters (high shelf + high pass) for any sample rate (bilinear design)."""
    # stage 1: high shelf, +4 dB around 1.68 kHz
    f0, gain_db, q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    k = np.tan(np.pi * f0 / rate)
    vh = 10 ** (gain_db / 20)
    vb = vh ** 0.4996667741545416
    a0 = 1 + k / q + k * k
    b1 = [(vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0]
    a1 = [1, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]
    # stage 2: high pass around 38 Hz
    f0, q = 38.13547087602444, 0.5003270373238773
    k = np.tan(np.pi * f0 / rate)
    a0 = 1 + k / q + k * k
    b2 = [1, -2, 1]
    a2 = [1, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]
    return (b1, a1), (b2, a2)


def integrated_lufs(x, rate):
    """BS.1770-4 integrated loudness of a mono signal (400 ms blocks, 75 % overlap, gated)."""
    (b1, a1), (b2, a2) = k_weighting(rate)
    y = lfilter(b2, a2, lfilter(b1, a1, x))
    block, hop = int(0.4 * rate), int(0.1 * rate)
    if len(y) < block:
        return -0.691 + 10 * np.log10(max(np.mean(y ** 2), 1e-12))
    power = np.array([np.mean(y[i:i + block] ** 2) for i in range(0, len(y) - block + 1, hop)])
    loud = -0.691 + 10 * np.log10(np.maximum(power, 1e-12))
    gated = power[loud > -70]
    if len(gated) == 0:
        return float("-inf")
    rel = -0.691 + 10 * np.log10(np.mean(gated)) - 10
    gated = power[(loud > -70) & (loud > rel)]
    return float(-0.691 + 10 * np.log10(np.mean(gated))) if len(gated) else float("-inf")


def check(path, part):
    """(ok, summary, problems) for one clip."""
    if not path.is_file():
        return False, "missing", []
    problems = []
    try:
        with wave.open(str(path)) as w:
            ch, width, rate, n, comp = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes(), w.getcomptype()
            raw = w.readframes(n)
    except (wave.Error, EOFError) as e:
        return False, f"not a PCM WAV file ({e})", ["save it as 16-bit PCM WAV"]
    if comp != "NONE" or width != 2:
        problems.append(f"{width * 8}-bit {comp}: must be 16-bit PCM")
    if ch != 1:
        problems.append(f"{ch} channels: must be mono")
    if rate not in RATES:
        problems.append(f"{rate} Hz: must be 44100 or 48000 Hz")
    if width != 2:
        return False, f"{width * 8}-bit, {ch} ch, {rate} Hz", problems
    x = np.frombuffer(raw, "<i2").astype(np.float64).reshape(-1, ch).mean(axis=1) / 32768
    length = len(x) / rate
    if length < MIN_LENGTH or length > MAX_LENGTH[part]:
        problems.append(f"{length:.2f} s: must be {MIN_LENGTH}-{MAX_LENGTH[part]} s")
    above = np.nonzero(np.abs(x) > 10 ** (-40 / 20))[0]
    lead = above[0] / rate if len(above) else length
    if lead > MAX_LEAD:
        problems.append(f"{lead * 1000:.0f} ms of silence before the voice: trim it to under {MAX_LEAD * 1000:.0f} ms")
    peak = db(np.abs(x).max())
    if peak > PEAK_MAX:
        problems.append(f"peak {peak:.1f} dBFS: must be at most {PEAK_MAX:.0f} dBFS")
    lufs = integrated_lufs(x, rate)
    if not np.isfinite(lufs) or abs(lufs - LUFS_TARGET) > LUFS_TOLERANCE:
        problems.append(f"{lufs:.1f} LUFS: aim for {LUFS_TARGET:.0f} +/- {LUFS_TOLERANCE:.0f} LUFS")
    summary = f"{length:.2f} s, {ch} ch, {rate} Hz, lead {lead * 1000:.0f} ms, peak {peak:.1f} dBFS, {lufs:.1f} LUFS"
    return not problems, summary, problems


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # the jutsu names have macrons
    ok_all = True
    print(f"Character voice clips in {VOICE}\n")
    for jutsu, speaker, part, says in CLIPS:
        path = VOICE / jutsu / f"{part}.wav"
        ok, summary, problems = check(path, part)
        ok_all &= ok
        print(f"[{'OK ' if ok else 'NO '}] {jutsu}/{part}.wav  ({speaker}: {says})  {summary}")
        for p in problems:
            print(f"        - {p}")
    others = sorted(p.relative_to(VOICE).as_posix() for p in VOICE.rglob("*")
                    if p.is_file() and p.name != "README.md" and p.suffix.lower() != ".wav")
    if others:
        print("\nNot used (only <jutsu>/activation.wav and <jutsu>/name.wav are read):")
        for o in others:
            print(f"  {o}")
    print(f"\n{'All 8 clips are ready.' if ok_all else 'Not ready: see the lines marked NO (assets/audio/voice/README.md).'}")
    return 0 if ok_all else 1


if __name__ == "__main__":
    sys.exit(main())

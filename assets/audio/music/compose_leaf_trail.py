"""Original background loop for SHINOBI AI: "Leaf Trail".

Composed and synthesised from scratch with numpy/scipy (no samples, no recordings): koto-like plucks
(Karplus-Strong), a breathy bamboo-flute line (additive synthesis + noise), soft taiko and a low pad,
in the A minor pentatonic (min'yo) scale. 90 BPM, 24 bars = 64 s, seamless loop (the reverb and the
last notes' tails are wrapped onto the start). Output: mono 22.05 kHz 16-bit PCM WAV.

usage: python compose_music.py OUT.wav
"""
import sys
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, lfilter, resample_poly, sosfilt

SR = 44100
BPM = 90.0
BEAT = 60.0 / BPM
BARS = 24
LOOP = int(round(BARS * 4 * BEAT * SR))      # 64 s
TAIL = int(4.5 * SR)
rng = np.random.default_rng(20261031)

NOTE = {n: i for i, n in enumerate(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])}


def hz(name: str) -> float:
    pitch, octave = name[:-1], int(name[-1])
    midi = 12 * (octave + 1) + NOTE[pitch]
    return 440.0 * 2 ** ((midi - 69) / 12)


buf = {k: np.zeros(LOOP + TAIL) for k in ('koto', 'flute', 'taiko', 'bass', 'pad', 'tick')}


def add(track: str, start_s: float, sig: np.ndarray) -> None:
    i = int(round(start_s * SR))
    if i < 0:  # a humanised note just before the loop start: its head goes to the loop end
        buf[track][LOOP + i: LOOP] += sig[:-i]
        sig, i = sig[-i:], 0
    end = min(len(buf[track]), i + len(sig))
    buf[track][i:end] += sig[: end - i]


def lowpass(x, hz_, order=2):
    return sosfilt(butter(order, hz_, 'low', fs=SR, output='sos'), x)


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


# ------------------------------------------------------------------ instruments
def pluck(f: float, dur: float, t60: float, bright: float, vel: float) -> np.ndarray:
    """Karplus-Strong string: noise burst into a delay loop with an averaging low-pass."""
    n = int(dur * SR)
    period = SR / f
    d = max(2, int(round(period - 0.5)))
    g = 0.001 ** (1.0 / (f * t60))                       # loop gain for the wanted decay
    exc = rng.uniform(-1, 1, d)
    exc = lowpass(exc, min(SR * 0.45, 1500 + bright * 9000), 1)   # softer or brighter pluck
    exc -= exc.mean()
    # pluck position comb: removes some harmonics, gives the koto its hollow 'tsun'
    p = max(1, int(d * 0.18))
    exc = exc - np.concatenate([np.zeros(p), exc[:-p]]) * 0.6
    x = np.zeros(n)
    x[:d] = exc
    a = np.zeros(d + 2)
    a[0] = 1.0
    a[d] = -g * 0.5
    a[d + 1] = -g * 0.5
    y = lfilter([1.0], a, x)
    # a short attack 'click' of the plectrum (tsume)
    click = bandpass(rng.uniform(-1, 1, int(0.012 * SR)), 1800, 5200) * np.linspace(1, 0, int(0.012 * SR)) * 0.25
    y[: len(click)] += click
    env = np.ones(n)
    rel = int(0.05 * SR)
    env[-rel:] = np.linspace(1, 0, rel)
    y *= env
    return y / (np.max(np.abs(y)) + 1e-9) * vel


def flute(f: float, dur: float, vel: float) -> np.ndarray:
    """Breathy bamboo flute: scooped attack, delayed vibrato, weak harmonics, air noise."""
    rel = 0.16
    n = int((dur + rel) * SR)
    t = np.arange(n) / SR
    scoop = -0.022 * np.exp(-t / 0.07)                          # starts ~40 cents flat (meri -> kari)
    vib_depth = 0.0055 * np.clip((t - 0.35) / 0.6, 0, 1)
    vib = vib_depth * np.sin(2 * np.pi * 5.1 * t + rng.uniform(0, 6.28))
    freq = f * (1 + scoop + vib)
    ph = 2 * np.pi * np.cumsum(freq) / SR
    tone = np.sin(ph) + 0.22 * np.sin(2 * ph + 0.3) + 0.07 * np.sin(3 * ph + 1.1) + 0.03 * np.sin(4 * ph)
    att = 0.11
    env = np.clip(t / att, 0, 1) ** 1.6
    swell = 1 + 0.12 * np.sin(np.pi * np.clip(t / max(dur, 0.2), 0, 1))   # gentle breath swell
    off = np.clip((dur + rel - t) / rel, 0, 1)
    env = env * swell * off * np.where(t > dur, (dur + rel - t) / rel, 1).clip(0, 1)
    noise = rng.normal(0, 1, n)
    air = bandpass(noise, min(f * 2.5, 6000), min(f * 7, 9000)) * 0.10
    chiff = bandpass(noise, f * 0.8, f * 1.4) * np.exp(-t / 0.05) * 0.5     # breath at the onset
    breath_tone = bandpass(noise, f * 0.92, f * 1.08) * 0.35               # noise riding on the note
    y = (tone + breath_tone) * env + air * env + chiff * np.clip(t / 0.01, 0, 1)
    return lowpass(y, 5500) * vel * 0.5


def taiko(vel: float, big: bool = True) -> np.ndarray:
    n = int(1.4 * SR)
    t = np.arange(n) / SR
    f0, f1 = (58, 52) if big else (92, 60)
    freq = f0 + f1 * np.exp(-t / 0.05)
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / (0.42 if big else 0.22))
    skin = lowpass(rng.normal(0, 1, n), 700) * np.exp(-t / 0.025) * 0.9
    y = body + skin
    y = lowpass(y, 1800)
    return y / np.max(np.abs(y)) * vel


def tick(vel: float) -> np.ndarray:
    """Shime-daiko style rim tick, very short."""
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    y = bandpass(rng.normal(0, 1, n), 1400, 3800) * np.exp(-t / 0.012) + 0.6 * np.sin(2 * np.pi * 820 * t) * np.exp(-t / 0.018)
    return y / np.max(np.abs(y)) * vel


def pad(freqs, dur: float, vel: float) -> np.ndarray:
    n = int((dur + 1.2) * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for k, f in enumerate(freqs):
        det = 1 + (k % 2 * 2 - 1) * 0.0015
        y += np.sin(2 * np.pi * f * det * t + k) + 0.18 * np.sin(4 * np.pi * f * t + k)
    env = np.clip(t / 0.9, 0, 1) * np.clip((dur + 1.2 - t) / 1.2, 0, 1)
    y *= env * (1 + 0.08 * np.sin(2 * np.pi * 0.23 * t))
    return lowpass(y / len(freqs), 1200) * vel


# ------------------------------------------------------------------ score
CHORDS = ['Am', 'Am', 'G', 'G', 'Dm', 'Dm', 'Em', 'Em',          # A
          'C', 'G', 'Am', 'Am', 'C', 'G', 'Em', 'Em',            # B
          'Am', 'G', 'Dm', 'Em', 'Am', 'G', 'Dm', 'Em']          # A'
VOICING = {  # koto: root, fifth, octave, colour, top (all in A minor pentatonic)
    'Am': ['A3', 'E4', 'A4', 'C5', 'E5'],
    'G': ['G3', 'D4', 'G4', 'A4', 'D5'],
    'Dm': ['D3', 'A3', 'D4', 'E4', 'A4'],
    'Em': ['E3', 'D4', 'E4', 'G4', 'D5'],
    'C': ['C4', 'G4', 'C5', 'D5', 'E5'],
}
BASS = {'Am': 'A2', 'G': 'G2', 'Dm': 'D2', 'Em': 'E2', 'C': 'C3'}
PAD = {'Am': ['A3', 'E4'], 'G': ['G3', 'D4'], 'Dm': ['D3', 'A3'], 'Em': ['E3', 'D4'], 'C': ['C4', 'G4']}

SPARSE = [(0, 0, 1.0), (1, 1, 0.75), (3, 2, 0.85), (4, 3, 0.8), (6, 2, 0.7)]          # (eighth, voice, vel)
FLOW = [(0, 0, 1.0), (1, 1, 0.7), (2, 2, 0.8), (3, 3, 0.75), (4, 4, 0.85), (5, 3, 0.7), (6, 2, 0.75), (7, 1, 0.65)]

MELODY = [  # (note or None, beats) bar by bar
    [(None, 4)],
    [(None, 2), ('E4', 1), ('G4', 1)],
    [('A4', 3), ('G4', 0.5), ('A4', 0.5)],
    [('D5', 2), ('C5', 1), ('A4', 1)],
    [('C5', 3), ('A4', 1)],
    [('D5', 4)],
    [('E5', 2), ('D5', 1), ('C5', 0.5), ('D5', 0.5)],
    [('E5', 3), (None, 1)],
    # B
    [('G5', 2), ('E5', 1), ('G5', 1)],
    [('A5', 2), ('G5', 1), ('D5', 1)],
    [('E5', 3), ('D5', 0.5), ('C5', 0.5)],
    [('A4', 3), (None, 1)],
    [('C5', 1), ('D5', 1), ('E5', 1), ('G5', 1)],
    [('A5', 2), ('C6', 1), ('A5', 1)],
    [('G5', 2), ('E5', 1), ('D5', 1)],
    [('E5', 4)],
    # A'
    [(None, 1), ('A4', 1), ('C5', 1), ('E5', 1)],
    [('D5', 3), ('C5', 0.5), ('A4', 0.5)],
    [('C5', 2), ('A4', 1), ('G4', 1)],
    [('A4', 1.5), ('G4', 0.5), ('E4', 2)],
    [('A4', 4)],
    [('G4', 2), ('A4', 1), ('C5', 1)],
    [('D5', 2), ('C5', 1), ('A4', 1)],
    [('G4', 2), ('E4', 2)],
]
assert len(MELODY) == BARS and all(abs(sum(b for _, b in bar) - 4) < 1e-9 for bar in MELODY)


def jitter(ms=7.0):
    return rng.normal(0, ms / 1000)


for bar, chord in enumerate(CHORDS):
    t0 = bar * 4 * BEAT
    section = 'A' if bar < 8 else 'B' if bar < 16 else 'C'
    voices = VOICING[chord]
    pattern = FLOW if (section == 'B' or (section == 'C' and bar < 22 and bar % 2 == 1)) else SPARSE
    for eighth, v, vel in pattern:
        f = hz(voices[v])
        t60 = 2.6 if f < 300 else 1.9 if f < 600 else 1.4
        add('koto', t0 + eighth * BEAT / 2 + jitter(), pluck(f, 2.8, t60, 0.55, vel * rng.uniform(0.85, 1.0)))
    # a soft grace-note flourish (koto 'hiki-iro' feel) at the end of each 4-bar phrase
    if bar % 4 == 3:
        for k, name in enumerate(reversed(voices[2:])):
            add('koto', t0 + 3.5 * BEAT + k * 0.09, pluck(hz(name), 2.0, 1.3, 0.6, 0.45))

    add('bass', t0 + jitter(4), pluck(hz(BASS[chord]), 3.5, 3.2, 0.1, 1.0))
    if section == 'B':
        add('bass', t0 + 2 * BEAT + jitter(4), pluck(hz(BASS[chord]), 2.5, 2.4, 0.1, 0.7))
    add('pad', t0, pad([hz(n) for n in PAD[chord]], 4 * BEAT, 1.0))

    # taiko
    hits = {'A': [(0, 0.75, True), (2, 0.4, True)],
            'B': [(0, 0.85, True), (1.5, 0.4, False), (2, 0.6, True), (3.5, 0.35, False)],
            'C': [(0, 0.7, True), (2, 0.4, True)]}[section]
    if bar in (7, 15):
        hits = hits + [(3, 0.35, False), (3.5, 0.45, False)]
    if bar == 23:
        hits = [(0, 0.65, True), (2, 0.4, True), (3, 0.3, False), (3.5, 0.38, False)]
    for beat, vel, big in hits:
        add('taiko', t0 + beat * BEAT + jitter(3), taiko(vel, big))
    if section == 'B':
        for beat in (1, 3):
            add('tick', t0 + beat * BEAT + jitter(3), tick(0.5))

    # flute melody
    pos = 0.0
    for name, beats in MELODY[bar]:
        if name:
            add('flute', t0 + pos * BEAT + jitter(10), flute(hz(name), beats * BEAT * 0.96, rng.uniform(0.9, 1.0)))
        pos += beats


# ------------------------------------------------------------------ mix, reverb, loop
def norm(x):
    return x / (np.max(np.abs(x)) + 1e-9)


mix = (0.46 * norm(buf['koto']) + 0.27 * norm(buf['flute']) + 0.34 * norm(buf['taiko'])
       + 0.30 * norm(buf['bass']) + 0.10 * norm(buf['pad']) + 0.05 * norm(buf['tick']))

ir_n = int(2.6 * SR)
t = np.arange(ir_n) / SR
ir = rng.normal(0, 1, ir_n) * np.exp(-t * 6.9 / 2.1)
ir = lowpass(ir, 4200, 1)
ir[: int(0.018 * SR)] = 0                      # pre-delay
ir /= np.sqrt(np.sum(ir ** 2))
wet = fftconvolve(mix, ir)[: len(mix)]
song = 0.78 * mix + 0.30 * wet / (np.max(np.abs(wet)) + 1e-9) * np.max(np.abs(mix))

# seamless loop: fold everything after the loop end back onto the start
loop = song[:LOOP].copy()
loop[: len(song) - LOOP] += song[LOOP:]

# gentle tone shaping: a little less low rumble and top
loop = sosfilt(butter(1, 45, 'high', fs=SR, output='sos'), np.concatenate([loop[-SR:], loop]))[SR:]

# 44.1 -> 22.05 kHz, circular (no click at the loop point)
pad_n = 4000
ext = np.concatenate([loop[-pad_n:], loop, loop[:pad_n]])
low = resample_poly(ext, 1, 2)[pad_n // 2: pad_n // 2 + LOOP // 2]

# level: about -18 dBFS RMS, peaks under -1.5 dBFS (soft knee)
rms = np.sqrt(np.mean(low ** 2))
low *= 10 ** (-18 / 20) / rms
ceiling = 10 ** (-1.5 / 20)
over = np.abs(low) > ceiling * 0.8
knee = ceiling * 0.8
low = np.where(over, np.sign(low) * (knee + (ceiling - knee) * np.tanh((np.abs(low) - knee) / (ceiling - knee))), low)

pcm = np.clip(np.round(low * 32767 + rng.uniform(-0.5, 0.5, len(low)) + rng.uniform(-0.5, 0.5, len(low))), -32768, 32767).astype('<i2')
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR // 2)
    w.writeframes(pcm.tobytes())

peak_db = 20 * np.log10(np.max(np.abs(pcm)) / 32768)
rms_db = 20 * np.log10(np.sqrt(np.mean((pcm / 32768.0) ** 2)))
seam = abs(int(pcm[-1]) - int(pcm[0]))
print(f'wrote {sys.argv[1]}: {len(pcm) / (SR // 2):.2f} s, peak {peak_db:.1f} dBFS, rms {rms_db:.1f} dBFS, seam step {seam}')

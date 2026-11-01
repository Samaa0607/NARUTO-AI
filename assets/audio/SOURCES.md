# SHINOBI AI — sound effect sources & licenses

> **2026-11-01:** 12 sound effects were added (per-jutsu hand-sign accents, charges, impacts, the
> Shadow Clone duplication and a Rasengan energy loop): see **"Added 2026-11-01"** at the end of this
> file. `ASSET_LICENSES.md` lists all 32 audio files with source, creator, licence, attribution and
> commercial-use terms. **Later the same day 15 sound effects were upgraded by layering** (see "Upgraded 2026-11-01", the last section).

Licenses were read on each item's own page on **2026-10-30**. Every sound is a generic sound effect:
no Naruto/anime audio, no dialogue, no soundtrack, nothing ripped from games or films. All files were
downloaded directly from **OpenGameArt.org** (no login). Two of them are OGA re-uploads of Freesound
sounds, so their original Freesound pages were checked as well (both CC0).

**License summary:** 16 files are **CC0** (public domain, no attribution needed). 3 files are **CC BY**
(attribution required, see the credits block below). There are **no** CC BY-SA, NC or ND files.

All delivered files are **16-bit PCM WAV, 44.1 kHz** (mono or stereo). Format conversions and edits are
listed per file. They were done with Python (stdlib `wave`/`aifc`, numpy, scipy) and the Windows built-in
Media Foundation decoder. No external tools were installed.

License links:
CC0 1.0 = https://creativecommons.org/publicdomain/zero/1.0/ ·
CC BY 3.0 = https://creativecommons.org/licenses/by/3.0/ ·
CC BY 4.0 = https://creativecommons.org/licenses/by/4.0/

---

## Rasengan

| project file | cue | original title / filename | author | source page URL | license (+ link) | attribution text required | modifications |
|---|---|---|---|---|---|---|---|
| `rasengan/chakra_charge.wav` | chakra charge (rising hum) | "Force field electric hum" — `hjm-shield_hum_50.wav` | Hansjörg Malthaner (OGA user *Varkalandar*) | https://opengameart.org/content/force-field-electric-hum | **CC BY 4.0** — https://creativecommons.org/licenses/by/4.0/ (the item is offered under CC-BY 4.0 / CC-BY 3.0 / CC-BY-SA 4.0 / CC-BY-SA 3.0 / OGA-BY 3.0; **used under CC BY 4.0**, so no ShareAlike obligation) | **YES.** The author asks: "please state my name, Hansjörg Malthaner, and link here: http://opengameart.org/users/varkalandar". See credits block. | none (byte-identical copy). 10 s; the hum's volume rises over about 4.5 s, then holds. |
| `rasengan/spin_loop.wav` | spinning energy loop | "Air whoosh" — `whoosh2.wav` ("Needed a nunchuk type sound so made this loop") | pyranostudios | https://opengameart.org/content/air-whoosh | CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/ | none | Loop seam smoothed: 50 ms equal-power crossfade of the tail into the head (5.25 s → 5.20 s). Peak-normalised from −10.2 to −1 dBFS. |
| `rasengan/release_whoosh.wav` | release / whoosh | "Wind, hit, time morph" — `qubodup-timehitwind.zip` → `qubodup-megaswosh1.wav` | qubodup | https://opengameart.org/content/wind-hit-time-morph | CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/ | none | none (byte-identical copy) |
| `rasengan/impact.wav` | impact | "Electricity Game Sound Pack" — `deathboom.wav` | faxcorp | https://opengameart.org/content/electricity-game-sound-pack | CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/ | none | none (byte-identical copy). 6.9 s deep boom with a long tail; fade it out in code if you need it shorter. |

## Chidori

| project file | cue | original title / filename | author | source page URL | license (+ link) | attribution text required | modifications |
|---|---|---|---|---|---|---|---|
| `chidori/lightning_charge.wav` | lightning charge | "Electricity Game Sound Pack" — `charge.wav` | faxcorp | https://opengameart.org/content/electricity-game-sound-pack | CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/ | none | none (byte-identical copy). A steady electric buzz, not a rising one (see Missing / manual). |
| `chidori/crackle_loop.wav` | electric crackle / sparks loop | "Electricity Game Sound Pack" — `snaploop.wav` | faxcorp | https://opengameart.org/content/electricity-game-sound-pack | CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/ | none | none (byte-identical copy). Already loops seamlessly. |
| `chidori/activation_zap.wav` | activation zap | "Electricity Sound Effects" — `spark.wav` (recorded from a small Tesla generator) | BMacZero (Brian MacIntosh) | https://opengameart.org/content/electricity-sound-effects-0 | CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/ | none (page: "Optionally credit Brian MacIntosh") | Trimmed 113 ms of leading silence (plus a 2 ms fade-in) to reduce latency. |
| `chidori/impact.wav` | impact | "Electricity Game Sound Pack" — `hit.wav` | faxcorp | https://opengameart.org/content/electricity-game-sound-pack | CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/ | none | none (byte-identical copy) |

## Fire Style

| project file | cue | original title / filename | author | source page URL | license (+ link) | attribution text required | modifications |
|---|---|---|---|---|---|---|---|
| `fire_style/prepare_inhale.wav` | preparation (inhale / whoosh) | "Wind, hit, time morph" — `qubodup-timehitwind.zip` → `qubodup-slomo1.wav` (a slowed swoosh that swells up) | qubodup | https://opengameart.org/content/wind-hit-time-morph | CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/ | none | none (byte-identical copy) |
| `fire_style/ignition.wav` | ignition | "Flare ignition" — `ignition.flac` (sped-up matchstick ignition) | qubodup | https://opengameart.org/content/flare-ignition | CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/ | none | Converted from 24-bit FLAC to 16-bit PCM WAV (Windows Media Foundation decoder). No other edits. |
| `fire_style/flame_burst.wav` | flame release / burst | "Fireball" — `105016__julien-matthey__jm-fx-fireball-01.wav` (Freesound title "JM_FX_Fireball 01.wav") | Julien Matthey (uploaded to OGA by *diligentcircle*) | https://opengameart.org/content/fireball-1 (original: https://freesound.org/people/Julien%20Matthey/sounds/105016/, also CC0) | CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/ | none | none (byte-identical copy) |
| `fire_style/burning_loop.wav` | burning loop | "Fire Loop" — `qubodupFireLoop.flac` | qubodup | https://opengameart.org/content/fire-loop | **CC BY 3.0** — https://creativecommons.org/licenses/by/3.0/ | **YES.** The page's attribution instruction is "qubodup". See credits block. | Converted from FLAC (96 kHz) to WAV. Loop seam smoothed with a 51.9 ms equal-power crossfade (5.02 s → 4.97 s). Resampled 96 → 44.1 kHz (polyphase, circular, so it still loops seamlessly). −0.05 dB gain to avoid clipping. |

## Shadow Clone

| project file | cue | original title / filename | author | source page URL | license (+ link) | attribution text required | modifications |
|---|---|---|---|---|---|---|---|
| `shadow_clone/seal_charge.wav` | seal completed / chakra charge | "Level up, power up, Coin get (13 Sounds)" — `SoundPack01.zip` → `Upper01.aif` | wobbleboxx ("WobbleBoxx Workshop") | https://opengameart.org/content/level-up-power-up-coin-get-13-sounds | CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/ | none (optional: "WobbleBoxx Workshop") | Converted from 24-bit AIFF to 16-bit PCM WAV. No other edits. |
| `shadow_clone/smoke_poof.wav` | smoke poof | "Poof Noises" — `poofs.zip` → `poof_1.wav` | dklon | https://opengameart.org/content/poof-noises | **CC BY 3.0** — https://creativecommons.org/licenses/by/3.0/ | **YES.** The author asks: "credit me as dklon somewhere". See credits block. | none (byte-identical copy) |
| `shadow_clone/clone_appear.wav` | clone appear | "Teleport" — `172206__fins__teleport.wav` | fins (Freesound account now shown as *Leszek_Szary*; uploaded to OGA by *diligentcircle*) | https://opengameart.org/content/teleport (original: https://freesound.org/people/fins/sounds/172206/, also CC0) | CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/ | none | none (byte-identical copy) |
| `shadow_clone/clone_disappear.wav` | clone disappear | "Erase / Escape" — `erase.wav` ("airy sound ... an enemy escaping") | Fupi | https://opengameart.org/content/erase-escape | CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/ | none | Peak-normalised from −16.0 to −1 dBFS. |

## UI

| project file | cue | original title / filename | author | source page URL | license (+ link) | attribution text required | modifications |
|---|---|---|---|---|---|---|---|
| `ui/step_success.wav` | step success tick | "63 Digital sound effects (lasers, phasers, space etc.)" — `Digital_SFX_Set.zip` → `highUp.mp3` | Kenney (www.kenney.nl) | https://opengameart.org/content/63-digital-sound-effects-lasers-phasers-space-etc | CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/ | none (optional: "Kenney.nl") | Converted MP3 to 16-bit WAV (the page says WAV, but the zip contains MP3s). Trimmed 104 ms of leading silence (plus a 2 ms fade-in). Peak-normalised from −22.8 to −3 dBFS. |
| `ui/sequence_failed.wav` | sequence failed | same pack — `Digital_SFX_Set.zip` → `zapThreeToneDown.mp3` | Kenney (www.kenney.nl) | https://opengameart.org/content/63-digital-sound-effects-lasers-phasers-space-etc | CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/ | none (optional: "Kenney.nl") | Converted MP3 to 16-bit WAV. Trimmed 57 ms of leading silence (plus a 2 ms fade-in). Peak-normalised from −24.6 to −3 dBFS. |
| `ui/mode_switch.wav` | mode switch | "51 UI sound effects (buttons, switches and clicks)" — `UI_SFX_Set.zip` → `switch2.wav` | Kenney (www.kenney.nl) | https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks | CC0 1.0 — https://creativecommons.org/publicdomain/zero/1.0/ | none (optional: "Kenney.nl") | none (byte-identical copy) |

---

## Credits block (copy into README / about screen)

```
Sound effects
- "Force field electric hum" by Hansjörg Malthaner (http://opengameart.org/users/varkalandar),
  https://opengameart.org/content/force-field-electric-hum, licensed CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/). Unmodified.
- "Fire Loop" by qubodup, https://opengameart.org/content/fire-loop, licensed CC BY 3.0
  (https://creativecommons.org/licenses/by/3.0/). Modified: converted to WAV, resampled to 44.1 kHz,
  loop seam crossfaded.
- "Poof Noises" (poof_1.wav) by dklon, https://opengameart.org/content/poof-noises, licensed CC BY 3.0
  (https://creativecommons.org/licenses/by/3.0/). Unmodified.
- Other sounds: CC0 / public domain, via OpenGameArt.org, by faxcorp, pyranostudios, qubodup,
  BMacZero (Brian MacIntosh), Julien Matthey, wobbleboxx (WobbleBoxx Workshop), fins, Fupi and
  Kenney (www.kenney.nl). Credit for these is optional.
```

## Technical notes

| file | length | channels | type | RMS (dBFS) |
|---|---|---|---|---|
| rasengan/chakra_charge.wav | 10.00 s | mono | one-shot (rises, then holds) | −10 |
| rasengan/spin_loop.wav | 5.20 s | stereo | **seamless loop** | −18 |
| rasengan/release_whoosh.wav | 0.53 s | stereo | one-shot | −21 |
| rasengan/impact.wav | 6.92 s | stereo | one-shot | −23 |
| chidori/lightning_charge.wav | 4.13 s | stereo | one-shot | −20 |
| chidori/crackle_loop.wav | 4.94 s | mono | **seamless loop** | −30 |
| chidori/activation_zap.wav | 0.22 s | mono | one-shot | −29 |
| chidori/impact.wav | 2.21 s | stereo | one-shot | −27 |
| fire_style/prepare_inhale.wav | 0.97 s | stereo | one-shot | −21 |
| fire_style/ignition.wav | 1.17 s | stereo | one-shot | −25 |
| fire_style/flame_burst.wav | 1.96 s | stereo | one-shot | −16 |
| fire_style/burning_loop.wav | 4.97 s | stereo | **seamless loop** | −12 |
| shadow_clone/seal_charge.wav | 3.44 s | stereo | one-shot | −29 |
| shadow_clone/smoke_poof.wav | 0.58 s | mono | one-shot | −23 |
| shadow_clone/clone_appear.wav | 0.53 s | mono | one-shot | −9 |
| shadow_clone/clone_disappear.wav | 1.20 s | stereo | one-shot | −22 |
| ui/step_success.wav | 0.38 s | mono | one-shot | −12 |
| ui/sequence_failed.wav | 1.21 s | mono | one-shot | −11 |
| ui/mode_switch.wav | 0.30 s | stereo | one-shot | −33 |

* Loudness varies (RMS from −33 to −9 dBFS), so set a per-cue gain in code (e.g. loops around 0.4–0.6).
* Playback with the current `.venv`: `scipy.io.wavfile.read()` (or stdlib `wave`) → numpy →
  `sounddevice.play()` / `sounddevice.OutputStream`. `soundfile`, `pygame` and `simpleaudio` are **not**
  installed. That is why everything here is WAV: the OGG alternatives below would need `soundfile` or `pygame`.
* All 19 files are plain PCM (format tag 1) and read correctly with both `wave` and `scipy.io.wavfile`.

---

## Missing / manual

**No cue is missing.** All 19 cues have a legally sourced file above. The items below are upgrades for the
weaker matches, sources that could not be fetched or opened automatically, and synthesis ideas.

### Weaker matches and what to do about them

* **`rasengan/spin_loop.wav`** is an air/whoosh loop with no tonal "energy" hum. Options: layer it in code
  with the held part of `chakra_charge.wav`; use one of the CC0 loops listed below; or *synthesize an
  original sound*. For that: 2–3 detuned saw/sine oscillators around 180–240 Hz with a 6–8 Hz tremolo, plus
  band-passed noise (0.8–2 kHz) whose cutoff follows the same LFO. Crossfade the loop ends.
* **`chidori/lightning_charge.wav`** is a steady buzz, not a rising one. Either ramp its gain in code over
  about 1.5 s, or *synthesize*: white noise band-passed at 2–6 kHz, chopped into random 2–20 ms bursts whose
  rate and level rise exponentially over 2 s, on top of a fading-in 100 Hz low-passed square-wave buzz.
* **`fire_style/flame_burst.wav`** is a fireball "whoomph" rather than a sustained flamethrower. Chain it
  into `burning_loop.wav`, or use the flamethrower options below (Kenney `thrusterFire_*`, Breviceps,
  scarbelly25).
* **`shadow_clone/smoke_poof.wav`** needs attribution (CC BY 3.0). A CC0 replacement could be
  *synthesized*: a ~300 ms pink-noise burst with a 5 ms attack and exponential decay, its low-pass cutoff
  sweeping 4 kHz → 400 Hz, plus a soft 80–100 Hz sine "thump" (about 50 ms).
* **`ui/step_success.wav`** is a short rising synth blip, not a mechanical "tick". For a literal tick, use
  Kenney Interface Sounds `tick_00x.ogg` (below) or *synthesize* a 40 ms 2 kHz sine blip with a 3 ms attack
  and exponential decay.

### Better-fit CC0 alternatives that are OGG-only (direct download, no login)

These were not used only because the project venv cannot decode OGG yet. Desktop Windows Media Foundation
on this machine cannot decode OGG either. They become drop-in options after `pip install soundfile` (or
pygame).

* Kenney **"Sci-Fi Sounds"**, CC0: https://opengameart.org/content/sci-fi-sounds (same pack at
  https://kenney.nl/assets/sci-fi-sounds). Useful files: `thrusterFire_000–004.ogg` (flamethrower);
  `engineCircular_000–004.ogg` and `spaceEngine*.ogg` (spin loop); `forceField_000–004.ogg` (charge);
  `explosionCrunch_*.ogg` and `lowFrequency_explosion_*.ogg` (impacts).
* Kenney **"Interface Sounds"**, CC0: https://opengameart.org/content/interface-sounds (also
  https://kenney.nl/assets/interface-sounds). Useful files: `tick_00x`, `confirmation_00x`, `error_00x`,
  `switch_00x`, `toggle_00x`.
* zeroisnotnull **"Seamless Energy Emission Loop"**, CC0:
  https://opengameart.org/content/seamless-energy-emission-loop. Made for a flying energy ball, so it is
  ideal as a Rasengan loop.
* themightyglider **"Catching fire"**, CC0: https://opengameart.org/content/catching-fire (ignition
  alternative).
* Note: kenney.nl answered **HTTP 403** to automated requests, and this was **not** bypassed. Download from
  kenney.nl in a browser, or use the OGA mirrors above, which Kenney uploaded himself.

### Archives that could not be opened automatically (LZMA `.7z`; extract manually with 7-Zip)

* JC Sounds **"Fantasy SFX Pack Vol 1"**, **CC BY 4.0** (credit "JC Sounds"):
  https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1. Contains fire / ice / electric spell
  build-ups, launches, impacts and loops, plus teleport in/out. It is probably the best single-source
  upgrade for all four jutsu.
* JC Sounds **"Sci-Fi Pack Vol 1"**, **CC BY 4.0**: https://opengameart.org/content/jc-sounds-sci-fi-pack-vol-1
  (energy build-up / power-down sounds for the charge cues).
* qubodup **"Ice & Electricity Magic"**, **CC BY 3.0**: https://opengameart.org/content/ice-electricity-magic
* MouseBYTE **"Chimey UI Sounds"**, CC0: https://opengameart.org/content/chimey-ui-sounds (confirm/cancel
  chimes).

### Freesound (license checked on each sound's page; downloading requires a free account, not attempted)

| sound | page | license | possible use |
|---|---|---|---|
| "Blast + Flamethrower cooldown" by Breviceps | https://freesound.org/people/Breviceps/sounds/447941/ | CC0 | flame burst |
| "flamewind.wav" by scarbelly25 | https://freesound.org/people/scarbelly25/sounds/33943/ | CC0 | sustained flamethrower / roar (~11 s) |
| "Gas Torch Light" by SyntaxSeed | https://freesound.org/people/SyntaxSeed/sounds/244229/ | CC0 | ignition |
| "Gas Torch Burn" by SyntaxSeed | https://freesound.org/people/SyntaxSeed/sounds/244230/ | CC0 | burning loop |
| "Power Charge" by crashoverride6 | https://freesound.org/people/crashoverride6/sounds/193610/ | CC0 | rising charge (~9 s): chakra or lightning charge |
| "Charge up" by SamsterBirdies | https://freesound.org/people/SamsterBirdies/sounds/483883/ | CC0 | short charge-up / seal completed |
| "Vortex.wav" by BaDoink | https://freesound.org/people/BaDoink/sounds/567241/ | CC0 | Rasengan spin (~6 s) |

### Other synthesis ideas (fully original, no license questions)

* **Crackle (Chidori):** band-passed white-noise clicks (3–8 kHz) with 1–5 ms exponential decay, fired at
  random (Poisson, 30–80 per second), over a quiet 100 Hz buzz.
* **Chakra charge:** a 110 Hz sine plus two harmonics, gliding up one octave over 2 s while the gain rises
  exponentially, with a little noise mixed in.
* **Sequence failed:** two descending square-ish tones (440 → 330 Hz, 120 ms each), low-passed at 3 kHz.

---

## Background music

| project file | use | title | author | source | license | attribution required | edits |
|---|---|---|---|---|---|---|---|
| `music/leaf_trail_loop.flac` | soft background loop of the web app (`frontend/src/konoha/music`) | "Leaf Trail" | SHINOBI AI (composed and synthesised for this project on 2026-10-31) | original work: no samples, no recordings, no third-party audio | project's own work (no third-party licence involved) | none | — |

**How it was made.** Composed and rendered from scratch with Python (numpy/scipy) by
`music/compose_leaf_trail.py` (`python compose_leaf_trail.py out.wav` re-renders the 22.05 kHz master,
fixed seed 20261031):

* A minor pentatonic (Japanese *min'yō* scale), 90 BPM, 24 bars = **64.0 s**, progression
  i–VII–iv–v with a brighter middle section (C–G–Am–Em).
* Instruments, all synthesised: koto-like plucks (Karplus-Strong strings with a pluck-position comb and
  a soft plectrum click), a breathy bamboo-flute melody (additive tone with a scooped attack, delayed
  vibrato and band-passed breath noise), soft taiko (pitch-dropping sine + skin noise), a few shime-daiko
  rim ticks in the middle section, a low plucked bass and a very quiet pad.
* Synthetic convolution reverb (2.1 s), then the reverb tail and the last notes are folded back onto the
  start so the file **loops seamlessly**; 44.1 → 22.05 kHz circular resampling, level about −18 dBFS RMS
  (peaks −2.2 dBFS). The app plays it quietly (default music volume 30 % × master volume 80 %).
* Delivered as **FLAC** (lossless; 44.1 kHz mono 16-bit, 2.7 MB), encoded with the Windows Media
  Foundation FLAC encoder from the 22.05 kHz master. FLAC instead of WAV keeps the "19 sound effects"
  count of `tests/test_server.py` and has no encoder delay, so the loop stays gapless. The player decodes
  it once and loops it with Web Audio (sample-accurate).

**Licensed tracks considered first (2026-10-31, OpenGameArt.org, license read on each item's page).**
"Samurai" by TAD (CC BY 4.0, koto and taiko), "Ninja Theme" by Spring Spring (CC0, chiptune, "reminds me of
the theme to Double Dragon 3"), "Oriental" by Shadowfire452 (CC0, short sketch) and "Menu Music" by wipics
(CC0, "inspired by the Club Penguin dojo music"). None was used: the mood could not be auditioned here,
none is a soft seamless loop, and the last two point at other works. An original loop avoids every
licensing question. No Naruto soundtrack, anime audio or other copyrighted recording is used.

---

## Character voice clips

**None installed (2026-11-01).** No original Naruto / Sasuke voice recording is legally available for
this app (research and the permissions needed: `voice/README.md`). The web app has a slot for each of
these 8 clips (WAV only: the server times the activation from their lengths) and plays them only after
the backend fires the jutsu. Check them with `python tools/check_voices.py`.

| file | speaker | line |
|---|---|---|
| `voice/fire_style/activation.wav` | Naruto | activation shout |
| `voice/fire_style/name.wav` | Naruto | "Katon: Gōkakyū no Jutsu!" |
| `voice/chidori/activation.wav` | Sasuke | activation / charging call |
| `voice/chidori/name.wav` | Sasuke | "Chidori!" |
| `voice/shadow_clone/activation.wav` | Naruto | hand-sign shout |
| `voice/shadow_clone/name.wav` | Naruto | "Kage Bunshin no Jutsu!" |
| `voice/rasengan/activation.wav` | Naruto | charging shout |
| `voice/rasengan/name.wav` | Naruto | "Rasengan!" |

Add a row per clip to `ASSET_LICENSES.md` when a licensed recording is added. Anime, game or film audio
and synthetic copies of the original voice actors are not allowed without the rights holders' permission.

---

## Added 2026-11-01

Licences read on each item's page on 2026-11-01; all downloaded directly from OpenGameArt.org (no
login). OGG files were decoded with the Edge browser's own audio decoder (Web Audio `decodeAudioData`)
and written as 16-bit PCM WAV, 44.1 kHz; nothing was installed. 8 files are CC0, 4 are CC BY 4.0
(leohpaz: attribution required, see `ASSET_LICENSES.md`).

| project file | cue | original title / filename | author | source page URL | license | attribution text required | modifications |
|---|---|---|---|---|---|---|---|
| `fire_style/hand_sign.wav` | Fire Style hand-sign accent (flame flick) | "80 CC0 RPG SFX" — `spell_fire_06.ogg` | rubberduck | https://opengameart.org/content/80-cc0-rpg-sfx | CC0 1.0 | none | OGG → WAV; peak-normalised −11.6 → −1 dBFS |
| `chidori/hand_sign.wav` | Chidori hand-sign accent (electric chirp) | "Sci-Fi Sounds" — `laserSmall_001.ogg` | Kenney | https://opengameart.org/content/sci-fi-sounds | CC0 1.0 | none (optional: Kenney) | OGG → WAV |
| `shadow_clone/hand_sign.wav` | Shadow Clone hand-sign accent (hand swish) | "Swishes Sound Pack" — `swish-3.wav` | artisticdude | https://opengameart.org/content/swishes-sound-pack | CC0 1.0 | none | 24 → 16-bit; 24 ms leading silence trimmed |
| `rasengan/hand_sign.wav` | Rasengan hand-sign accent (gust) | "100 CC0 SFX #2" — `sfx100v2_air_03.ogg` | rubberduck | https://opengameart.org/content/100-cc0-sfx-2 | CC0 1.0 | none | OGG → WAV |
| `fire_style/charge_rise.wav` | Fire Style charge (rising flame) | "80 CC0 RPG SFX" — `spell_fire_05.ogg` | rubberduck | https://opengameart.org/content/80-cc0-rpg-sfx | CC0 1.0 | none | OGG → WAV; 38 ms trimmed; peak-normalised −19.5 → −1 dBFS |
| `shadow_clone/charge_chakra.wav` | Shadow Clone charge (chakra gathering) | "Magic Spell SFX" — `magical_1_0.ogg` | jaggedstone | https://opengameart.org/content/magic-spell-sfx | CC0 1.0 | none | OGG → WAV; 18 ms trimmed |
| `rasengan/charge_magic.wav` | Rasengan charge | "8 Magic Attacks" — `45_Charge_05.wav` | leohpaz | https://opengameart.org/content/8-magic-attacks | **CC BY 4.0** | **YES** (credits block in `ASSET_LICENSES.md`) | 24 → 16-bit |
| `fire_style/impact.wav` | Fire Style impact (fire explosion) | "8 Magic Attacks" — `04_Fire_explosion_04_medium.wav` | leohpaz | https://opengameart.org/content/8-magic-attacks | **CC BY 4.0** | **YES** | 24 → 16-bit; peak-normalised −13.0 → −1 dBFS |
| `chidori/thunder_impact.wav` | Chidori electric impact (thunder) | "8 Magic Attacks" — `18_Thunder_02.wav` | leohpaz | https://opengameart.org/content/8-magic-attacks | **CC BY 4.0** | **YES** | 24 → 16-bit; peak-normalised −13.3 → −1 dBFS |
| `rasengan/wind_impact.wav` | Rasengan impact (wind burst) | "8 Magic Attacks" — `25_Wind_01.wav` | leohpaz | https://opengameart.org/content/8-magic-attacks | **CC BY 4.0** | **YES** | 24 → 16-bit; peak-normalised −7.2 → −1 dBFS |
| `shadow_clone/duplicate.wav` | Shadow Clone duplication | "Teleport Spell" — `teleport.wav` | ogrebane | https://opengameart.org/content/teleport-spell | CC0 1.0 | none | 26 ms leading silence trimmed |
| `rasengan/energy_loop.wav` | Rasengan energy loop (replaces `spin_loop.wav`) | "Seamless Energy Emission Loop" — `movingshield_sound.ogg` | zeroisnotnull | https://opengameart.org/content/seamless-energy-emission-loop | CC0 1.0 | none | OGG → WAV; 40 ms equal-power seam crossfade |

`shadow_clone/seal_charge.wav` and `rasengan/spin_loop.wav` are kept but no longer played (replaced by
`charge_chakra.wav` and `energy_loop.wav`).

## Added 2026-11-01 (later): jutsu sequence music and the hand-seal sound

Downloaded directly from OpenGameArt.org (plain HTTP, no login), licence read on each item's page and, for the
taiko loop, on the Freesound page of its original recording (CC BY 3.0). Decoded by Edge's own decoder (the
machine has no MP3 / Ogg tools), edited with numpy/scipy, written as 16-bit PCM WAV. Full rows and the credits
block: `ASSET_LICENSES.md`. **None of this is the original Naruto soundtrack** (not legally available: see
`ASSET_LICENSES.md`, "Not used, and why").

| project file | role | original title / filename | author | licence | modifications |
|---|---|---|---|---|---|
| `jutsu_music/rasengan.wav` | music while Rasengan's signs are made | "Blackmoor Ninjas (Battle Theme)" — `Blackmoor Ninjas (No Vocals).mp3` | Matthew Pablo | **CC BY 3.0** | 16 bars at 136 BPM (42.471–70.665 s) made a seamless loop, 28.2 s |
| `jutsu_music/fire_style.wav` | music while Fire Style's signs are made | "Taiko drums (seamless loop)" — `taiko-drums_0.ogg` (from jobro's "Taiko drums.wav") | congusbongus / jobro | **CC BY 3.0** | 16 bars at 93 BPM (115.937–157.104 s) made a seamless loop, 41.2 s |
| `jutsu_music/chidori.wav` | music while Chidori's signs are made | "Revenge" — `Revenge_0.mp3` | TAD | **CC BY 4.0** | 16 bars at 105 BPM (130.301–166.849 s) made a seamless loop, 36.5 s |
| `jutsu_music/shadow_clone.wav` | music while Shadow Clone's signs are made | "Samurai" — `Samurai_0.mp3` | TAD | **CC BY 4.0** | 24 bars at 120 BPM (16.013–64.006 s) made a seamless loop, 48.0 s |
| `ui/hand_seal.wav` | the hand-seal sound of every confirmed step | "Thwack Sounds" — `thwack-03.wav`, `thwack-01.wav` + "Fabric Rustling" — `rustling.ogg` | Jordan Irwin (AntumDeluge), iochi-glaucus | CC0 1.0 | cloth swish (0–190 ms) into a slap at 85 ms, 0.38 s |

Technical notes:
* Loops: the tempo and beat grid come from the onset envelope (autocorrelation); a section of 16 or 24 whole bars
  was chosen where the level is even, starting and ending on strong downbeats away from the intro and the ending.
  The audio that followed the section's end is crossfaded (equal power, one beat) into its start, so the file
  loops without a gap or a click (the jump at the seam is smaller than the track's own sample-to-sample steps).
  Stereo, 44.1 kHz, 16-bit, peaks at or below −1 dBFS.
* Levels (whole loop, RMS): rasengan −14.8, fire_style −17.6, chidori −15.4, shadow_clone −18.6 dBFS. The app
  evens them out (`frontend/src/audio/jutsuMusic.ts`, `TRACKS[].gain`) and plays them under the "Music" volume,
  about 12 dB under the sound effects and voices at the default settings.
* Hand seal: loudest 100 ms −14.1 dBFS, peak −1 dBFS, mono 44.1 kHz.

---

## Upgraded 2026-11-01: game-style layered jutsu sounds

15 sound effects were rebuilt by **layering** the files above with new licensed sources (and a few
synthesised layers), so each step, charge and release sounds fuller and punchier. File names, format
(16-bit PCM WAV, 44.1 kHz, same channel count) and loudness are unchanged, so no code changed. Rows of
the tables above that describe these 15 files describe their main layer; the full layer list of each
file is below and in `ASSET_LICENSES.md`. The previous versions are kept outside the repo in
`C:\Users\user\Desktop\SHINOBI-AI_backup_20261101_sfx_originals\` (same folder structure).

**New sources** (licence read on each item's own OpenGameArt page on 2026-11-01, downloaded directly,
no login):

| source | file(s) used | author | source page | licence | attribution |
|---|---|---|---|---|---|
| "Fantasy SFX Pack Vol 1" (`fantasy_sfx_pack_vol_1.7z`, 58 WAV, extracted with py7zr) | Fireball_Buildup, Fireball_Hold (loop), Fireball Launch_01/03, Fireball Impact_01, Electric Spell_Buildup / _Hold (loop) / _Launch_01/02 / _Hit_02/03, Teleport_In / _Out, Magic Shield_Activation_02, Mana Drain_Start, Dagger_Swing_02, Sword_Swing_02, Heavy Sword_Swing_02 | JC Sounds | https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1 | **CC BY 4.0** — https://creativecommons.org/licenses/by/4.0/ | **YES**: the page says "CC BY 4.0 - Credit: JC Sounds" |
| "Sci-Fi Sounds" (`sci-fi_sounds.zip`, OGG, decoded with libsndfile) | thrusterFire_000/001/003/004, lowFrequency_explosion_000/001, explosionCrunch_000/002, engineCircular_002 | Kenney (www.kenney.nl) | https://opengameart.org/content/sci-fi-sounds | CC0 1.0 (pack `License.txt`: "Creative Commons Zero, CC0") | none (optional: "Kenney.nl") |
| synthesised here | noise puffs / rumbles (pink noise, swept low-pass), sine "thumps" (150 → 70 Hz, 110 → 55 Hz) | SHINOBI AI | — | project's own work | none |

No anime, game or film audio and no AI imitation of the anime's sounds is used: the synthesised layers are
plain filtered noise and sine sweeps.

**How they were mixed.** Python (numpy / scipy / soundfile / pyloudnorm, in a temporary folder outside the
repo). Layers are time-aligned on their attacks (leading silence trimmed, 1 ms fade-in per layer), EQ'd
(high/low/band-pass, shelves, peaking), and summed; charges are gain-ridden so they only rise. Each result is
then high-passed at 30 Hz, faded, and set to **the same loudest-400 ms level as the file it replaces**
(loudest 100 ms for the hand seal), so the per-cue gains in `frontend/src/audio/gains.ts` stay correct and the
balance with the music is unchanged. A soft limiter keeps every peak at or below −1 dBFS (lower where the cue's
gain is above 1: −2.6 for `chidori/hand_sign`, −1.9 for `smoke_poof`, −3.1 for `charge_chakra`).

| project file | role | layers (main layer first) | duration before → after | integrated LUFS before → after | loudest 400 ms (dBFS) before → after | peak (dBFS) before → after |
|---|---|---|---|---|---|---|
| `ui/hand_seal.wav` | every confirmed step | the CC0 seal (cloth swish → slap) + JC Dagger_Swing_02 air whoosh (HP 700 Hz) + synth 150 → 70 Hz thump under the slap + the slap's >2.5 kHz crack; +2.5 dB @ 3.2 kHz | 0.38 → 0.38 s | −18.8 → −17.9 | −19.8 → −19.7 (loudest 100 ms −14.1 → −14.1) | −1.0 → −2.6 |
| `fire_style/hand_sign.wav` | Fire Style step accent | rubberduck flame flick + Kenney thrusterFire_001 fwoosh (BP 250–4500 Hz, 130 ms decay) | 1.00 → 1.00 s | −16.2 → −17.0 | −18.7 → −18.7 | −1.0 → −2.2 |
| `fire_style/charge_rise.wav` | Fire Style charge | JC Fireball_Buildup + JC Fireball_Hold (×2, rising) + Kenney thrusterFire_003 roar (LP 500 → 7000 Hz) + synth low rumble; rising gain-ride, +2 dB low shelf | 1.21 → 2.30 s | −11.9 → −17.1 (it now rises over 2.3 s instead of peaking early) | −14.7 → −14.7 | −1.0 → −1.5 |
| `fire_style/flame_burst.wav` | Fire Style release | JC Fireball Launch_01 + Launch_03 + Julien Matthey fireball + Kenney thrusterFire_000 roar tail + Kenney lowFrequency_explosion_001 sub; +1.5 dB low shelf, −2 dB @ 450 Hz | 1.96 → 2.10 s | −12.4 → −10.7 | −10.1 → −10.2 | 0.0 → −1.7 |
| `fire_style/impact.wav` | Fire Style impact | leohpaz Fire explosion + JC Fireball Impact_01 + Kenney explosionCrunch_000 (HP 200 Hz) + Kenney lowFrequency_explosion_000 | 2.00 → 2.00 s | −14.9 → −14.8 | −11.8 → −11.8 | −1.0 → −1.8 |
| `chidori/hand_sign.wav` | Chidori step accent | Kenney laserSmall_001 chirp + JC Electric Spell_Hit_02 crackle (first 240 ms, HP 1.5 kHz) | 0.24 → 0.26 s | −18.2 → −17.8 | −21.9 → −21.9 | −2.5 → −3.4 |
| `chidori/lightning_charge.wav` | Chidori charge | faxcorp buzz + JC Electric Spell_Hold (pitch gliding ×0.85 → ×1.25) + JC Electric Spell_Buildup (×2) + JC Electric Spell_Launch_02; rising gain-ride, HP 70 Hz | 4.13 → 4.10 s | −16.7 → −16.4 | −16.3 → −16.3 | 0.0 → −1.6 |
| `chidori/thunder_impact.wav` | Chidori release | leohpaz Thunder + JC Electric Spell_Launch_01 (chirping crackle) + JC Electric Spell_Hit_03 + Kenney lowFrequency_explosion_001 | 2.67 → 2.67 s | −10.0 → −11.0 | −12.6 → −12.6 | −1.0 → −1.5 |
| `rasengan/hand_sign.wav` | Rasengan step accent | rubberduck gust + JC Sword_Swing_02 (BP 300–6000 Hz) | 0.28 → 0.32 s | −14.3 → −14.0 | −19.0 → −19.0 | −1.2 → −2.1 |
| `rasengan/charge_magic.wav` | Rasengan charge | leohpaz Charge + Kenney engineCircular_002 spinning hum speeding up (×0.6 → ×1.5, LP 900 → 9000 Hz) + Kenney thrusterFire_004 rising wind (BP 600–8000 Hz); rising gain-ride | 5.33 → 3.00 s (the charge phase lasts about 1.7 s) | −11.8 → −13.8 | −14.0 → −14.1 | −3.7 → −1.6 |
| `rasengan/release_whoosh.wav` | Rasengan release | qubodup megaswosh + JC Heavy Sword_Swing_02; +2 dB low shelf | 0.53 → 0.60 s | −14.1 → −15.1 | −16.2 → −16.3 | −0.5 → −1.8 |
| `rasengan/wind_impact.wav` | Rasengan impact | leohpaz Wind + Kenney lowFrequency_explosion_000 + Kenney explosionCrunch_002 (HP 150 Hz) + JC Magic Shield_Activation_02 flare | 2.00 → 2.00 s | −16.1 → −16.6 | −14.5 → −14.5 | −1.0 → −3.5 |
| `shadow_clone/charge_chakra.wav` | Shadow Clone charge | jaggedstone shimmer (abrupt end faded) + JC Mana Drain_Start swell + synth airy bed | 1.59 → 1.90 s | −22.0 → −22.0 | −22.8 → −22.8 | −10.3 → −10.4 |
| `shadow_clone/smoke_poof.wav` | each clone's smoke poof, ending | dklon poof + synth noise puff (LP 4.5 kHz → 300 Hz) + synth 110 → 55 Hz thump + JC Teleport_Out (first 0.5 s) | 0.58 → 0.58 s | −24.2 → −24.5 | −21.8 → −21.8 | −5.9 → −3.5 |
| `shadow_clone/duplicate.wav` | Shadow Clone release | ogrebane teleport + JC Teleport_In + synth smoke burst (LP 6 kHz → 250 Hz) + Kenney lowFrequency_explosion_001 | 1.60 → 1.60 s | −13.7 → −13.3 | −13.3 → −13.3 | −0.1 → −1.9 |

Not changed: `ignition.wav`, `prepare_inhale.wav`, `burning_loop.wav`, `crackle_loop.wav`, `activation_zap.wav`,
`chidori/impact.wav`, `rasengan/energy_loop.wav`, `rasengan/impact.wav`, `chakra_charge.wav`, `clone_appear.wav`,
`clone_disappear.wav`, `shadow_clone/hand_sign.wav`, the UI tones and all music.

Credit line to add to the in-app credits (CC BY 4.0):
"Fantasy SFX Pack Vol 1" by JC Sounds (https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1),
licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Modified: layered and mixed with other sounds.

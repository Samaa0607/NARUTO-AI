# SHINOBI AI — audio asset licences

Every audio file in `assets/audio/` with its source, creator and licence, as read on each item's own page
(the first 20 files on 2026-10-30/31, 12 files added on 2026-11-01, then the 4 jutsu sequence-music loops and
the hand-seal sound later on 2026-11-01; 15 sound effects were then upgraded by layering, see `SOURCES.md`,
"Upgraded 2026-11-01"). Details of the edits and levels: `SOURCES.md`. All downloads were
direct (no login, no bot check bypassed).

**37 files.**

| licence | files | attribution | commercial use |
|---|---|---|---|
| CC0 1.0 (public domain dedication) | 16 | not required (credit is optional) | allowed |
| CC BY 4.0 (or a mix of CC0 and CC BY 4.0 layers) | 16 | **required** (see the credits block) | allowed, with attribution |
| CC BY 3.0 (`smoke_poof.wav` also has a CC BY 4.0 layer) | 4 | **required** (see the credits block) | allowed, with attribution |
| project's own work | 1 (the music) | none | allowed |

There are no NC (non-commercial), ND (no derivatives) or SA (share-alike) audio files. CC0 and CC BY are
free licences: no fee is paid. Neither licence grants trademark or personality rights or implies
endorsement by the creator. This document does not call any file "royalty-free" beyond what its licence
says.

Licence texts: CC0 1.0 https://creativecommons.org/publicdomain/zero/1.0/ · CC BY 4.0
https://creativecommons.org/licenses/by/4.0/ · CC BY 3.0 https://creativecommons.org/licenses/by/3.0/

## Character voices: not installed, permission required

No original Naruto / Sasuke voice recording is included: none is legally available for this use. The
anime's audio belongs to its rights holders (©岸本斉史 スコット／集英社・テレビ東京・ぴえろ), and the voices are
the performances of Junko Takeuchi (Naruto) and Noriaki Sugiyama (Sasuke). The research, the 8 exact
file names and the permissions needed are in `voice/README.md`. When a licensed clip is added, give it a
row here: file, recording, source, owner, licence or written permission, restrictions.

## Fire Style (`fire_style/`)

| file | asset (original title / file) | source URL | creator | licence | attribution | commercial use | restrictions / notes | changes made |
|---|---|---|---|---|---|---|---|---|
| `hand_sign.wav` | mix: "80 CC0 RPG SFX" — `spell_fire_06.ogg` (flame flick) + Kenney "Sci-Fi Sounds" — `thrusterFire_001.ogg` (CC0) | https://opengameart.org/content/80-cc0-rpg-sfx · https://opengameart.org/content/sci-fi-sounds | rubberduck · Kenney | CC0 1.0 (both layers) | not required | allowed | none | **Upgraded 2026-11-01 (layered, see `SOURCES.md`):** the flame flick + a 0.6 s band-passed (250–4500 Hz) thruster fwoosh with a 130 ms decay; level-matched to the file it replaced (same loudest-400 ms level, so `gains.ts` is unchanged), peak ≤ −1 dBFS |
| `charge_rise.wav` | mix: JC Sounds "Fantasy SFX Pack Vol 1" — `Single_…_Fireball_Buildup.wav` (**CC BY 4.0**) + `Loop_…_Fireball_Hold.wav` + Kenney "Sci-Fi Sounds" — `thrusterFire_003.ogg` (CC0) + a synthesised low rumble | https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1 · https://opengameart.org/content/sci-fi-sounds | JC Sounds · Kenney | **CC BY 4.0** (JC Sounds layer) + CC0 | **required** ("JC Sounds") | allowed, with attribution | replaces rubberduck `spell_fire_05.ogg` (CC0, backed up) | **Upgraded 2026-11-01 (layered, see `SOURCES.md`):** 2.3 s fire build-up: the buildup, the fire loop (repeated, rising), the thruster roar under a low-pass opening 500 → 7000 Hz, a low rumble; gain-ridden so it only rises; +2 dB low shelf; level-matched to the file it replaced (same loudest-400 ms level, so `gains.ts` is unchanged), peak ≤ −1 dBFS |
| `impact.wav` | mix: "8 Magic Attacks" — `04_Fire_explosion_04_medium.wav` + JC Sounds "Fantasy SFX Pack Vol 1" — `Single_…_Fireball Impact_01.wav` (**CC BY 4.0**) + Kenney "Sci-Fi Sounds" — `explosionCrunch_000.ogg` (CC0) + `lowFrequency_explosion_000.ogg` | https://opengameart.org/content/8-magic-attacks · https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1 · https://opengameart.org/content/sci-fi-sounds | leohpaz · JC Sounds · Kenney | **CC BY 4.0** (leohpaz, JC Sounds) + CC0 | **required** | allowed | leohpaz: free samples of a larger paid pack; only these free files, under CC BY 4.0 | **Upgraded 2026-11-01 (layered, see `SOURCES.md`):** explosion + fireball impact + crunch (high-passed 200 Hz) + sub boom; level-matched to the file it replaced (same loudest-400 ms level, so `gains.ts` is unchanged), peak ≤ −1 dBFS |
| `prepare_inhale.wav` | "Wind, hit, time morph" — `qubodup-slomo1.wav` | https://opengameart.org/content/wind-hit-time-morph | qubodup | CC0 1.0 | not required | allowed | none | none |
| `ignition.wav` | "Flare ignition" — `ignition.flac` | https://opengameart.org/content/flare-ignition | qubodup | CC0 1.0 | not required | allowed | none | 24-bit FLAC → 16-bit WAV |
| `flame_burst.wav` | mix: "Fireball" — `105016__julien-matthey__jm-fx-fireball-01.wav` + JC Sounds "Fantasy SFX Pack Vol 1" — `Single_…_Fireball Launch_01.wav` (**CC BY 4.0**) + `…_Fireball Launch_03.wav` + Kenney "Sci-Fi Sounds" — `thrusterFire_000.ogg` (CC0) + `lowFrequency_explosion_001.ogg` | https://opengameart.org/content/fireball-1 · https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1 · https://opengameart.org/content/sci-fi-sounds | Julien Matthey · JC Sounds · Kenney | **CC BY 4.0** (JC Sounds layer) + CC0 | **required** ("JC Sounds") | allowed, with attribution | none | **Upgraded 2026-11-01 (layered, see `SOURCES.md`):** 2.1 s: the fireball, two fireball launches (roar + whoosh), a thruster roar tail (1.3 s decay), a sub boom on the attack; leading silence removed so it bursts at once; +1.5 dB low shelf, −2 dB at 450 Hz; level-matched to the file it replaced (same loudest-400 ms level, so `gains.ts` is unchanged), peak ≤ −1 dBFS |
| `burning_loop.wav` | "Fire Loop" — `qubodupFireLoop.flac` | https://opengameart.org/content/fire-loop | qubodup | **CC BY 3.0** | **required** ("qubodup") | allowed | none | FLAC → WAV; 96 → 44.1 kHz; loop seam crossfaded (51.9 ms); −0.05 dB |

## Chidori (`chidori/`)

| file | asset (original title / file) | source URL | creator | licence | attribution | commercial use | restrictions / notes | changes made |
|---|---|---|---|---|---|---|---|---|
| `hand_sign.wav` | mix: "Sci-Fi Sounds" — `laserSmall_001.ogg` + JC Sounds "Fantasy SFX Pack Vol 1" — `Single_…_Electric Spell_Hit_02.wav` (**CC BY 4.0**) | https://opengameart.org/content/sci-fi-sounds · https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1 | Kenney · JC Sounds | **CC BY 4.0** (JC Sounds layer) + CC0 | **required** ("JC Sounds") | allowed, with attribution | none | **Upgraded 2026-11-01 (layered, see `SOURCES.md`):** the electric chirp + the first 240 ms of an electric hit (high-passed 1.5 kHz, 60 ms decay) as a crackle; level-matched to the file it replaced (same loudest-400 ms level, so `gains.ts` is unchanged), peak ≤ −1 dBFS |
| `thunder_impact.wav` | mix: "8 Magic Attacks" — `18_Thunder_02.wav` + JC Sounds "Fantasy SFX Pack Vol 1" — `Single_…_Electric Spell_Launch_01.wav` (**CC BY 4.0**) + `…_Electric Spell_Hit_03.wav` + Kenney "Sci-Fi Sounds" — `lowFrequency_explosion_001.ogg` (CC0) | https://opengameart.org/content/8-magic-attacks · https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1 · https://opengameart.org/content/sci-fi-sounds | leohpaz · JC Sounds · Kenney | **CC BY 4.0** (leohpaz, JC Sounds) + CC0 | **required** | allowed | leohpaz: free samples of a larger paid pack | **Upgraded 2026-11-01 (layered, see `SOURCES.md`):** the thunder + an electric launch (the chirping crackle of the release) + an electric hit + a low boom; level-matched to the file it replaced (same loudest-400 ms level, so `gains.ts` is unchanged), peak ≤ −1 dBFS |
| `lightning_charge.wav` | mix: "Electricity Game Sound Pack" — `charge.wav` + JC Sounds "Fantasy SFX Pack Vol 1" — `Loop_…_Electric Spell_Hold.wav` (**CC BY 4.0**) + `…_Electric Spell_Buildup.wav` + `…_Electric Spell_Launch_02.wav` | https://opengameart.org/content/electricity-game-sound-pack · https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1 | faxcorp · JC Sounds | **CC BY 4.0** (JC Sounds layer) + CC0 | **required** ("JC Sounds") | allowed, with attribution | none | **Upgraded 2026-11-01 (layered, see `SOURCES.md`):** 4.1 s rising electric charge: the steady buzz + the electric hold loop with its pitch gliding up (×0.85 → ×1.25) + two build-ups and a launch on the way; gain-ridden so it only rises; high-passed 70 Hz; level-matched to the file it replaced (same loudest-400 ms level, so `gains.ts` is unchanged), peak ≤ −1 dBFS |
| `crackle_loop.wav` | "Electricity Game Sound Pack" — `snaploop.wav` | https://opengameart.org/content/electricity-game-sound-pack | faxcorp | CC0 1.0 | not required | allowed | none | none |
| `activation_zap.wav` | "Electricity Sound Effects" — `spark.wav` | https://opengameart.org/content/electricity-sound-effects-0 | BMacZero (Brian MacIntosh) | CC0 1.0 | not required (optional) | allowed | none | 113 ms of leading silence trimmed (2 ms fade-in) |
| `impact.wav` | "Electricity Game Sound Pack" — `hit.wav` | https://opengameart.org/content/electricity-game-sound-pack | faxcorp | CC0 1.0 | not required | allowed | none | none |

## Shadow Clone (`shadow_clone/`)

| file | asset (original title / file) | source URL | creator | licence | attribution | commercial use | restrictions / notes | changes made |
|---|---|---|---|---|---|---|---|---|
| `hand_sign.wav` *(new)* | "Swishes Sound Pack" — `swish-3.wav` | https://opengameart.org/content/swishes-sound-pack | artisticdude | CC0 1.0 | not required | allowed | none | 24-bit → 16-bit; 24 ms of leading silence trimmed (2 ms fade-in) |
| `charge_chakra.wav` | mix: "Magic Spell SFX" — `magical_1_0.ogg` + JC Sounds "Fantasy SFX Pack Vol 1" — `Seq_…_Mana Drain_Start.wav` (**CC BY 4.0**) + a synthesised airy swell | https://opengameart.org/content/magic-spell-sfx · https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1 | jaggedstone · JC Sounds | **CC BY 4.0** (JC Sounds layer) + CC0 | **required** ("JC Sounds") | allowed, with attribution | none | **Upgraded 2026-11-01 (layered, see `SOURCES.md`):** 1.9 s: the chakra shimmer (its abrupt end faded) + a magical swell from 0.5 s + a rising noise bed; level-matched to the file it replaced (same loudest-400 ms level, so `gains.ts` is unchanged), peak ≤ −1 dBFS |
| `duplicate.wav` | mix: "Teleport Spell" — `teleport.wav` + JC Sounds "Fantasy SFX Pack Vol 1" — `Single_…_Teleport_In.wav` (**CC BY 4.0**) + Kenney "Sci-Fi Sounds" — `lowFrequency_explosion_001.ogg` (CC0) + a synthesised smoke burst | https://opengameart.org/content/teleport-spell · https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1 · https://opengameart.org/content/sci-fi-sounds | ogrebane · JC Sounds · Kenney | **CC BY 4.0** (JC Sounds layer) + CC0 | **required** ("JC Sounds") | allowed, with attribution | none | **Upgraded 2026-11-01 (layered, see `SOURCES.md`):** the teleport sweep + a teleport-in whoomph + a big smoke burst (noise, low-pass sweeping 6 kHz → 250 Hz) + a low boom; level-matched to the file it replaced (same loudest-400 ms level, so `gains.ts` is unchanged), peak ≤ −1 dBFS |
| `seal_charge.wav` | "Level up, power up, Coin get (13 Sounds)" — `Upper01.aif` | https://opengameart.org/content/level-up-power-up-coin-get-13-sounds | wobbleboxx | CC0 1.0 | not required (optional) | allowed | not played any more (replaced by `charge_chakra.wav`), kept | 24-bit AIFF → 16-bit WAV |
| `smoke_poof.wav` | mix: "Poof Noises" — `poof_1.wav` + JC Sounds "Fantasy SFX Pack Vol 1" — `Single_…_Teleport_Out.wav` (**CC BY 4.0**) + a synthesised puff and thump | https://opengameart.org/content/poof-noises · https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1 | dklon · JC Sounds | **CC BY 3.0** (dklon) + **CC BY 4.0** (JC Sounds) | **required** ("dklon", "JC Sounds") | allowed | none | **Upgraded 2026-11-01 (layered, see `SOURCES.md`):** dklon's poof + a noise puff (low-pass sweeping 4.5 kHz → 300 Hz) + a soft 110 → 55 Hz thump + the first 0.5 s of a teleport-out whoomph; level-matched to the file it replaced (same loudest-400 ms level, so `gains.ts` is unchanged), peak ≤ −1 dBFS |
| `clone_appear.wav` | "Teleport" — `172206__fins__teleport.wav` | https://opengameart.org/content/teleport (original: https://freesound.org/people/fins/sounds/172206/) | fins (uploaded by diligentcircle) | CC0 1.0 | not required | allowed | none | none |
| `clone_disappear.wav` | "Erase / Escape" — `erase.wav` | https://opengameart.org/content/erase-escape | Fupi | CC0 1.0 | not required | allowed | none | peak-normalised −16.0 → −1 dBFS |

## Rasengan (`rasengan/`)

| file | asset (original title / file) | source URL | creator | licence | attribution | commercial use | restrictions / notes | changes made |
|---|---|---|---|---|---|---|---|---|
| `hand_sign.wav` | mix: "100 CC0 SFX #2" — `sfx100v2_air_03.ogg` + JC Sounds "Fantasy SFX Pack Vol 1" — `Single_…_Sword_Swing_02.wav` (**CC BY 4.0**) | https://opengameart.org/content/100-cc0-sfx-2 · https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1 | rubberduck · JC Sounds | **CC BY 4.0** (JC Sounds layer) + CC0 | **required** ("JC Sounds") | allowed, with attribution | none | **Upgraded 2026-11-01 (layered, see `SOURCES.md`):** the gust + a swing whoosh (band-passed 300–6000 Hz); level-matched to the file it replaced (same loudest-400 ms level, so `gains.ts` is unchanged), peak ≤ −1 dBFS |
| `charge_magic.wav` | mix: "8 Magic Attacks" — `45_Charge_05.wav` + Kenney "Sci-Fi Sounds" — `engineCircular_002.ogg` (CC0) + `thrusterFire_004.ogg` | https://opengameart.org/content/8-magic-attacks · https://opengameart.org/content/sci-fi-sounds | leohpaz · Kenney | **CC BY 4.0** (leohpaz) + CC0 | **required** | allowed | leohpaz: free samples of a larger paid pack | **Upgraded 2026-11-01 (layered, see `SOURCES.md`):** 3.0 s: the charge swirl + a spinning hum that speeds up (rate ×0.6 → ×1.5, low-pass opening 900 → 9000 Hz) + a rising wind (band-passed thruster); gain-ridden so it only rises; level-matched to the file it replaced (same loudest-400 ms level, so `gains.ts` is unchanged), peak ≤ −1 dBFS |
| `wind_impact.wav` | mix: "8 Magic Attacks" — `25_Wind_01.wav` + Kenney "Sci-Fi Sounds" — `lowFrequency_explosion_000.ogg` (CC0) + `explosionCrunch_002.ogg` + JC Sounds "Fantasy SFX Pack Vol 1" — `Single_…_Magic Shield_Activation_02.wav` (**CC BY 4.0**) | https://opengameart.org/content/8-magic-attacks · https://opengameart.org/content/sci-fi-sounds · https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1 | leohpaz · Kenney · JC Sounds | **CC BY 4.0** (leohpaz, JC Sounds) + CC0 | **required** | allowed | leohpaz: free samples of a larger paid pack | **Upgraded 2026-11-01 (layered, see `SOURCES.md`):** the wind burst + a sub boom + a crunch (high-passed 150 Hz) + a magic flare (500 ms decay); level-matched to the file it replaced (same loudest-400 ms level, so `gains.ts` is unchanged), peak ≤ −1 dBFS |
| `energy_loop.wav` *(new)* | "Seamless Energy Emission Loop" — `movingshield_sound.ogg` | https://opengameart.org/content/seamless-energy-emission-loop | zeroisnotnull | CC0 1.0 | not required | allowed | none | OGG → 16-bit WAV; 40 ms equal-power crossfade at the loop seam |
| `chakra_charge.wav` | "Force field electric hum" — `hjm-shield_hum_50.wav` | https://opengameart.org/content/force-field-electric-hum | Hansjörg Malthaner (OGA: Varkalandar) | **CC BY 4.0** (offered under several licences; used under CC BY 4.0) | **required**: name + http://opengameart.org/users/varkalandar | allowed | none | none |
| `release_whoosh.wav` | mix: "Wind, hit, time morph" — `qubodup-megaswosh1.wav` + JC Sounds "Fantasy SFX Pack Vol 1" — `Single_…_Heavy Sword_Swing_02.wav` (**CC BY 4.0**) | https://opengameart.org/content/wind-hit-time-morph · https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1 | qubodup · JC Sounds | **CC BY 4.0** (JC Sounds layer) + CC0 | **required** ("JC Sounds") | allowed, with attribution | none | **Upgraded 2026-11-01 (layered, see `SOURCES.md`):** the swoosh + a heavy swing whoosh, +2 dB low shelf at 150 Hz; level-matched to the file it replaced (same loudest-400 ms level, so `gains.ts` is unchanged), peak ≤ −1 dBFS |
| `impact.wav` | "Electricity Game Sound Pack" — `deathboom.wav` | https://opengameart.org/content/electricity-game-sound-pack | faxcorp | CC0 1.0 | not required | allowed | none | none |
| `spin_loop.wav` | "Air whoosh" — `whoosh2.wav` | https://opengameart.org/content/air-whoosh | pyranostudios | CC0 1.0 | not required | allowed | not played any more (replaced by `energy_loop.wav`), kept | loop seam crossfaded (50 ms); peak-normalised −10.2 → −1 dBFS |

## UI (`ui/`)

| file | asset (original title / file) | source URL | creator | licence | attribution | commercial use | restrictions / notes | changes made |
|---|---|---|---|---|---|---|---|---|
| `step_success.wav` | "63 Digital sound effects" — `highUp.mp3` | https://opengameart.org/content/63-digital-sound-effects-lasers-phasers-space-etc | Kenney (www.kenney.nl) | CC0 1.0 | not required (optional) | allowed | the hand-sign tone of every jutsu (varied by pitch and filter in the app) | MP3 → 16-bit WAV; 104 ms trimmed; peak-normalised −22.8 → −3 dBFS |
| `sequence_failed.wav` | same pack — `zapThreeToneDown.mp3` | https://opengameart.org/content/63-digital-sound-effects-lasers-phasers-space-etc | Kenney | CC0 1.0 | not required (optional) | allowed | played on a timeout only | MP3 → 16-bit WAV; 57 ms trimmed; peak-normalised −24.6 → −3 dBFS |
| `mode_switch.wav` | "51 UI sound effects" — `switch2.wav` | https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks | Kenney | CC0 1.0 | not required (optional) | allowed | none | none |
| `hand_seal.wav` | made for SHINOBI AI from two CC0 recordings: "Thwack Sounds" — `thwack-03.wav` + `thwack-01.wav` (pack `thwack-1.0.zip`) and "Fabric Rustling" — `rustling.ogg`; upgraded 2026-11-01 with JC Sounds "Fantasy SFX Pack Vol 1" — `Single_…_Dagger_Swing_02.wav` (**CC BY 4.0**) and a synthesised clap body | https://opengameart.org/content/thwack-sounds · https://opengameart.org/content/fabric-rustling · https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1 | Jordan Irwin (AntumDeluge) · iochi-glaucus · JC Sounds | **CC BY 4.0** (JC Sounds layer) + CC0 | **required** ("JC Sounds") | allowed, with attribution | the hand-seal sound of every confirmed step (with each jutsu's accent) | a 190 ms cloth swish (rustle at 3.75 s, high-passed 900 Hz, faded) into a slap at 85 ms (thwack-03 + high-passed thwack-01, 75 ms decay). **Upgraded 2026-11-01 (layered, see `SOURCES.md`):** + an air whoosh (dagger swing, high-passed 700 Hz, peak at 60 ms) + a 150 → 70 Hz sine thump under the slap + the slap's own crack above 2.5 kHz + 2.5 dB at 3.2 kHz; same loudest-100 ms level (−14.1 dBFS), peak −2.6 dBFS; mono 44.1 kHz 16-bit, 0.38 s |

## Background music (`music/`)

| file | asset | source | creator | licence | attribution | commercial use | restrictions / notes | changes made |
|---|---|---|---|---|---|---|---|---|
| `leaf_trail_loop.flac` | "Leaf Trail" | composed and synthesised by `music/compose_leaf_trail.py` | SHINOBI AI | project's own work (no samples, no third-party audio) | none | allowed | not Naruto music, not an imitation of the soundtrack | — |

## Jutsu sequence music (`jutsu_music/`)

One loop per jutsu, played while its hand signs are being made (`frontend/src/audio/jutsuMusic.ts`). **These are
NOT the original Naruto soundtrack** (see "Not used, and why"): licensed tracks chosen for the mood of each jutsu.
Each file is a beat-aligned section of the original (whole bars) made into a seamless loop: the audio that
followed the section's end is crossfaded (equal power, 1 beat) into its start; stereo 44.1 kHz 16-bit WAV, decoded
from the original MP3 / Ogg by the browser's own decoder (Edge). Drop-in slot: a licensed replacement (e.g. a
licensed OST cue) goes in this folder under the same name, as a seamless stereo WAV loop, with its own row here.

| file | asset (original title / file) | source URL | creator | licence | attribution | commercial use | restrictions / notes | changes made |
|---|---|---|---|---|---|---|---|---|
| `rasengan.wav` *(new)* | "Blackmoor Ninjas (Battle Theme)" — `Blackmoor Ninjas (No Vocals).mp3` | https://opengameart.org/content/blackmoor-ninjas-battle-theme | Matthew Pablo (http://www.matthewpablo.com) | **CC BY 3.0** | **required** (see the credits block) | allowed, with attribution | Rasengan: energetic, heroic (guitars, taiko); the version without the vocal chants, so it never competes with a character voice | 16 bars (42.471–70.665 s, 136 BPM, 28.2 s) made a seamless loop (0.44 s crossfade); MP3 → 16-bit WAV; −1 dB to a −1 dBFS peak |
| `fire_style.wav` *(new)* | "Taiko drums (seamless loop)" — `taiko-drums_0.ogg` | https://opengameart.org/content/taiko-drums-seamless-loop (original recording: https://freesound.org/people/jobro/sounds/112248/ "Taiko drums.wav") | jobro (recording) · congusbongus (cut and encoded) | **CC BY 3.0** (the OGA item and the Freesound original) | **required**: jobro and congusbongus (see the credits block) | allowed, with attribution | Fire Style: taiko, bells and shouts building tension | 16 bars (115.937–157.104 s, 93 BPM, 41.2 s) made a seamless loop (0.64 s crossfade); Ogg → 16-bit WAV; −0.9 dB to a −1 dBFS peak |
| `chidori.wav` *(new)* | "Revenge" — `Revenge_0.mp3` | https://opengameart.org/content/revenge | TAD | **CC BY 4.0** | **required** (see the credits block) | allowed, with attribution | Chidori (Sasuke): dark, fast, dramatic combat music (taiko, orchestra) | 16 bars (130.301–166.849 s, 105 BPM, 36.5 s) made a seamless loop (0.57 s crossfade); MP3 → 16-bit WAV; to a −1 dBFS peak |
| `shadow_clone.wav` *(new)* | "Samurai" — `Samurai_0.mp3` | https://opengameart.org/content/samurai | TAD | **CC BY 4.0** | **required** (see the credits block) | allowed, with attribution | Shadow Clone: fast, energetic Japanese style (koto, taiko, orchestra) | 24 bars (16.013–64.006 s, 120 BPM, 48.0 s) made a seamless loop (0.50 s crossfade); MP3 → 16-bit WAV; level unchanged (peak −2.1 dBFS) |

## Credits block (required attributions)

```
Sound effects
- "8 Magic Attacks" (Fire explosion, Thunder, Wind, Charge) by leohpaz,
  https://opengameart.org/content/8-magic-attacks, licensed CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/). Modified: converted to 16-bit WAV, layered with other
  sounds, level-adjusted.
- "Force field electric hum" by Hansjörg Malthaner (http://opengameart.org/users/varkalandar),
  https://opengameart.org/content/force-field-electric-hum, licensed CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/). Unmodified.
- "Fire Loop" by qubodup, https://opengameart.org/content/fire-loop, licensed CC BY 3.0
  (https://creativecommons.org/licenses/by/3.0/). Modified: converted to WAV, resampled to 44.1 kHz,
  loop seam crossfaded.
- "Poof Noises" (poof_1.wav) by dklon, https://opengameart.org/content/poof-noises, licensed CC BY 3.0
  (https://creativecommons.org/licenses/by/3.0/). Modified: layered with other sounds, level-adjusted.
- "Fantasy SFX Pack Vol 1" by JC Sounds, https://opengameart.org/content/jc-sounds-fantasy-sfx-pack-vol-1,
  licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Modified: layered and mixed with other
  sounds, filtered, level-adjusted (hand seal, jutsu hand-sign, charge, release and impact sounds).
- Other sounds: CC0 / public domain, via OpenGameArt.org, by faxcorp, pyranostudios, qubodup,
  BMacZero (Brian MacIntosh), Julien Matthey, wobbleboxx, fins, Fupi, Kenney (www.kenney.nl),
  rubberduck, artisticdude, jaggedstone, ogrebane, zeroisnotnull, Jordan Irwin (AntumDeluge) and
  iochi-glaucus. Credit for these is optional.

Music played during the hand-sign sequences (not the original Naruto soundtrack)
- "Blackmoor Ninjas (Battle Theme)" by Matthew Pablo (http://www.matthewpablo.com),
  https://opengameart.org/content/blackmoor-ninjas-battle-theme, licensed CC BY 3.0
  (https://creativecommons.org/licenses/by/3.0/). Modified: a 16-bar section made into a loop.
- "Taiko drums (seamless loop)" by congusbongus, cut from "Taiko drums.wav" by jobro
  (https://freesound.org/people/jobro/sounds/112248/), https://opengameart.org/content/taiko-drums-seamless-loop,
  licensed CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Modified: a 16-bar section made into a loop.
- "Revenge" by TAD, https://opengameart.org/content/revenge, licensed CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/). Modified: a 16-bar section made into a loop.
- "Samurai" by TAD, https://opengameart.org/content/samurai, licensed CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/). Modified: a 24-bar section made into a loop.
```

## Not used, and why

* Freesound.org (several suitable CC0 sounds): downloading needs an account; not attempted.
* `.7z` packs qubodup "2 High Quality Explosions" and "Fire & Evil Spell" (CC BY 3.0): not needed. (JC Sounds
  "Fantasy SFX Pack Vol 1" was extracted with py7zr on 2026-11-01 and is used, see above.)
* p0ss "Spell Sounds Starter Pack": CC BY-SA 3.0 / GPL (share-alike), avoided.
* Any Naruto anime, game or film audio, voice clones or soundtrack: not allowed without the rights
  holders' permission (see `voice/README.md`).
* The original Naruto soundtrack (checked 2026-11-01): the series' score is by Toshio Masuda (Naruto) and
  Yasuharu Takanashi (Naruto Shippuden); the soundtrack albums are Aniplex releases, and their first digital
  release outside Japan (2021) went through Milan Records. These are commercial recordings: using them in the
  app would need a master-use licence from the label and a synchronisation licence from the music publisher.
  No such licence exists for this project, so none of it is used (the YouTube links the user gave were used
  only as a style reference; nothing was downloaded from them). Sources: https://milanrecords.com/naruto-soundtracks-to-get-first-digital-release-outside-japan-this-friday/ ·
  https://en.wikipedia.org/wiki/Naruto_(TV_series).
* "Battle Theme" by wolfgang (CC0, https://opengameart.org/content/battle-theme-0): a good tense orchestral
  candidate for Fire Style; the taiko loop fits the Japanese setting better.
* "Blackmoor Ninjas" with vocal chants: the no-vocals version is used, so no voice in the music competes with
  a character voice.

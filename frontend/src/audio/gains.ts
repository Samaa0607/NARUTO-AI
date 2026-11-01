// Per-cue gain normalisation. The 31 files differ a lot in loudness (assets/audio/SOURCES.md,
// "Technical notes", and ASSET_LICENSES.md: from -38 to -9 dBFS), so each cue gets a fixed gain that
// brings it to the level of its role in the mix:
//
//   role         target (loudest 400 ms window, after gain)
//   seal         about -14 dBFS   the hand-seal sound (loudest 100 ms): clearly heard on every
//                                  confirmed step, over the jutsu music too
//   accent       about -20 dBFS   each jutsu's own layer under the hand-sign tone
//   ui           about -24 dBFS   discreet
//   charge       about -21 dBFS   the chakra charge (activation timeline, under the voice)
//   activation   about -13 dBFS   the loudest moment: the release and its impact
//   loop         about -23 dBFS   a bed under the video while the effect runs
//   ending       about -17 dBFS
//
// Measured on the delivered files (loudest 400 ms window / peak, dBFS). A gain above 1 is capped so
// that the file's peak stays at or below about -1 dBFS (a limiter in the engine catches overlaps).
import type { CueId } from './cues'

export const CUE_GAIN: Record<CueId, number> = {
  // ui
  // the hand seal (cloth swish + slap), the main sound of every confirmed step
  'ui.hand_seal': 1, //                  -14.1 (loudest 100 ms) / -1.0
  // the former hand-sign tone (kept: the Settings test plays the seal now)
  'ui.step_success': 1, //               -12.0 / -3.0
  'ui.sequence_failed': 0.2, //          -7.2 / -3.0
  'ui.mode_switch': 1.6, //              -33.2 / -5.2 (capped by its peak)

  // the jutsu's own hand-sign accents (under the step tone)
  'fire_style.hand_sign': 0.87, //      -18.8 / -1.0
  'chidori.hand_sign': 1.19, //         -21.9 / -2.5 (capped by its peak)
  'shadow_clone.hand_sign': 0.33, //    -10.3 / -0.1
  'rasengan.hand_sign': 0.89, //        -19.0 / -1.2

  // charges (activation timeline: the charge phase)
  'fire_style.charge_rise': 0.48, //    -14.7 / -1.0
  'shadow_clone.charge_chakra': 1.26, // -23.0 / -10.3
  'rasengan.charge_magic': 0.46, //     -14.2 / -3.7
  'rasengan.chakra_charge': 0.22, //     -7.9 / -3.2
  'chidori.lightning_charge': 0.62, //   -17.2 / 0.0
  'fire_style.prepare_inhale': 0.65, //  -17.6 / 0.0
  'shadow_clone.seal_charge': 0.95, //   -20.1 / -5.5 (no longer used: shadow_clone.charge_chakra)

  // activations
  'fire_style.ignition': 1.35, //        -20.9 / -3.1 (capped)
  'fire_style.flame_burst': 0.75, //     -10.1 / 0.0
  'chidori.activation_zap': 1.4, //      -29.1 / -3.5 (capped)
  'rasengan.release_whoosh': 1.0, //     -20.0 / -0.5
  'shadow_clone.clone_appear': 0.45, //  -7.3 / -2.6
  'shadow_clone.duplicate': 0.9, //      -14.7 / -0.1 (capped by its peak)

  // impacts (with the release)
  'fire_style.impact': 0.87, //         -11.8 / -1.0
  'chidori.thunder_impact': 1, //       -14.2 / -1.0 (capped by its peak)
  'rasengan.wind_impact': 1, //         -14.5 / -1.0 (capped by its peak)

  // loops
  'fire_style.burning_loop': 0.3, //     -11.6 / -0.1
  'chidori.crackle_loop': 0.95, //       -24.9 / 0.0
  'rasengan.spin_loop': 0.42, //         -15.0 / -1.0 (no longer used: rasengan.energy_loop)
  'rasengan.energy_loop': 1.23, //       -24.8 / -15.9

  // endings and clones
  'chidori.impact': 0.8, //              -19.7 / 0.0
  'rasengan.impact': 0.55, //            -12.0 / 0.0
  'shadow_clone.clone_disappear': 0.85, // -17.0 / -1.0
  'shadow_clone.smoke_poof': 1.1, //     -21.8 / -5.9
}

/** Output volume from the user's settings: master x sfx, 0 when muted. */
export function outputVolume(settings: { masterVolume: number; sfxVolume: number; muted: boolean }): number {
  if (settings.muted) return 0
  const v = settings.masterVolume * settings.sfxVolume
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}

/** Music volume (the jutsu sequence music) from the user's settings: master x music, 0 when muted. */
export function musicOutputVolume(settings: { masterVolume: number; musicVolume: number; muted: boolean }): number {
  if (settings.muted) return 0
  const v = settings.masterVolume * settings.musicVolume
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}

/** Character voice volume from the user's settings: master x voice, 0 when muted. */
export function voiceOutputVolume(settings: { masterVolume: number; voiceVolume: number; muted: boolean }): number {
  if (settings.muted) return 0
  const v = settings.masterVolume * settings.voiceVolume
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}

// While a character voice speaks, the sound effects and the background music get quieter so the
// voice stays clear (ducking), then come back after it.
/** sound effects bus during a voice: about -8 dB */
export const VOICE_DUCK_SFX = 0.4
/** background music during a voice: about -10 dB */
export const VOICE_DUCK_MUSIC = 0.3
/** time constants (s) of the duck going down and coming back */
export const DUCK_ATTACK_S = 0.02
export const DUCK_RELEASE_S = 0.18

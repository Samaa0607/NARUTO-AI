// Music while the user makes a jutsu's hand signs: one licensed loop per jutsu (assets/audio/jutsu_music,
// NOT the original Naruto soundtrack: see assets/audio/ASSET_LICENSES.md). A pure planner, like
// eventCues.ts: backend frames in, music commands out (unit-tested in jutsuMusic.test.ts); the
// JutsuMusicPlayer (jutsuMusicPlayer.ts) plays them.
//
//   the leading jutsu has a confirmed step   its track starts (fade-in); another jutsu taking the lead with
//                                             MORE steps crossfades to its track
//   a step (a hand seal sounds)              a short dip, so the seal stays clear over the music
//   `jutsu` (the sequence is complete)       ducked to DUCK_ACTIVATION under the build-up (voice, charge, name)
//   effect_phase release                     fades out (RELEASE_FADE_MS): the effect and its impact take over
//   progress back to 0 without a `jutsu`     fades out (RESET_FADE_MS): a timeout, Start over, another mode
//   (camera stopped, disconnected, page left: useSessionSounds stops the player)
// While an activation runs (from its `jutsu` to its effect_end) no new track starts; a sequence begun
// meanwhile gets its music once the effect is over.
import type { EffectId, FrameState, JutsuId, ShinobiEvent } from '../types/protocol'

export interface JutsuTrack {
  url: string
  /** evens the four loops out (their RMS: SOURCES.md) to about -16 dBFS before the user's music volume */
  gain: number
}

/** the loops and their level: rasengan -14.8, fire_style -17.6, chidori -15.4, shadow_clone -18.6 dBFS RMS */
export const TRACKS: Record<JutsuId, JutsuTrack> = {
  rasengan: { url: '/audio/jutsu_music/rasengan.wav', gain: 0.87 }, // "Blackmoor Ninjas" (Matthew Pablo, CC BY 3.0)
  fire_style: { url: '/audio/jutsu_music/fire_style.wav', gain: 1.2 }, // "Taiko drums" (jobro / congusbongus, CC BY 3.0)
  chidori: { url: '/audio/jutsu_music/chidori.wav', gain: 0.93 }, // "Revenge" (TAD, CC BY 4.0)
  shadow_clone: { url: '/audio/jutsu_music/shadow_clone.wav', gain: 1.35 }, // "Samurai" (TAD, CC BY 4.0)
}

/** the first track fades in over this long */
export const FADE_IN_MS = 1500
/** from one jutsu's track to another's */
export const CROSSFADE_MS = 800
/** under the activation's build-up (character voice, charge, jutsu name) */
export const DUCK_ACTIVATION = 0.25
export const DUCK_RAMP_MS = 300
/** at the release of the jutsu: the effect and its impact take over */
export const RELEASE_FADE_MS = 1500
/** the sequence was dropped (timeout, Start over, another mode) */
export const RESET_FADE_MS = 1000
/** camera stopped, disconnected, page left */
export const STOP_FADE_MS = 600

export type MusicCommand =
  /** play this jutsu's track: fade in (nothing playing) or crossfade from the one playing */
  | { kind: 'start'; jutsu: JutsuId; fadeMs: number }
  /** the activation duck: to `level` (1 = none) over `rampMs` */
  | { kind: 'duck'; level: number; rampMs: number }
  /** a short dip under a hand-seal sound */
  | { kind: 'pulse' }
  /** fade out and stop */
  | { kind: 'fadeOut'; fadeMs: number }

export interface MusicState {
  /** the jutsu whose track plays (or is wanted), null when none */
  track: JutsuId | null
  /** the activation running (its `jutsu` came, its effect_end not yet), null when none */
  activation: { effect: EffectId; released: boolean } | null
}

export const INITIAL_MUSIC_STATE: MusicState = { track: null, activation: null }

export type FrameMusicInput = Pick<FrameState, 'events' | 'progress'>

/** The jutsu with the most steps done (>= 1). On a tie the one already playing keeps the music,
 * otherwise the first in `order`. */
export function leader(progress: FrameState['progress'], order: readonly JutsuId[], playing: JutsuId | null): JutsuId | null {
  let best: JutsuId | null = null
  for (const id of order) {
    const n = progress[id] ?? 0
    if (n < 1) continue
    const top = best === null ? 0 : (progress[best] ?? 0)
    if (best === null || n > top || (n === top && id === playing)) best = id
  }
  return best
}

const ORDER = Object.keys(TRACKS) as JutsuId[]

/** Music commands for one processed frame. */
export function musicForFrame(state: MusicState, frame: FrameMusicInput): { state: MusicState; commands: MusicCommand[] } {
  const commands: MusicCommand[] = []
  let { track, activation } = state
  let stepped = false

  for (const ev of frame.events as readonly ShinobiEvent[]) {
    switch (ev.type) {
      case 'step':
        stepped = true
        break
      case 'jutsu':
        stepped = true // the last sign's hand seal
        if (ev.stages) {
          activation = { effect: ev.effect, released: false }
          if (track) commands.push({ kind: 'duck', level: DUCK_ACTIVATION, rampMs: DUCK_RAMP_MS })
        } else {
          // an older server: the effect starts at once
          activation = { effect: ev.effect, released: true }
          if (track) commands.push({ kind: 'fadeOut', fadeMs: RELEASE_FADE_MS })
          track = null
        }
        break
      case 'effect_phase':
        if (ev.phase === 'release' && activation && activation.effect === ev.effect && !activation.released) {
          activation = { ...activation, released: true }
          if (track) commands.push({ kind: 'fadeOut', fadeMs: RELEASE_FADE_MS })
          track = null
        }
        break
      case 'effect_stopping':
        // stopped during the build-up: the music must not stay ducked
        if (activation && activation.effect === ev.effect && !activation.released) {
          activation = { ...activation, released: true }
          if (track) commands.push({ kind: 'fadeOut', fadeMs: RELEASE_FADE_MS })
          track = null
        }
        break
      case 'effect_end':
        if (activation && activation.effect === ev.effect) activation = null
        break
      default:
        // a sign, a wrong sign (the progress is kept: the music goes on), a timeout (see below)
        break
    }
  }

  if (!activation) {
    const lead = leader(frame.progress, ORDER, track)
    if (lead && lead !== track) {
      const switching = track !== null && (frame.progress[lead] ?? 0) > (frame.progress[track] ?? 0)
      if (track === null || switching || (frame.progress[track] ?? 0) < 1) {
        commands.push({ kind: 'start', jutsu: lead, fadeMs: track === null ? FADE_IN_MS : CROSSFADE_MS })
        track = lead
      }
    } else if (!lead && track) {
      commands.push({ kind: 'fadeOut', fadeMs: RESET_FADE_MS })
      track = null
    }
  }
  if (stepped && track && !commands.some((c) => c.kind === 'fadeOut')) commands.push({ kind: 'pulse' })
  return { state: { track, activation }, commands }
}

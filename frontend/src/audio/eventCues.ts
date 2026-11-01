// Backend events -> sound commands. A pure function (no Web Audio, no React), so the mapping can be
// unit-tested (eventCues.test.ts). Sounds follow the backend's FrameState.events ONLY: nothing is
// played on a guess of the frontend (docs/web_protocol.md, 3.6).
//
// The activation timeline (newer servers: the `jutsu` event carries `stages`, then `effect_phase`
// events follow): 1. the AI confirms the whole sequence (`jutsu`): the last sign's hand-sign sound,
// then the character's activation voice (voiceCues.ts); 2. `effect_phase` charge: the chakra charge
// sound; 3. `effect_phase` name: the jutsu name voice (voiceCues.ts), the charge goes on under it;
// 4. `effect_phase` release: the charge stops, the main effect's sounds and its impact play.
//
//   step                       the hand-seal sound: ui.hand_seal (a cloth swish into a slap, the same
//                              hands for every jutsu) a little higher with each step (SEAL_RISE),
//                              with the jutsu's own accent under it (HAND_SIGN_ACCENT: a flame flick,
//                              an electric chirp, a hand swish, a gust). Once per frame (one sign)
//                              even when several jutsu advanced: the most advanced one gives the
//                              accent. Never twice for the same step of the same chain.
//   wrong sign                 nothing (an incorrect or unrecognised gesture makes no sound)
//   sequence_failed/timeout    ui.sequence_failed (soft)
//   jutsu (with stages)        the hand-sign sound of the last sign; the rest follows the phases
//   effect_phase charge        CHARGE of that jutsu
//   effect_phase release       the charge fades out; RELEASE of that effect (main sounds + impact)
//   jutsu (no stages: an older server whose effect starts at once)   RELEASE at once
//   clones                     shadow_clone.smoke_poof for the newly visible clones (rate-limited)
//   effect_stopping            ending: chidori.impact / rasengan.impact (faded) /
//                              shadow_clone.clone_disappear + smoke_poof / fire loop fades out
//   effect_end                 that effect's loop stops
import type { EffectId, FrameState, JutsuId, ShinobiEvent, StepEvent } from '../types/protocol'
import type { CueId } from './cues'

/** a filter on one playback (Web Audio BiquadFilterNode) */
export interface CueFilter {
  type: BiquadFilterType
  frequency: number
  q: number
}

export type SoundCommand =
  | {
      kind: 'play'
      cue: CueId
      /** start this long after now */
      delayMs?: number
      /** extra gain 0..1 */
      volume?: number
      /** fade the one-shot in over this long */
      fadeInMs?: number
      /** fade the one-shot out after this long (from its start)... */
      fadeOutAfterMs?: number
      /** ...over this long */
      fadeOutMs?: number
      /** playback rate (pitch and speed together), 1 = as recorded */
      rate?: number
      filter?: CueFilter
    }
  | { kind: 'loop'; cue: CueId; delayMs?: number; fadeInMs?: number; volume?: number }
  /** stop every voice of this cue (loop or one-shot) with a fade */
  | { kind: 'stop'; cue: CueId; fadeMs: number }

type PlayCommand = Extract<SoundCommand, { kind: 'play' }>

/**
 * The hand-seal sound (assets/audio/ui/hand_seal.wav, made from two CC0 recordings: a cloth swish into a
 * slap): the same hands for every jutsu, a little higher with each step so the sequence builds up.
 * About -14 dBFS (loudest 100 ms) at full volume: clearly over the jutsu music.
 */
export const SEAL_VOLUME = 1
/** semitones added at step 1, 2, 3, 4 (the 4th sign completes the sequence: the `jutsu` event) */
export const SEAL_RISE = [0, 1, 2, 3, 4]
/** the jutsu's own accent sits under the seal */
export const ACCENT_VOLUME = 0.55

/** The jutsu's own second layer of the hand-sign sound (assets/audio/<jutsu>/hand_sign.wav). */
export const HAND_SIGN_ACCENT: Record<JutsuId, Omit<PlayCommand, 'kind'>> = {
  fire_style: { cue: 'fire_style.hand_sign', fadeOutAfterMs: 380, fadeOutMs: 220 }, // a short flame flick
  chidori: { cue: 'chidori.hand_sign' }, // an electric chirp
  shadow_clone: { cue: 'shadow_clone.hand_sign' }, // a quick hand swish
  rasengan: { cue: 'rasengan.hand_sign' }, // a short gust
}

/** The hand seal for one confirmed step. */
export function stepSound(ev: Pick<StepEvent, 'jutsu' | 'step'>): PlayCommand {
  const rise = SEAL_RISE[Math.min(SEAL_RISE.length - 1, Math.max(0, ev.step - 1))]
  return { kind: 'play', cue: 'ui.hand_seal', volume: SEAL_VOLUME, rate: 2 ** (rise / 12) }
}

/** The whole hand-sign sound of one confirmed sign: the seal, with the jutsu's accent under it. */
export function handSignSounds(ev: Pick<StepEvent, 'jutsu' | 'step'>): PlayCommand[] {
  const accent = (HAND_SIGN_ACCENT as Partial<Record<string, Omit<PlayCommand, 'kind'>>>)[ev.jutsu]
  return accent
    ? [stepSound(ev), { kind: 'play', ...accent, volume: (accent.volume ?? 1) * ACCENT_VOLUME }]
    : [stepSound(ev)]
}

/** the charge's second layer starts this long after the first */
export const CHARGE_DELAY_MS = 150
/** the charge fades in over this long, so it grows like chakra gathering */
export const CHARGE_FADE_IN_MS = 400
/** the charge fades out over this long when the jutsu is released (or the activation ends early) */
export const CHARGE_RELEASE_FADE_MS = 250

/** The chakra charge of each jutsu (effect_phase charge). */
export const CHARGE: Record<JutsuId, PlayCommand[]> = {
  fire_style: [
    { kind: 'play', cue: 'fire_style.prepare_inhale' },
    { kind: 'play', cue: 'fire_style.charge_rise', delayMs: CHARGE_DELAY_MS, fadeInMs: CHARGE_FADE_IN_MS },
  ],
  // a steady electric buzz: the long fade-in makes it rise
  chidori: [{ kind: 'play', cue: 'chidori.lightning_charge', fadeInMs: 900 }],
  shadow_clone: [{ kind: 'play', cue: 'shadow_clone.charge_chakra', fadeInMs: 150 }],
  rasengan: [
    { kind: 'play', cue: 'rasengan.charge_magic', fadeInMs: 250 },
    { kind: 'play', cue: 'rasengan.chakra_charge', delayMs: CHARGE_DELAY_MS, fadeInMs: 600, volume: 0.6 },
  ],
}

export const EFFECT_LOOP: Partial<Record<EffectId, CueId>> = {
  fire: 'fire_style.burning_loop',
  chidori: 'chidori.crackle_loop',
  rasengan: 'rasengan.energy_loop',
}

/** The main effect's sounds, with its impact (effect_phase release, or `jutsu` on older servers). */
export const RELEASE: Record<EffectId, SoundCommand[]> = {
  fire: [
    { kind: 'play', cue: 'fire_style.ignition' },
    { kind: 'play', cue: 'fire_style.flame_burst', delayMs: 90 },
    { kind: 'play', cue: 'fire_style.impact', delayMs: 140 },
    { kind: 'loop', cue: 'fire_style.burning_loop', delayMs: 650, fadeInMs: 700 },
  ],
  chidori: [
    { kind: 'play', cue: 'chidori.activation_zap' },
    { kind: 'play', cue: 'chidori.thunder_impact', delayMs: 40 },
    { kind: 'loop', cue: 'chidori.crackle_loop', delayMs: 90, fadeInMs: 250 },
  ],
  rasengan: [
    { kind: 'play', cue: 'rasengan.release_whoosh' },
    { kind: 'play', cue: 'rasengan.wind_impact', delayMs: 60 },
    { kind: 'loop', cue: 'rasengan.energy_loop', delayMs: 250, fadeInMs: 500 },
  ],
  shadow_clone: [
    { kind: 'play', cue: 'shadow_clone.duplicate' },
    { kind: 'play', cue: 'shadow_clone.clone_appear', delayMs: 120 },
  ],
}

const ENDING: Record<EffectId, SoundCommand[]> = {
  fire: [{ kind: 'stop', cue: 'fire_style.burning_loop', fadeMs: 700 }],
  chidori: [
    { kind: 'play', cue: 'chidori.impact' },
    { kind: 'stop', cue: 'chidori.crackle_loop', fadeMs: 450 },
  ],
  rasengan: [
    // the impact has a 6.9 s tail: keep only its first second or so
    { kind: 'play', cue: 'rasengan.impact', fadeOutAfterMs: 900, fadeOutMs: 1200 },
    { kind: 'stop', cue: 'rasengan.energy_loop', fadeMs: 450 },
  ],
  shadow_clone: [
    { kind: 'play', cue: 'shadow_clone.clone_disappear' },
    { kind: 'play', cue: 'shadow_clone.smoke_poof', delayMs: 60, volume: 0.9 },
  ],
}

export const POOF_GAP_MS = 110 // smoke poofs never closer than this
export const MAX_POOFS_PER_EVENT = 3 // even when many clones appear at once
const MAX_POOF_DELAY_MS = 700 // a poof later than this would no longer match the picture: dropped
const POOF_VOLUMES = [1, 0.8, 0.65]
const LOOP_END_FADE_MS = 150

/** an activation running its timeline (voice -> charge -> name -> release) */
export interface ActivationState {
  jutsu: JutsuId
  effect: EffectId
  charged: boolean
  released: boolean
}

export interface CueState {
  /** the activation whose timeline is running (null: none, or an older server) */
  activation: ActivationState | null
  /** the step whose sound played last, while its chain is alive (never the same step twice) */
  lastStep: { jutsu: JutsuId; step: number } | null
  /** clones heard so far in the current Shadow Clone activation */
  clones: number
  /** earliest time (ms) the next smoke poof may start */
  nextPoofAt: number
}

export const INITIAL_CUE_STATE: CueState = { activation: null, lastStep: null, clones: 0, nextPoofAt: 0 }

export type FrameSoundInput = Pick<FrameState, 'events' | 'progress'>

const stopCharge = (jutsu: JutsuId): SoundCommand[] =>
  (CHARGE[jutsu] ?? []).map((c) => ({ kind: 'stop', cue: c.cue, fadeMs: CHARGE_RELEASE_FADE_MS }))

/** Sound commands for one processed frame. `nowMs`: a monotonic clock (performance.now()). */
export function soundsForFrame(
  state: CueState,
  frame: FrameSoundInput,
  nowMs: number,
): { state: CueState; commands: SoundCommand[] } {
  const commands: SoundCommand[] = []
  let { activation, lastStep, clones, nextPoofAt } = state
  let lead: StepEvent | null = null // the most advanced jutsu among this frame's steps

  for (const ev of frame.events as readonly ShinobiEvent[]) {
    switch (ev.type) {
      case 'step':
        if (!lead || ev.step > lead.step) lead = ev
        break
      case 'sequence_failed':
        // the chain is over. Only a timeout is heard: a wrong sign makes no sound
        lastStep = null
        if (ev.reason === 'timeout') commands.push({ kind: 'play', cue: 'ui.sequence_failed' })
        break
      case 'jutsu': {
        // a charge still building for an activation that never released ends here
        if (activation && activation.charged && !activation.released) commands.push(...stopCharge(activation.jutsu))
        lastStep = null
        if (ev.effect === 'shadow_clone') clones = 0
        if (ev.stages) {
          // the 4th (last) sign was confirmed: its hand-sign sound; the timeline does the rest
          commands.push(...handSignSounds({ jutsu: ev.jutsu, step: 4 }))
          activation = { jutsu: ev.jutsu, effect: ev.effect, charged: false, released: false }
        } else {
          // an older server: the effect starts at once
          commands.push(...(RELEASE[ev.effect] ?? []))
          activation = null
        }
        break
      }
      case 'effect_phase': {
        if (!activation || activation.effect !== ev.effect || activation.jutsu !== ev.jutsu) break
        if (ev.phase === 'charge' && !activation.charged) {
          commands.push(...(CHARGE[ev.jutsu] ?? []))
          activation = { ...activation, charged: true }
        } else if (ev.phase === 'release' && !activation.released) {
          if (activation.charged) commands.push(...stopCharge(activation.jutsu))
          commands.push(...(RELEASE[ev.effect] ?? []))
          activation = { ...activation, released: true }
        }
        // the name phase: the character says the jutsu name (voiceCues.ts); the charge goes on
        break
      }
      case 'clones': {
        const fresh = Math.min(MAX_POOFS_PER_EVENT, ev.count - clones)
        if (ev.count > clones) clones = ev.count
        for (let i = 0; i < fresh; i++) {
          const delay = Math.max(0, nextPoofAt - nowMs)
          if (delay > MAX_POOF_DELAY_MS) break
          commands.push({ kind: 'play', cue: 'shadow_clone.smoke_poof', delayMs: delay, volume: POOF_VOLUMES[i] ?? 0.6 })
          nextPoofAt = nowMs + delay + POOF_GAP_MS
        }
        break
      }
      case 'effect_stopping':
        // stopped during the build-up: its charge must not keep sounding
        if (activation && activation.effect === ev.effect && activation.charged && !activation.released) {
          commands.push(...stopCharge(activation.jutsu))
          activation = { ...activation, released: true }
        }
        commands.push(...(ENDING[ev.effect] ?? []))
        break
      case 'effect_end': {
        const loop = EFFECT_LOOP[ev.effect]
        if (loop) commands.push({ kind: 'stop', cue: loop, fadeMs: LOOP_END_FADE_MS })
        if (ev.effect === 'shadow_clone') clones = 0
        if (activation && activation.effect === ev.effect) {
          if (activation.charged && !activation.released) commands.push(...stopCharge(activation.jutsu))
          activation = null
        }
        break
      }
      default:
        // a sign, a wrong sign (progress kept): no sound
        break
    }
  }

  // one hand-sign sound for this sign
  if (lead && !(lastStep && lastStep.jutsu === lead.jutsu && lastStep.step === lead.step)) {
    commands.unshift(...handSignSounds(lead))
    lastStep = { jutsu: lead.jutsu, step: lead.step }
  }

  // the chain was dropped without an event naming it (mode change, Retry...): that step may come again
  if (lastStep && (frame.progress[lastStep.jutsu] ?? 0) < lastStep.step) lastStep = null

  return { state: { activation, lastStep, clones, nextPoofAt }, commands }
}

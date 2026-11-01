// Backend events -> character voice commands. A pure function (no Web Audio, no React), unit-tested in
// voiceCues.test.ts. The voice follows the backend's `jutsu` event ONLY, i.e. a complete sequence the
// server confirmed and fired: never a step, a wrong sign, a timeout or an incomplete sequence.
//
//   jutsu with stages   (the activation timeline) that jutsu's activation clip at once; its name
//                       clip waits for the activation's `effect_phase` name, i.e. after the chakra
//                       charge, just before the main effect is released
//   jutsu (no stages)   (an older server) the activation clip, then the name clip NAME_GAP_MS after it
//   effect ended        before its name phase: no name clip any more
//   mode change         (free <-> practice, another practised jutsu) the voice stops.
// Clips that are not installed (or not decoded yet) are skipped and listed in `missing`: never
// replaced by another sound. A new activation replaces the voice of the previous one.
//
// One playback per activation: the same frame twice (same seq) or the same jutsu again sooner than
// MIN_REPEAT_MS is ignored (the backend's 1.5 s cooldown makes that impossible for a real activation).
import type { EffectId, FrameState, JutsuId, Mode } from '../types/protocol'
import { VOICE_PARTS, voiceClipId, type VoiceClipId, type VoicePart } from './voices'

export const NAME_GAP_MS = 80
export const MIN_REPEAT_MS = 1000
/** a new activation cuts the previous voice this fast */
export const VOICE_REPLACE_FADE_MS = 120
/** a mode change, a Retry or leaving the page */
export const VOICE_STOP_FADE_MS = 250

export interface VoicePlanClip {
  id: VoiceClipId
  /** start, ms after the plan starts */
  atMs: number
  durationMs: number
}

export interface VoicePlan {
  /** one activation: frame seq + jutsu */
  key: string
  jutsu: JutsuId
  clips: VoicePlanClip[]
  /** end of the last clip, ms after the plan starts (0 without clips) */
  endMs: number
}

export type VoiceCommand = { kind: 'play'; plan: VoicePlan } | { kind: 'stop'; fadeMs: number }

export interface VoiceState {
  /** the last activation handled */
  last: { key: string; jutsu: JutsuId; at: number } | null
  /** mode of the previous frame */
  mode: string | null
  /** an activation (timeline server) whose name clip comes with its `name` phase */
  pendingName: { key: string; jutsu: JutsuId; effect: EffectId } | null
}

export const INITIAL_VOICE_STATE: VoiceState = { last: null, mode: null, pendingName: null }

export type FrameVoiceInput = Pick<FrameState, 'seq' | 'events'> & { mode?: Mode | null }

/** duration in ms of an installed and decoded clip, null when it cannot be played */
export type ClipDuration = (id: VoiceClipId) => number | null

/** The clips of one activation (or of one part of it), in order. */
export function voicePlan(
  key: string,
  jutsu: JutsuId,
  durationOf: ClipDuration,
  parts: readonly VoicePart[] = VOICE_PARTS,
): { plan: VoicePlan; missing: VoiceClipId[] } {
  const clips: VoicePlanClip[] = []
  const missing: VoiceClipId[] = []
  let at = 0
  for (const part of parts) {
    const id = voiceClipId(jutsu, part)
    const duration = durationOf(id)
    if (duration === null || !(duration > 0)) {
      missing.push(id)
      continue
    }
    if (clips.length > 0) at += NAME_GAP_MS
    clips.push({ id, atMs: at, durationMs: duration })
    at += duration
  }
  return { plan: { key, jutsu, clips, endMs: clips.length > 0 ? at : 0 }, missing }
}

const modeKey = (mode: Mode | null | undefined): string | null =>
  mode ? (mode.mode === 'practice' ? `practice:${mode.jutsu}` : 'free') : null

/** Voice commands for one processed frame. `nowMs`: a monotonic clock (performance.now()). */
export function voiceForFrame(
  state: VoiceState,
  frame: FrameVoiceInput,
  durationOf: ClipDuration,
  nowMs: number,
): { state: VoiceState; commands: VoiceCommand[]; missing: VoiceClipId[] } {
  const commands: VoiceCommand[] = []
  const missing: VoiceClipId[] = []
  let { last, mode, pendingName } = state

  const current = modeKey(frame.mode)
  if (current !== null) {
    if (mode !== null && current !== mode) {
      commands.push({ kind: 'stop', fadeMs: VOICE_STOP_FADE_MS })
      pendingName = null
    }
    mode = current
  }

  for (const ev of frame.events) {
    if (ev.type === 'jutsu') {
      const key = `${frame.seq}:${ev.jutsu}`
      if (last && (last.key === key || (last.jutsu === ev.jutsu && nowMs - last.at < MIN_REPEAT_MS))) continue
      last = { key, jutsu: ev.jutsu, at: nowMs }
      // the activation timeline: only the activation clip now, the name with the name phase
      const timeline = ev.stages !== undefined
      const result = voicePlan(key, ev.jutsu, durationOf, timeline ? ['activation'] : VOICE_PARTS)
      missing.push(...result.missing)
      pendingName = timeline ? { key, jutsu: ev.jutsu, effect: ev.effect } : null
      // a new activation always ends the previous voice, even when this jutsu has no clip
      commands.push(result.plan.clips.length > 0 ? { kind: 'play', plan: result.plan } : { kind: 'stop', fadeMs: VOICE_REPLACE_FADE_MS })
    } else if (ev.type === 'effect_phase' && ev.phase === 'name') {
      if (!pendingName || pendingName.jutsu !== ev.jutsu || pendingName.effect !== ev.effect) continue
      const result = voicePlan(`${pendingName.key}:name`, ev.jutsu, durationOf, ['name'])
      missing.push(...result.missing)
      pendingName = null
      if (result.plan.clips.length > 0) commands.push({ kind: 'play', plan: result.plan })
    } else if ((ev.type === 'effect_stopping' || ev.type === 'effect_end') && pendingName?.effect === ev.effect) {
      pendingName = null // ended before its name phase: no name any more
    }
  }

  return { state: { last, mode, pendingName }, commands, missing }
}

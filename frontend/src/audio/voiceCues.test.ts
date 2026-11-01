import { describe, expect, it } from 'vitest'
import type { JutsuId, Mode, ShinobiEvent } from '../types/protocol'
import { INITIAL_CUE_STATE, soundsForFrame, type CueState } from './eventCues'
import {
  INITIAL_VOICE_STATE,
  MIN_REPEAT_MS,
  NAME_GAP_MS,
  VOICE_REPLACE_FADE_MS,
  VOICE_STOP_FADE_MS,
  voiceForFrame,
  voicePlan,
  type ClipDuration,
  type VoiceCommand,
  type VoiceState,
} from './voiceCues'
import { VOICE_SPEAKER, parseVoiceManifest, type VoiceClipId } from './voices'

/** installed clips and their lengths (ms) */
const installed =
  (clips: Partial<Record<VoiceClipId, number>>): ClipDuration =>
  (id) =>
    clips[id] ?? null

const ALL: ClipDuration = installed({
  'fire_style.activation': 900,
  'fire_style.name': 1600,
  'chidori.activation': 700,
  'chidori.name': 800,
  'shadow_clone.activation': 600,
  'shadow_clone.name': 1500,
  'rasengan.activation': 1100,
  'rasengan.name': 900,
})

const FREE: Mode = { mode: 'free', jutsu: null }
const step = (jutsu: JutsuId, n: number, sign = 'tiger'): ShinobiEvent => ({ type: 'step', jutsu, step: n, total: 4, sign }) as ShinobiEvent
const fired = (jutsu: JutsuId, effect = jutsu === 'fire_style' ? 'fire' : jutsu): ShinobiEvent =>
  ({ type: 'jutsu', jutsu, effect }) as ShinobiEvent

interface TestFrame {
  seq: number
  events: ShinobiEvent[]
  mode?: Mode
  at?: number
}

/** Runs frames like useSessionSounds does: voice first, then the sound effects, carrying both states. */
function run(frames: TestFrame[], durations: ClipDuration = ALL, start: VoiceState = INITIAL_VOICE_STATE) {
  let state = start
  let cues: CueState = INITIAL_CUE_STATE
  const voice: VoiceCommand[][] = []
  const missing: VoiceClipId[][] = []
  const sfx: string[][] = []
  for (const f of frames) {
    const r = voiceForFrame(state, { seq: f.seq, events: f.events, mode: f.mode ?? FREE }, durations, f.at ?? f.seq * 66)
    state = r.state
    voice.push(r.commands)
    missing.push(r.missing)
    const s = soundsForFrame(cues, { events: f.events, progress: {} }, f.at ?? f.seq * 66)
    cues = s.state
    sfx.push(s.commands.map((c) => `${c.kind}:${c.cue}`))
  }
  return { state, voice, missing, sfx }
}

const played = (cmds: VoiceCommand[]) => cmds.filter((c) => c.kind === 'play').map((c) => (c.kind === 'play' ? c.plan : null))

describe('character voice: only a backend-fired jutsu speaks', () => {
  it('a complete correct sequence: activation first, then the name right after it', () => {
    const { voice } = run([
      { seq: 1, events: [{ type: 'sign', sign: 'snake' } as ShinobiEvent, step('rasengan', 1)] },
      { seq: 2, events: [step('rasengan', 2)] },
      { seq: 3, events: [step('rasengan', 3)] },
      { seq: 4, events: [fired('rasengan')] },
    ])
    expect(voice.slice(0, 3)).toEqual([[], [], []]) // steps never speak
    expect(voice[3]).toEqual([
      {
        kind: 'play',
        plan: {
          key: '4:rasengan',
          jutsu: 'rasengan',
          clips: [
            { id: 'rasengan.activation', atMs: 0, durationMs: 1100 },
            { id: 'rasengan.name', atMs: 1100 + NAME_GAP_MS, durationMs: 900 },
          ],
          endMs: 1100 + NAME_GAP_MS + 900,
        },
      },
    ])
  })

  it('each jutsu uses its own clips (Naruto: fire, clone, rasengan; Sasuke: chidori)', () => {
    for (const jutsu of ['fire_style', 'chidori', 'shadow_clone', 'rasengan'] as const) {
      const [plan] = played(run([{ seq: 7, events: [fired(jutsu)] }]).voice[0])
      expect(plan?.clips.map((c) => c.id)).toEqual([`${jutsu}.activation`, `${jutsu}.name`])
    }
    expect(VOICE_SPEAKER).toEqual({ fire_style: 'Naruto', chidori: 'Sasuke', shadow_clone: 'Naruto', rasengan: 'Naruto' })
  })

  it('wrong signs, timeouts and incomplete sequences never speak', () => {
    const { voice, missing } = run([
      { seq: 1, events: [step('chidori', 1, 'ox')] },
      { seq: 2, events: [step('chidori', 2, 'hare')] },
      { seq: 3, events: [step('chidori', 3, 'monkey')] }, // one step short
      {
        seq: 4,
        events: [{ type: 'sequence_failed', reason: 'wrong_sign', jutsu: 'chidori', step: 3, expected: 'monkey', got: 'dog' } as ShinobiEvent],
      },
      { seq: 5, events: [step('fire_style', 1, 'snake')] },
      {
        seq: 6,
        events: [{ type: 'sequence_failed', reason: 'timeout', jutsu: 'fire_style', step: 1, expected: 'ram', got: null } as ShinobiEvent],
      },
      { seq: 7, events: [{ type: 'effect_stopping', effect: 'fire' } as ShinobiEvent, { type: 'effect_end', effect: 'fire' } as ShinobiEvent] },
      { seq: 8, events: [{ type: 'clones', count: 4 } as ShinobiEvent] },
    ])
    expect(voice.every((cmds) => cmds.length === 0)).toBe(true)
    expect(missing.every((m) => m.length === 0)).toBe(true)
  })

  it('the same activation delivered twice plays once; a real re-fire after the cooldown plays again', () => {
    const { voice } = run([
      { seq: 10, events: [fired('chidori')], at: 1000 },
      { seq: 10, events: [fired('chidori')], at: 1010 }, // the same frame again
      { seq: 11, events: [fired('chidori')], at: 1000 + MIN_REPEAT_MS - 1 }, // impossible after a real fire
      { seq: 40, events: [fired('chidori')], at: 1000 + 1600 }, // after the 1.5 s backend cooldown
    ])
    expect(voice.map((cmds) => played(cmds).length)).toEqual([1, 0, 0, 1])
  })

  it('missing clips are skipped, never replaced by another clip or sound', () => {
    const onlyName = installed({ 'shadow_clone.name': 1500, 'rasengan.activation': 1000, 'rasengan.name': 900 })
    const { voice, missing, sfx } = run([{ seq: 3, events: [fired('shadow_clone', 'shadow_clone')] }], onlyName)
    expect(voice[0]).toEqual([
      { kind: 'play', plan: { key: '3:shadow_clone', jutsu: 'shadow_clone', clips: [{ id: 'shadow_clone.name', atMs: 0, durationMs: 1500 }], endMs: 1500 } },
    ])
    expect(missing[0]).toEqual(['shadow_clone.activation'])
    // the jutsu's own sound effects still play, unchanged (an older server: the release at once)
    expect(sfx[0]).toEqual(['play:shadow_clone.duplicate', 'play:shadow_clone.clone_appear'])

    const none = run([{ seq: 4, events: [fired('chidori')] }], onlyName)
    expect(none.voice[0]).toEqual([{ kind: 'stop', fadeMs: VOICE_REPLACE_FADE_MS }]) // nothing to say: the old voice ends
    expect(none.missing[0]).toEqual(['chidori.activation', 'chidori.name'])
    expect(none.sfx[0]).toEqual(['play:chidori.activation_zap', 'play:chidori.thunder_impact', 'loop:chidori.crackle_loop'])
  })

  it('no voice clip installed at all (today): the sound effects are exactly as before', () => {
    const nothing: ClipDuration = () => null
    for (const jutsu of ['fire_style', 'chidori', 'shadow_clone', 'rasengan'] as const) {
      const withVoice = run([{ seq: 5, events: [fired(jutsu)] }], nothing)
      const reference = soundsForFrame(INITIAL_CUE_STATE, { events: [fired(jutsu)], progress: {} }, 5 * 66)
      expect(withVoice.sfx[0]).toEqual(reference.commands.map((c) => `${c.kind}:${c.cue}`))
      expect(played(withVoice.voice[0])).toEqual([])
    }
  })

  it('a new activation replaces the previous voice (the engine stops it before playing)', () => {
    const { voice } = run([
      { seq: 1, events: [fired('rasengan')], at: 0 },
      { seq: 30, events: [{ type: 'effect_end', effect: 'rasengan' } as ShinobiEvent, fired('shadow_clone', 'shadow_clone')], at: 1700 },
    ])
    expect(played(voice[1]).map((p) => p?.jutsu)).toEqual(['shadow_clone'])
  })

  it('switching mode (another practised jutsu, free play) stops the voice', () => {
    const practice = (jutsu: JutsuId): Mode => ({ mode: 'practice', jutsu })
    const { voice } = run([
      { seq: 1, events: [fired('chidori')], mode: practice('chidori') },
      { seq: 2, events: [], mode: practice('chidori') },
      { seq: 3, events: [], mode: practice('rasengan') },
      { seq: 4, events: [], mode: FREE },
      { seq: 5, events: [], mode: FREE },
    ])
    expect(voice.slice(1)).toEqual([[], [{ kind: 'stop', fadeMs: VOICE_STOP_FADE_MS }], [{ kind: 'stop', fadeMs: VOICE_STOP_FADE_MS }], []])
  })

  it('voicePlan: clips with a zero or unknown length count as missing', () => {
    const r = voicePlan('9:fire_style', 'fire_style', installed({ 'fire_style.activation': 0, 'fire_style.name': 1200 }))
    expect(r.plan.clips).toEqual([{ id: 'fire_style.name', atMs: 0, durationMs: 1200 }])
    expect(r.missing).toEqual(['fire_style.activation'])
  })
})

const STAGES = { voice: 1.2, charge: 1.2, name: 1.0 }
const firedTimeline = (jutsu: JutsuId, effect = jutsu === 'fire_style' ? 'fire' : jutsu): ShinobiEvent =>
  ({ type: 'jutsu', jutsu, effect, stages: STAGES }) as ShinobiEvent
const phaseEv = (jutsu: JutsuId, p: 'charge' | 'name' | 'release', effect = jutsu === 'fire_style' ? 'fire' : jutsu): ShinobiEvent =>
  ({ type: 'effect_phase', jutsu, effect, phase: p }) as ShinobiEvent

describe('character voice on the activation timeline', () => {
  it('activation clip at the confirmation, name clip at the name phase (after the charge)', () => {
    const { voice } = run([
      { seq: 4, events: [firedTimeline('rasengan')] },
      { seq: 20, events: [phaseEv('rasengan', 'charge')] },
      { seq: 40, events: [phaseEv('rasengan', 'name')] },
      { seq: 55, events: [phaseEv('rasengan', 'release')] },
    ])
    expect(voice[0]).toEqual([
      { kind: 'play', plan: { key: '4:rasengan', jutsu: 'rasengan', clips: [{ id: 'rasengan.activation', atMs: 0, durationMs: 1100 }], endMs: 1100 } },
    ])
    expect(voice[1]).toEqual([]) // the charge: no voice
    expect(voice[2]).toEqual([
      { kind: 'play', plan: { key: '4:rasengan:name', jutsu: 'rasengan', clips: [{ id: 'rasengan.name', atMs: 0, durationMs: 900 }], endMs: 900 } },
    ])
    expect(voice[3]).toEqual([]) // the release: the sound effects take over
  })

  it('each jutsu: its own activation, then its own name; never twice', () => {
    for (const jutsu of ['fire_style', 'chidori', 'shadow_clone', 'rasengan'] as const) {
      const { voice } = run([
        { seq: 1, events: [firedTimeline(jutsu)] },
        { seq: 2, events: [phaseEv(jutsu, 'name')] },
        { seq: 3, events: [phaseEv(jutsu, 'name')] }, // a duplicate phase event
      ])
      expect(played(voice[0]).map((p) => p?.clips.map((c) => c.id))).toEqual([[`${jutsu}.activation`]])
      expect(played(voice[1]).map((p) => p?.clips.map((c) => c.id))).toEqual([[`${jutsu}.name`]])
      expect(voice[2]).toEqual([])
    }
  })

  it('no name after the effect ended, nor for another activation', () => {
    const ended = run([
      { seq: 1, events: [firedTimeline('chidori')] },
      { seq: 2, events: [{ type: 'effect_stopping', effect: 'chidori' } as ShinobiEvent] },
      { seq: 3, events: [phaseEv('chidori', 'name')] },
    ])
    expect(ended.voice[2]).toEqual([])
    const other = run([
      { seq: 1, events: [firedTimeline('chidori')] },
      { seq: 2, events: [phaseEv('rasengan', 'name')] },
    ])
    expect(other.voice[1]).toEqual([])
  })

  it('missing clips are skipped one by one: the activation at the confirmation, the name at its phase', () => {
    const nothing: ClipDuration = () => null
    const { voice, missing } = run(
      [
        { seq: 1, events: [firedTimeline('shadow_clone')] },
        { seq: 2, events: [phaseEv('shadow_clone', 'name')] },
      ],
      nothing,
    )
    expect(voice[0]).toEqual([{ kind: 'stop', fadeMs: VOICE_REPLACE_FADE_MS }])
    expect(voice[1]).toEqual([])
    expect(missing).toEqual([['shadow_clone.activation'], ['shadow_clone.name']])
  })

  it('a mode change between the activation and its name: no name', () => {
    const { voice } = run([
      { seq: 1, events: [firedTimeline('chidori')], mode: { mode: 'practice', jutsu: 'chidori' } },
      { seq: 2, events: [phaseEv('chidori', 'name')], mode: FREE },
    ])
    expect(voice[1]).toEqual([{ kind: 'stop', fadeMs: VOICE_STOP_FADE_MS }])
  })
})

describe('voice manifest (GET /api/voices)', () => {
  it('keeps only the voice folder files of known jutsu and parts', () => {
    const manifest = parseVoiceManifest({
      voices: {
        rasengan: { speaker: 'Naruto', activation: '/audio/voice/rasengan/activation.ogg', name: '/audio/voice/rasengan/name.mp3' },
        chidori: { speaker: 'Sasuke', activation: null, name: 'https://elsewhere.example/chidori.mp3' },
        fire_style: { speaker: 'Naruto', activation: '/audio/fire_style/ignition.wav', name: null },
        sharingan: { activation: '/audio/voice/sharingan/activation.ogg' },
      },
    })
    expect([...manifest]).toEqual([
      ['rasengan.activation', '/audio/voice/rasengan/activation.ogg'],
      ['rasengan.name', '/audio/voice/rasengan/name.mp3'],
    ])
    expect(parseVoiceManifest(null).size).toBe(0)
    expect(parseVoiceManifest({ voices: 'nope' }).size).toBe(0)
  })
})

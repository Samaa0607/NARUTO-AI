import { describe, expect, it } from 'vitest'
import type { EffectId, JutsuId, ShinobiEvent } from '../types/protocol'
import { CUES } from './cues'
import {
  CHARGE,
  CHARGE_RELEASE_FADE_MS,
  EFFECT_LOOP,
  ACCENT_VOLUME,
  HAND_SIGN_ACCENT,
  INITIAL_CUE_STATE,
  MAX_POOFS_PER_EVENT,
  POOF_GAP_MS,
  RELEASE,
  handSignSounds,
  SEAL_RISE,
  soundsForFrame,
  stepSound,
  type CueState,
  type SoundCommand,
} from './eventCues'
import { CUE_GAIN, outputVolume } from './gains'

type Progress = Parameters<typeof soundsForFrame>[1]['progress']

/** Runs frames through the mapper, carrying the state, like the session hook does. */
function run(frames: { events: ShinobiEvent[]; progress?: Progress; at?: number }[], start: CueState = INITIAL_CUE_STATE) {
  let state = start
  const out: SoundCommand[][] = []
  for (const f of frames) {
    const r = soundsForFrame(state, { events: f.events, progress: f.progress ?? {} }, f.at ?? 0)
    state = r.state
    out.push(r.commands)
  }
  return { state, out }
}

const step = (jutsu: JutsuId, n: number, sign = 'tiger'): ShinobiEvent =>
  ({ type: 'step', jutsu, step: n, total: 4, sign }) as ShinobiEvent
const STAGES = { voice: 0.4, charge: 1.2, name: 0.4 }
const fired = (jutsu: JutsuId, effect: EffectId, stages: typeof STAGES | null = STAGES): ShinobiEvent =>
  (stages ? { type: 'jutsu', jutsu, effect, stages } : { type: 'jutsu', jutsu, effect }) as ShinobiEvent
const phase = (jutsu: JutsuId, effect: EffectId, p: 'charge' | 'name' | 'release'): ShinobiEvent =>
  ({ type: 'effect_phase', jutsu, effect, phase: p }) as ShinobiEvent
const cues = (cmds: SoundCommand[]) => cmds.map((c) => `${c.kind}:${c.cue}`)
const accent = (jutsu: JutsuId) => `play:${HAND_SIGN_ACCENT[jutsu].cue}`
const PAIRS: [JutsuId, EffectId][] = [
  ['fire_style', 'fire'],
  ['chidori', 'chidori'],
  ['shadow_clone', 'shadow_clone'],
  ['rasengan', 'rasengan'],
]

describe('hand-sign sounds', () => {
  it('plays nothing for a frame without events, or a bare confirmed sign', () => {
    expect(run([{ events: [] }]).out[0]).toEqual([])
    expect(run([{ events: [{ type: 'sign', sign: 'dog' }] }]).out[0]).toEqual([])
  })

  it('a confirmed step: the hand seal and the jutsu accent, once per frame even when two jutsu advance', () => {
    const { out } = run([
      {
        events: [{ type: 'sign', sign: 'snake' }, step('chidori', 1, 'snake'), step('shadow_clone', 2, 'snake')],
        progress: { chidori: 1, shadow_clone: 2 },
      },
    ])
    expect(cues(out[0])).toEqual(['play:ui.hand_seal', accent('shadow_clone')])
    expect(out[0][0]).toEqual(stepSound({ jutsu: 'shadow_clone', step: 2 }))
  })

  it('the hand seal: the same file for every jutsu, unfiltered, a little higher with each step', () => {
    for (const jutsu of ['fire_style', 'chidori', 'shadow_clone', 'rasengan'] as const) {
      const rates = [1, 2, 3, 4].map((n) => {
        const c = stepSound({ jutsu, step: n })
        expect(c).toMatchObject({ kind: 'play', cue: 'ui.hand_seal', volume: 1 })
        expect(c.filter).toBeUndefined()
        return c.rate as number
      })
      expect(rates[0]).toBeCloseTo(1)
      for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThan(rates[i - 1])
    }
    expect(SEAL_RISE.slice(0, 4)).toEqual([0, 1, 2, 3])
  })

  it('each jutsu has its own accent file', () => {
    const files = Object.values(HAND_SIGN_ACCENT).map((a) => CUES[a.cue].url)
    expect(new Set(files).size).toBe(4)
    for (const [jutsu] of PAIRS) {
      const [seal, own] = handSignSounds({ jutsu, step: 1 })
      expect([seal.cue, own.cue]).toEqual(['ui.hand_seal', HAND_SIGN_ACCENT[jutsu].cue])
      expect(own.volume).toBeCloseTo((HAND_SIGN_ACCENT[jutsu].volume ?? 1) * ACCENT_VOLUME) // under the seal
    }
  })

  it('never twice for the same step of the same chain; again after the chain dropped', () => {
    const { out } = run([
      { events: [step('chidori', 1, 'snake')], progress: { chidori: 1 } },
      { events: [step('chidori', 1, 'snake')], progress: { chidori: 1 } }, // a duplicate delivery
      { events: [], progress: { chidori: 0 } }, // Retry / timeout without a step
      { events: [step('chidori', 1, 'snake')], progress: { chidori: 1 } }, // a new chain: heard
      { events: [step('chidori', 2, 'dog')], progress: { chidori: 2 } },
    ])
    const heard = ['play:ui.hand_seal', accent('chidori')]
    expect(out.map(cues)).toEqual([heard, [], [], heard, heard])
  })

  it('idle frames, signs, wrong signs and unknown events are silent', () => {
    const { out } = run([
      { events: [], progress: {} },
      { events: [{ type: 'sign', sign: 'ram' }], progress: {} },
      { events: [{ type: 'wrong_sign', jutsu: 'fire_style', step: 2, expected: 'horse', got: 'dog' }], progress: { fire_style: 2 } },
      { events: [{ type: 'sequence_failed', reason: 'wrong_sign', jutsu: 'fire_style', step: 2, expected: 'horse', got: 'dog' }] },
      { events: [{ type: 'something_new', x: 1 } as unknown as ShinobiEvent], progress: {} },
    ])
    expect(out).toEqual([[], [], [], [], []])
  })

  it('a timeout plays the soft failure cue', () => {
    const { out } = run([
      { events: [step('fire_style', 2, 'boar')], progress: { fire_style: 2 } },
      { events: [{ type: 'sequence_failed', reason: 'timeout', jutsu: 'fire_style', step: 2, expected: 'horse', got: null }], progress: { fire_style: 0 } },
    ])
    expect(cues(out[1])).toEqual(['play:ui.sequence_failed'])
  })
})

describe('activation timeline: confirmation, voice, charge, name, release', () => {
  it('the confirmation (`jutsu` with stages): only the last sign hand-sign sound, nothing released yet', () => {
    for (const [jutsu, effect] of PAIRS) {
      const { out, state } = run([{ events: [fired(jutsu, effect)] }])
      expect(cues(out[0])).toEqual(['play:ui.hand_seal', accent(jutsu)])
      expect(out[0][0]).toEqual(stepSound({ jutsu, step: 4 }))
      expect(state.activation).toEqual({ jutsu, effect, charged: false, released: false })
    }
  })

  it('charge phase: that jutsu charge sound, once', () => {
    for (const [jutsu, effect] of PAIRS) {
      const { out } = run([{ events: [fired(jutsu, effect)] }, { events: [phase(jutsu, effect, 'charge')] }, { events: [phase(jutsu, effect, 'charge')] }])
      expect(out[1]).toEqual(CHARGE[jutsu])
      expect(out[2]).toEqual([]) // a duplicate phase event: no second charge
    }
  })

  it('name phase: no sound effect (the character says the name; the charge goes on)', () => {
    const { out } = run([
      { events: [fired('rasengan', 'rasengan')] },
      { events: [phase('rasengan', 'rasengan', 'charge')] },
      { events: [phase('rasengan', 'rasengan', 'name')] },
    ])
    expect(out[2]).toEqual([])
  })

  it('release phase: the charge fades out, the main sounds and the impact play, once', () => {
    for (const [jutsu, effect] of PAIRS) {
      const { out } = run([
        { events: [fired(jutsu, effect)] },
        { events: [phase(jutsu, effect, 'charge')] },
        { events: [phase(jutsu, effect, 'name')] },
        { events: [phase(jutsu, effect, 'release')] },
        { events: [phase(jutsu, effect, 'release')] },
      ])
      const stops = CHARGE[jutsu].map((c) => ({ kind: 'stop', cue: c.cue, fadeMs: CHARGE_RELEASE_FADE_MS }))
      expect(out[3]).toEqual([...stops, ...RELEASE[effect]])
      expect(out[4]).toEqual([])
    }
    // every release has an impact or a duplication sound with its main sound
    expect(cues(RELEASE.fire)).toContain('play:fire_style.impact')
    expect(cues(RELEASE.chidori)).toContain('play:chidori.thunder_impact')
    expect(cues(RELEASE.rasengan)).toContain('play:rasengan.wind_impact')
    expect(cues(RELEASE.shadow_clone)).toContain('play:shadow_clone.duplicate')
  })

  it('the loop of a release starts after its one-shots', () => {
    for (const effect of ['fire', 'chidori', 'rasengan'] as const) {
      const loop = RELEASE[effect].find((c) => c.kind === 'loop')
      expect(loop && loop.kind === 'loop' && (loop.delayMs ?? 0) > 0).toBe(true)
    }
  })

  it('phases of another activation, or without one, are ignored', () => {
    const { out } = run([
      { events: [phase('chidori', 'chidori', 'release')] }, // no activation
      { events: [fired('fire_style', 'fire')] },
      { events: [phase('chidori', 'chidori', 'charge')] }, // not the running one
    ])
    expect(out[0]).toEqual([])
    expect(out[2]).toEqual([])
  })

  it('stopped during the build-up: the charge stops, no release sounds', () => {
    const { out, state } = run([
      { events: [fired('chidori', 'chidori')] },
      { events: [phase('chidori', 'chidori', 'charge')] },
      { events: [{ type: 'effect_stopping', effect: 'chidori' }] },
      { events: [{ type: 'effect_end', effect: 'chidori' }] },
    ])
    expect(cues(out[2])).toEqual(['stop:chidori.lightning_charge', 'play:chidori.impact', 'stop:chidori.crackle_loop'])
    expect(cues(out[3])).toEqual(['stop:chidori.crackle_loop'])
    expect(state.activation).toBeNull()
  })

  it('an older server (`jutsu` without stages): the release sounds at once', () => {
    for (const [jutsu, effect] of PAIRS) {
      const { out, state } = run([{ events: [fired(jutsu, effect, null)] }])
      expect(out[0]).toEqual(RELEASE[effect])
      expect(state.activation).toBeNull()
    }
  })

  it('effect_stopping plays the ending of each effect', () => {
    const end = (effect: EffectId) => run([{ events: [{ type: 'effect_stopping', effect }] }]).out[0]
    expect(cues(end('chidori'))).toEqual(['play:chidori.impact', 'stop:chidori.crackle_loop'])
    expect(cues(end('fire'))).toEqual(['stop:fire_style.burning_loop'])
    expect(cues(end('shadow_clone'))).toEqual(['play:shadow_clone.clone_disappear', 'play:shadow_clone.smoke_poof'])
    const rasengan = end('rasengan')
    expect(cues(rasengan)).toEqual(['play:rasengan.impact', 'stop:rasengan.energy_loop'])
    expect(rasengan[0]).toMatchObject({ fadeOutAfterMs: expect.any(Number), fadeOutMs: expect.any(Number) })
  })

  it('effect_end stops that effect loop', () => {
    for (const effect of ['fire', 'chidori', 'rasengan'] as const) {
      const cmds = run([{ events: [{ type: 'effect_end', effect }] }]).out[0]
      expect(cmds).toEqual([{ kind: 'stop', cue: EFFECT_LOOP[effect], fadeMs: expect.any(Number) }])
    }
    expect(run([{ events: [{ type: 'effect_end', effect: 'shadow_clone' }] }]).out[0]).toEqual([])
  })

  it('clones: one smoke poof per newly visible clone, spaced and capped', () => {
    const { out, state } = run([
      { events: [fired('shadow_clone', 'shadow_clone')], at: 0 },
      { events: [phase('shadow_clone', 'shadow_clone', 'release')], at: 900 },
      { events: [{ type: 'clones', count: 2 }], at: 1000 },
      { events: [{ type: 'clones', count: 10 }], at: 1100 },
    ])
    const poofs1 = out[2].filter((c) => c.cue === 'shadow_clone.smoke_poof')
    expect(poofs1).toHaveLength(2)
    expect(poofs1.map((c) => (c.kind === 'play' ? c.delayMs : -1))).toEqual([0, POOF_GAP_MS])
    // 8 new clones at once: capped, and spaced after the previous poofs
    const poofs2 = out[3].filter((c) => c.cue === 'shadow_clone.smoke_poof')
    expect(poofs2).toHaveLength(MAX_POOFS_PER_EVENT)
    const delays = poofs2.map((c) => (c.kind === 'play' ? (c.delayMs ?? 0) : -1))
    expect(delays[0]).toBe(1000 + 2 * POOF_GAP_MS - 1100)
    for (let i = 1; i < delays.length; i++) expect(delays[i] - delays[i - 1]).toBe(POOF_GAP_MS)
    expect(state.clones).toBe(10)
  })

  it('clones: no poof when the count does not grow, counter resets on a new activation', () => {
    const { out } = run([
      { events: [{ type: 'clones', count: 4 }], at: 0 },
      { events: [{ type: 'clones', count: 4 }], at: 2000 },
      { events: [{ type: 'effect_end', effect: 'shadow_clone' }, fired('shadow_clone', 'shadow_clone')], at: 3000 },
      { events: [{ type: 'clones', count: 1 }], at: 4000 },
    ])
    expect(out[0].filter((c) => c.cue === 'shadow_clone.smoke_poof')).toHaveLength(3)
    expect(out[1]).toEqual([])
    expect(out[3].filter((c) => c.cue === 'shadow_clone.smoke_poof')).toHaveLength(1)
  })

  it('the full Fire Style flow, frame by frame', () => {
    const { out } = run([
      { events: [{ type: 'sign', sign: 'monkey' }, step('fire_style', 1, 'monkey')], progress: { fire_style: 1 } },
      { events: [{ type: 'sign', sign: 'boar' }, step('fire_style', 2, 'boar')], progress: { fire_style: 2 } },
      { events: [{ type: 'wrong_sign', jutsu: 'fire_style', step: 2, expected: 'horse', got: 'dog' }], progress: { fire_style: 2 } },
      { events: [{ type: 'sign', sign: 'horse' }, step('fire_style', 3, 'horse')], progress: { fire_style: 3 } },
      { events: [{ type: 'sign', sign: 'tiger' }, fired('fire_style', 'fire')], progress: { fire_style: 0 } },
      { events: [phase('fire_style', 'fire', 'charge')] },
      { events: [phase('fire_style', 'fire', 'name')] },
      { events: [phase('fire_style', 'fire', 'release')] },
      { events: [{ type: 'effect_stopping', effect: 'fire' }] },
      { events: [{ type: 'effect_end', effect: 'fire' }] },
    ])
    const sign = ['play:ui.hand_seal', 'play:fire_style.hand_sign']
    expect(out.map(cues)).toEqual([
      sign,
      sign,
      [], // the wrong sign: silent, progress kept
      sign,
      sign, // the 4th sign confirms the sequence
      ['play:fire_style.prepare_inhale', 'play:fire_style.charge_rise'],
      [],
      [
        'stop:fire_style.prepare_inhale',
        'stop:fire_style.charge_rise',
        'play:fire_style.ignition',
        'play:fire_style.flame_burst',
        'play:fire_style.impact',
        'loop:fire_style.burning_loop',
      ],
      ['stop:fire_style.burning_loop'],
      ['stop:fire_style.burning_loop'],
    ])
  })
})

describe('cues and levels', () => {
  it('every cue used by the mapping exists and has a gain', () => {
    const used = new Set<string>([
      ...Object.values(CHARGE).flatMap((c) => c.map((x) => x.cue)),
      ...Object.values(RELEASE).flatMap((c) => c.map((x) => x.cue)),
      ...Object.values(HAND_SIGN_ACCENT).map((a) => a.cue),
      ...Object.values(EFFECT_LOOP),
      'ui.hand_seal',
      'ui.sequence_failed',
    ])
    for (const cue of used) expect(cue in CUES).toBe(true)
    for (const cue of Object.keys(CUES)) {
      const g = CUE_GAIN[cue as keyof typeof CUES]
      expect(g).toBeGreaterThan(0)
      expect(g).toBeLessThanOrEqual(2)
    }
    expect(Object.keys(CUES)).toHaveLength(32)
  })

  it('output volume = master x sfx, 0 when muted', () => {
    expect(outputVolume({ masterVolume: 0.5, sfxVolume: 0.8, muted: false })).toBeCloseTo(0.4)
    expect(outputVolume({ masterVolume: 1, sfxVolume: 1, muted: true })).toBe(0)
  })
})

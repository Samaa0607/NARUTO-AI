// The jutsu sequence music: the planner (backend frames -> music commands) and the player on a fake
// Web Audio context (node has none), plus the three volume buses of the engine.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EffectId, JutsuId, ShinobiEvent } from '../types/protocol'
import { SoundEngine } from './engine'
import {
  CROSSFADE_MS,
  DUCK_ACTIVATION,
  FADE_IN_MS,
  INITIAL_MUSIC_STATE,
  leader,
  musicForFrame,
  RELEASE_FADE_MS,
  RESET_FADE_MS,
  TRACKS,
  type MusicCommand,
  type MusicState,
} from './jutsuMusic'
import { JutsuMusicPlayer, type MusicHost } from './jutsuMusicPlayer'

type Progress = Partial<Record<JutsuId, number>>

function run(frames: { events?: ShinobiEvent[]; progress?: Progress }[], start: MusicState = INITIAL_MUSIC_STATE) {
  let state = start
  const out: MusicCommand[][] = []
  for (const f of frames) {
    const r = musicForFrame(state, { events: f.events ?? [], progress: f.progress ?? {} })
    state = r.state
    out.push(r.commands)
  }
  return { state, out }
}

const step = (jutsu: JutsuId, n: number): ShinobiEvent => ({ type: 'step', jutsu, step: n, total: 4, sign: 'tiger' }) as ShinobiEvent
const fired = (jutsu: JutsuId, effect: EffectId, stages = true): ShinobiEvent =>
  (stages ? { type: 'jutsu', jutsu, effect, stages: { voice: 0.4, charge: 1.2, name: 0.4 } } : { type: 'jutsu', jutsu, effect }) as ShinobiEvent
const phase = (jutsu: JutsuId, effect: EffectId, p: 'charge' | 'name' | 'release'): ShinobiEvent =>
  ({ type: 'effect_phase', jutsu, effect, phase: p }) as ShinobiEvent
const wrong = (jutsu: JutsuId, n: number): ShinobiEvent => ({ type: 'wrong_sign', jutsu, step: n, expected: 'horse', got: 'dog' }) as ShinobiEvent

describe('jutsu music: the planner', () => {
  it('nothing before a confirmed step; the first step starts its jutsu track with a fade-in', () => {
    const { out, state } = run([{ progress: {} }, { events: [{ type: 'sign', sign: 'monkey' } as ShinobiEvent], progress: {} }, { events: [step('fire_style', 1)], progress: { fire_style: 1 } }])
    expect(out[0]).toEqual([])
    expect(out[1]).toEqual([])
    expect(out[2]).toEqual([{ kind: 'start', jutsu: 'fire_style', fadeMs: FADE_IN_MS }, { kind: 'pulse' }])
    expect(state.track).toBe('fire_style')
  })

  it('keeps one track while its jutsu leads; another jutsu with MORE steps crossfades, a tie does not', () => {
    const { out } = run([
      { events: [step('fire_style', 1)], progress: { fire_style: 1 } },
      { events: [step('fire_style', 2)], progress: { fire_style: 2 } },
      { events: [step('chidori', 1)], progress: { fire_style: 2, chidori: 1 } }, // behind: no change
      { events: [step('chidori', 2)], progress: { fire_style: 2, chidori: 2 } }, // a tie: the playing one stays
      { events: [step('chidori', 3)], progress: { fire_style: 2, chidori: 3 } }, // ahead: crossfade
    ])
    expect(out.map((c) => c.filter((x) => x.kind !== 'pulse'))).toEqual([
      [{ kind: 'start', jutsu: 'fire_style', fadeMs: FADE_IN_MS }],
      [],
      [],
      [],
      [{ kind: 'start', jutsu: 'chidori', fadeMs: CROSSFADE_MS }],
    ])
  })

  it('a dip under every hand seal (each step, and the last sign at `jutsu`), never for a wrong sign', () => {
    const { out } = run([
      { events: [step('rasengan', 1)], progress: { rasengan: 1 } },
      { events: [step('rasengan', 2)], progress: { rasengan: 2 } },
      { events: [wrong('rasengan', 2)], progress: { rasengan: 2 } },
      { events: [{ type: 'sign', sign: 'dog' } as ShinobiEvent], progress: { rasengan: 2 } },
      { events: [step('rasengan', 3)], progress: { rasengan: 3 } },
    ])
    expect(out.map((c) => c.filter((x) => x.kind === 'pulse').length)).toEqual([1, 1, 0, 0, 1])
    expect(out[2]).toEqual([]) // a wrong sign keeps the progress: the music goes on unchanged
  })

  it('the sequence completes: ducked under the build-up, faded out at the release, nothing new until effect_end', () => {
    const { out, state } = run([
      { events: [step('shadow_clone', 3)], progress: { shadow_clone: 3 } },
      { events: [fired('shadow_clone', 'shadow_clone')], progress: { shadow_clone: 0 } },
      { events: [phase('shadow_clone', 'shadow_clone', 'charge')], progress: {} },
      { events: [phase('shadow_clone', 'shadow_clone', 'name')], progress: {} },
      { events: [phase('shadow_clone', 'shadow_clone', 'release')], progress: {} },
      { events: [step('rasengan', 1)], progress: { rasengan: 1 } }, // a new sequence during the effect: wait
      { events: [{ type: 'effect_end', effect: 'shadow_clone' } as ShinobiEvent], progress: { rasengan: 1 } },
    ])
    expect(out[1]).toEqual([{ kind: 'duck', level: DUCK_ACTIVATION, rampMs: 300 }, { kind: 'pulse' }])
    expect(out[2]).toEqual([])
    expect(out[3]).toEqual([])
    expect(out[4]).toEqual([{ kind: 'fadeOut', fadeMs: RELEASE_FADE_MS }])
    expect(out[5]).toEqual([])
    expect(out[6]).toEqual([{ kind: 'start', jutsu: 'rasengan', fadeMs: FADE_IN_MS }])
    expect(state).toEqual({ track: 'rasengan', activation: null })
  })

  it('progress back to 0 without a jutsu (timeout, Start over, another mode): a 1 s fade-out', () => {
    const { out, state } = run([
      { events: [step('chidori', 2)], progress: { chidori: 2 } },
      { events: [{ type: 'sequence_failed', reason: 'timeout', jutsu: 'chidori', step: 2, expected: 'tiger', got: null } as ShinobiEvent], progress: { chidori: 0 } },
      { progress: {} },
    ])
    expect(out[1]).toEqual([{ kind: 'fadeOut', fadeMs: RESET_FADE_MS }])
    expect(out[2]).toEqual([])
    expect(state.track).toBeNull()
  })

  it('a timed-out jutsu hands the music to another one still in progress (crossfade)', () => {
    const { out } = run([
      { events: [step('fire_style', 2)], progress: { fire_style: 2, chidori: 1 } },
      { progress: { fire_style: 0, chidori: 1 } },
    ])
    expect(out[1]).toEqual([{ kind: 'start', jutsu: 'chidori', fadeMs: CROSSFADE_MS }])
  })

  it('an older server (no stages): the music fades out as the effect starts', () => {
    const { out } = run([
      { events: [step('fire_style', 3)], progress: { fire_style: 3 } },
      { events: [fired('fire_style', 'fire', false)], progress: { fire_style: 0 } },
    ])
    expect(out[1]).toEqual([{ kind: 'fadeOut', fadeMs: RELEASE_FADE_MS }])
  })

  it('an activation stopped during its build-up does not leave the music ducked', () => {
    const { out } = run([
      { events: [step('chidori', 3)], progress: { chidori: 3 } },
      { events: [fired('chidori', 'chidori')], progress: {} },
      { events: [{ type: 'effect_stopping', effect: 'chidori' } as ShinobiEvent], progress: {} },
    ])
    expect(out[2]).toEqual([{ kind: 'fadeOut', fadeMs: RELEASE_FADE_MS }])
  })

  it('Practice: minutes on one step change nothing (no restart, no fade)', () => {
    const frames = [{ events: [step('rasengan', 2)], progress: { rasengan: 2 } as Progress }]
    for (let i = 0; i < 3000; i++) frames.push({ events: [], progress: { rasengan: 2 } })
    const { out } = run(frames)
    expect(out.slice(1).every((c) => c.length === 0)).toBe(true)
  })

  it('leader: most steps; the playing one wins a tie', () => {
    const order: JutsuId[] = ['fire_style', 'chidori', 'shadow_clone', 'rasengan']
    expect(leader({}, order, null)).toBeNull()
    expect(leader({ chidori: 1, rasengan: 2 }, order, null)).toBe('rasengan')
    expect(leader({ fire_style: 2, chidori: 2 }, order, null)).toBe('fire_style')
    expect(leader({ fire_style: 2, chidori: 2 }, order, 'chidori')).toBe('chidori')
  })

  it('four different tracks', () => {
    expect(new Set(Object.values(TRACKS).map((t) => t.url)).size).toBe(4)
  })
})

// ------------------------------------------------------------------ fake Web Audio
type Call = [string, ...number[]]
class FakeParam {
  value: number
  calls: Call[] = []
  constructor(value: number) {
    this.value = value
  }
  setValueAtTime(v: number, t: number) {
    this.calls.push(['set', v, t])
    this.value = v
  }
  setTargetAtTime(v: number, t: number, c: number) {
    this.calls.push(['target', v, t, c])
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(['ramp', v, t])
  }
  cancelScheduledValues(t: number) {
    this.calls.push(['cancel', t])
  }
  cancelAndHoldAtTime(t: number) {
    this.calls.push(['hold', t])
  }
}
class FakeNode {
  outputs: FakeNode[] = []
  connect(node: FakeNode) {
    this.outputs.push(node)
    return node
  }
  disconnect() {
    this.outputs = []
  }
}
class FakeGain extends FakeNode {
  gain = new FakeParam(1)
}
class FakeSource extends FakeNode {
  buffer: { duration: number; url: string } | null = null
  loop = false
  playbackRate = new FakeParam(1)
  startedAt: number | null = null
  stops: number[] = []
  onended: (() => void) | null = null
  start(t = 0) {
    this.startedAt = t
  }
  stop(t = 0) {
    this.stops.push(t)
  }
}
class FakeContext {
  currentTime = 10
  state: AudioContextState = 'running'
  destination = new FakeNode()
  onstatechange: (() => void) | null = null
  gains: FakeGain[] = []
  sources: FakeSource[] = []
  createGain() {
    const g = new FakeGain()
    this.gains.push(g)
    return g
  }
  createBufferSource() {
    const s = new FakeSource()
    this.sources.push(s)
    return s
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam(350), Q: new FakeParam(1) })
  }
  createDynamicsCompressor() {
    const n = new FakeNode() as FakeNode & Record<string, { value: number }>
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = { value: 0 }
    return n
  }
  async decodeAudioData(bytes: ArrayBuffer) {
    return { duration: 30, url: new TextDecoder().decode(bytes) }
  }
  async resume() {
    this.state = 'running'
  }
  async close() {}
}

async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

/** a player on a fake bus; `ready` decides whether audio is allowed yet */
function playerSetup() {
  const ctx = new FakeContext()
  const input = new FakeGain()
  const listeners = new Set<() => void>()
  let ready = true
  const fetched: string[] = []
  const host: MusicHost = {
    musicBus: () => (ready ? { ctx: ctx as unknown as AudioContext, input: input as unknown as AudioNode } : null),
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
  const fetchImpl = (async (url: RequestInfo | URL) => {
    fetched.push(String(url))
    return new Response(new TextEncoder().encode(String(url)), { status: 200 })
  }) as typeof fetch
  const player = new JutsuMusicPlayer(host, fetchImpl)
  return {
    ctx,
    input,
    player,
    fetched,
    setReady(value: boolean) {
      ready = value
      listeners.forEach((l) => l())
    },
  }
}

const trackSource = (ctx: FakeContext, jutsu: JutsuId) => ctx.sources.filter((s) => s.buffer?.url === TRACKS[jutsu].url)

describe('jutsu music: the player', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('fades the track in, looped, through the activation duck and the step dip, into the music bus', async () => {
    const { ctx, input, player } = playerSetup()
    player.run([{ kind: 'start', jutsu: 'chidori', fadeMs: FADE_IN_MS }])
    await settle()
    const [source] = trackSource(ctx, 'chidori')
    expect(source.loop).toBe(true)
    expect(source.startedAt).toBe(10)
    const gain = source.outputs[0] as FakeGain
    expect(gain.gain.calls).toContainEqual(['ramp', TRACKS.chidori.gain, 10 + FADE_IN_MS / 1000])
    const duck = gain.outputs[0] as FakeGain
    const dip = duck.outputs[0] as FakeGain
    expect(dip.outputs[0]).toBe(input)
    expect(player.isPlaying()).toBe(true)
    expect(player.playing()).toBe('chidori')
  })

  it('crossfades to another jutsu; going back to a fading track brings that copy back (never two copies)', async () => {
    const { ctx, player } = playerSetup()
    player.run([{ kind: 'start', jutsu: 'fire_style', fadeMs: FADE_IN_MS }])
    await settle()
    player.run([{ kind: 'start', jutsu: 'rasengan', fadeMs: CROSSFADE_MS }])
    await settle()
    const [fire] = trackSource(ctx, 'fire_style')
    const fireGain = (fire.outputs[0] as FakeGain).gain.calls
    expect(fireGain).toContainEqual(['ramp', 0, 10 + CROSSFADE_MS / 1000])
    expect(fire.stops.at(-1)).toBeCloseTo(10 + CROSSFADE_MS / 1000 + 0.05)
    expect(player.playing()).toBe('rasengan')
    player.run([{ kind: 'start', jutsu: 'fire_style', fadeMs: CROSSFADE_MS }]) // back while it still fades
    await settle()
    expect(trackSource(ctx, 'fire_style')).toHaveLength(1)
    expect(fireGain.at(-1)).toEqual(['ramp', TRACKS.fire_style.gain, 10 + CROSSFADE_MS / 1000])
    expect(player.playing()).toBe('fire_style')
  })

  it('the activation duck, the dip under a hand seal and the fade-out', async () => {
    const { ctx, player } = playerSetup()
    player.run([{ kind: 'start', jutsu: 'shadow_clone', fadeMs: FADE_IN_MS }])
    await settle()
    const [source] = trackSource(ctx, 'shadow_clone')
    const duck = source.outputs[0].outputs[0] as FakeGain
    const dip = duck.outputs[0] as FakeGain
    player.run([{ kind: 'pulse' }])
    expect(dip.gain.calls.filter((c) => c[0] === 'target').map((c) => c[1])).toEqual([0.5, 1])
    player.run([{ kind: 'duck', level: DUCK_ACTIVATION, rampMs: 300 }])
    expect(duck.gain.calls.at(-1)).toEqual(['ramp', DUCK_ACTIVATION, 10.3])
    player.run([{ kind: 'fadeOut', fadeMs: RELEASE_FADE_MS }])
    expect((source.outputs[0] as FakeGain).gain.calls.at(-1)).toEqual(['ramp', 0, 10 + RELEASE_FADE_MS / 1000])
    expect(player.isPlaying()).toBe(false)
  })

  it('waits for the browser to allow audio, then starts the wanted track', async () => {
    const { ctx, player, fetched, setReady } = playerSetup()
    setReady(false)
    player.run([{ kind: 'start', jutsu: 'rasengan', fadeMs: FADE_IN_MS }])
    await settle()
    expect(fetched).toEqual([])
    setReady(true)
    await settle()
    expect(trackSource(ctx, 'rasengan')).toHaveLength(1)
  })

  it('Settings off: fades out and plays nothing; on again: the wanted track comes back', async () => {
    const { ctx, player } = playerSetup()
    player.run([{ kind: 'start', jutsu: 'chidori', fadeMs: FADE_IN_MS }])
    await settle()
    player.setEnabled(false)
    expect(player.isPlaying()).toBe(false)
    player.run([{ kind: 'start', jutsu: 'chidori', fadeMs: FADE_IN_MS }])
    await settle()
    expect(trackSource(ctx, 'chidori')).toHaveLength(1) // nothing new while off
    player.setEnabled(true)
    await settle()
    expect(player.playing()).toBe('chidori')
  })

  it('prefetch downloads the four files once; a later start decodes without downloading again', async () => {
    const { player, fetched } = playerSetup()
    player.prefetch()
    player.prefetch()
    expect([...fetched].sort()).toEqual(Object.values(TRACKS).map((t) => t.url).sort())
    player.run([{ kind: 'start', jutsu: 'chidori', fadeMs: FADE_IN_MS }])
    await settle()
    expect(fetched.filter((u) => u === TRACKS.chidori.url)).toHaveLength(1)
    expect(player.playing()).toBe('chidori')
  })

  it('stop() also cancels a track still loading', async () => {
    const { ctx, player } = playerSetup()
    player.run([{ kind: 'start', jutsu: 'fire_style', fadeMs: FADE_IN_MS }])
    player.stop(600) // before the file is decoded
    await settle()
    expect(trackSource(ctx, 'fire_style')).toHaveLength(0)
    expect(player.isPlaying()).toBe(false)
  })
})

describe('the engine: three independent volumes', () => {
  it('Sound effects, Character voices and Music each move only their own bus', async () => {
    const ctx = new FakeContext()
    const fetchImpl = (async (url: RequestInfo | URL) =>
      String(url) === '/api/voices'
        ? new Response(JSON.stringify({ voices: {} }), { status: 200 })
        : new Response(new TextEncoder().encode(String(url)), { status: 200 })) as typeof fetch
    const engine = new SoundEngine({ createContext: () => ctx as unknown as AudioContext, fetchImpl })
    await engine.unlock()
    await settle()
    const [output, , voiceOut, musicOut] = ctx.gains
    const counts = () => [output, voiceOut, musicOut].map((g) => g.gain.calls.length)
    let before = counts()
    engine.setMusicVolume(0.2)
    expect(counts()).toEqual([before[0], before[1], before[2] + 1])
    expect(musicOut.gain.calls.at(-1)).toEqual(['target', 0.2, 10, 0.05])
    before = counts()
    engine.setVolume(0.5)
    expect(counts()).toEqual([before[0] + 1, before[1], before[2]])
    before = counts()
    engine.setVoiceVolume(0.7)
    expect(counts()).toEqual([before[0], before[1] + 1, before[2]])
    expect(engine.musicBus()?.input).toBe(musicOut)
  })
})

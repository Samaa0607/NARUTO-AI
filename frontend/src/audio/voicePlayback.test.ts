// The engine's character-voice channel and the ducking, on a fake Web Audio context (node has none).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MusicPlayer } from '../konoha/music/player'
import { SoundEngine } from './engine'
import { DUCK_ATTACK_S, DUCK_RELEASE_S, VOICE_DUCK_MUSIC, VOICE_DUCK_SFX } from './gains'
import { CHARGE_DELAY_MS, CHARGE_FADE_IN_MS, stepSound } from './eventCues'
import { NAME_GAP_MS, voicePlan } from './voiceCues'
import type { VoiceClipId } from './voices'

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
  buffer: { duration: number } | null = null
  loop = false
  playbackRate = new FakeParam(1)
  startedAt: number | null = null
  stoppedAt: number | null = null
  onended: (() => void) | null = null
  start(t = 0) {
    this.startedAt = t
  }
  stop(t = 0) {
    this.stoppedAt = t
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
  filters: (FakeNode & { type: string; frequency: FakeParam; Q: FakeParam })[] = []
  createBiquadFilter() {
    const f = Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam(350), Q: new FakeParam(1) })
    this.filters.push(f)
    return f
  }
  createDynamicsCompressor() {
    const n = new FakeNode() as FakeNode & Record<string, { value: number }>
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = { value: 0 }
    return n
  }
  async decodeAudioData(bytes: ArrayBuffer) {
    return { duration: new Float64Array(bytes)[0] }
  }
  async resume() {
    this.state = 'running'
  }
  async close() {}
}

/** a fake file whose decoded length is `seconds` */
const clipBytes = (seconds: number) => new Float64Array([seconds]).buffer

const VOICES = {
  voices: {
    rasengan: { speaker: 'Naruto', activation: '/audio/voice/rasengan/activation.ogg', name: '/audio/voice/rasengan/name.ogg' },
    chidori: { speaker: 'Sasuke', activation: null, name: '/audio/voice/chidori/name.mp3' },
    fire_style: { speaker: 'Naruto', activation: null, name: null },
    shadow_clone: { speaker: 'Naruto', activation: null, name: null },
  },
}
const LENGTHS: Record<string, number> = {
  '/audio/voice/rasengan/activation.ogg': 1.1,
  '/audio/voice/rasengan/name.ogg': 0.9,
  '/audio/voice/chidori/name.mp3': 0.8,
}

function setup(voices: unknown = VOICES) {
  const ctx = new FakeContext()
  const requested: string[] = []
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input)
    requested.push(url)
    if (url === '/api/voices') return new Response(JSON.stringify(voices), { status: 200 })
    return new Response(clipBytes(LENGTHS[url] ?? 0.5), { status: 200 })
  }) as typeof fetch
  const engine = new SoundEngine({ createContext: () => ctx as unknown as AudioContext, fetchImpl })
  return { ctx, engine, requested }
}

async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

/** the gain nodes created by unlock(): output (user sfx volume), duck, voice out */
function bus(ctx: FakeContext) {
  const [output, duck, voiceOut] = ctx.gains
  return { output, duck, voiceOut }
}

const durations = (engine: SoundEngine) => (id: VoiceClipId) => engine.voiceDuration(id)

// ------------------------------------------------------------------ tests
describe('sound engine: character voices', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('loads only the clips the server lists, after the user unlocked audio', async () => {
    const { engine, requested } = setup()
    expect(requested).toEqual([]) // nothing before a user gesture
    await engine.unlock()
    await settle()
    expect(requested).toContain('/api/voices')
    expect(requested.filter((u) => u.startsWith('/audio/voice/')).sort()).toEqual([
      '/audio/voice/chidori/name.mp3',
      '/audio/voice/rasengan/activation.ogg',
      '/audio/voice/rasengan/name.ogg',
    ])
    expect(engine.voiceDuration('rasengan.activation')).toBeCloseTo(1100)
    expect(engine.voiceDuration('rasengan.name')).toBeCloseTo(900)
    expect(engine.voiceDuration('chidori.activation')).toBeNull()
    expect(engine.voiceDuration('fire_style.name')).toBeNull()
  })

  it('an older server without /api/voices: no voices, nothing else breaks', async () => {
    const ctx = new FakeContext()
    const fetchImpl = (async (input: RequestInfo | URL) =>
      String(input) === '/api/voices' ? new Response('not found', { status: 404 }) : new Response(clipBytes(0.5))) as typeof fetch
    const engine = new SoundEngine({ createContext: () => ctx as unknown as AudioContext, fetchImpl })
    await engine.unlock()
    await settle()
    expect(engine.voiceDuration('rasengan.name')).toBeNull()
    engine.play('ui.step_success')
    expect(ctx.sources.length).toBe(1) // the sound effects still play
  })

  it('plays activation then name on the voice bus and ducks the sound effects until the end', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { ctx, engine } = setup()
    await engine.unlock()
    await vi.waitFor(() => expect(engine.voiceDuration('rasengan.name')).not.toBeNull())
    const { duck, voiceOut } = bus(ctx)
    const speaking: boolean[] = []
    engine.subscribeSpeech(() => speaking.push(engine.isSpeaking()))

    const { plan } = voicePlan('4:rasengan', 'rasengan', durations(engine))
    const before = ctx.sources.length
    engine.playVoice(plan)
    const [activation, name] = ctx.sources.slice(before)
    const t0 = 10 + 0.03
    expect(activation.buffer?.duration).toBeCloseTo(1.1)
    expect(activation.startedAt).toBeCloseTo(t0)
    expect(name.buffer?.duration).toBeCloseTo(0.9)
    expect(name.startedAt).toBeCloseTo(t0 + (1100 + NAME_GAP_MS) / 1000)
    // clip -> clip gain -> voice bus (not the ducked effects bus)
    expect(activation.outputs[0].outputs[0]).toBe(voiceOut)
    const end = t0 + (1100 + NAME_GAP_MS + 900) / 1000
    const targets = duck.gain.calls.filter((c) => c[0] === 'target')
    expect(targets[0]).toEqual(['target', VOICE_DUCK_SFX, 10, DUCK_ATTACK_S])
    expect(targets[1][0]).toBe('target')
    expect(targets[1][1]).toBe(1)
    expect(targets[1][2]).toBeCloseTo(end)
    expect(targets[1][3]).toBe(DUCK_RELEASE_S)
    expect(engine.isSpeaking()).toBe(true)

    vi.advanceTimersByTime((end - 10) * 1000 + 40)
    expect(engine.isSpeaking()).toBe(false)
    expect(speaking).toEqual([true, false])
  })

  it('stopVoice fades the clips out, cancels a clip that had not started and brings the effects back', async () => {
    const { ctx, engine } = setup()
    await engine.unlock()
    await settle()
    const { duck } = bus(ctx)
    engine.playVoice(voicePlan('4:rasengan', 'rasengan', durations(engine)).plan)
    const [activation, name] = ctx.sources.slice(-2)
    ctx.currentTime = 10.5
    duck.gain.calls = []
    engine.stopVoice(250)
    expect(activation.stoppedAt).toBeCloseTo(10.5 + 0.25 + 0.02)
    expect(name.stoppedAt).toBeCloseTo(10.77) // before its start (11.21): it never plays
    expect(duck.gain.calls).toEqual([
      ['hold', 10.5],
      ['target', 1, 10.5, DUCK_RELEASE_S],
    ])
    expect(engine.isSpeaking()).toBe(false)
    engine.stopVoice() // nothing speaking: nothing happens
    expect(duck.gain.calls.length).toBe(2)
  })

  it('a new activation replaces the voice still speaking; stopAll (leaving, disconnect) stops it too', async () => {
    const { ctx, engine } = setup()
    await engine.unlock()
    await settle()
    engine.playVoice(voicePlan('4:rasengan', 'rasengan', durations(engine)).plan)
    const first = ctx.sources.slice(-2)
    engine.playVoice(voicePlan('40:chidori', 'chidori', durations(engine)).plan)
    expect(first.every((s) => s.stoppedAt !== null)).toBe(true)
    const chidori = ctx.sources.at(-1) as FakeSource
    expect(chidori.buffer?.duration).toBeCloseTo(0.8)
    expect(chidori.stoppedAt).toBeNull()
    engine.stopAll(200)
    expect(chidori.stoppedAt).not.toBeNull()
    expect(engine.isSpeaking()).toBe(false)
  })

  it('silent before the user unlocked audio, and when sounds are disabled', async () => {
    const { ctx, engine } = setup()
    engine.playVoice({ key: '1:rasengan', jutsu: 'rasengan', clips: [{ id: 'rasengan.name', atMs: 0, durationMs: 900 }], endMs: 900 })
    expect(ctx.sources.length).toBe(0)
    expect(engine.isSpeaking()).toBe(false)
    await engine.unlock()
    await settle()
    engine.setEnabled(false)
    const count = ctx.sources.length
    engine.playVoice(voicePlan('4:rasengan', 'rasengan', durations(engine)).plan)
    expect(ctx.sources.length).toBe(count)
    expect(engine.isSpeaking()).toBe(false)
  })

  it('the voice volume follows the setting', async () => {
    const { ctx, engine } = setup()
    engine.setVoiceVolume(0.5)
    await engine.unlock()
    expect(bus(ctx).voiceOut.gain.value).toBe(0.5) // set on creation
    engine.setVoiceVolume(0.2)
    expect(bus(ctx).voiceOut.gain.calls.at(-1)).toEqual(['target', 0.2, 10, 0.03])
  })
})

describe('sound engine: the hand-sign sound and the charge', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('plays the hand seal a little higher at step 3, unfiltered; the charge starts later and fades in', async () => {
    const { ctx, engine } = setup()
    await engine.unlock()
    await settle()
    const { output } = bus(ctx)
    const before = ctx.sources.length
    engine.run([stepSound({ jutsu: 'chidori', step: 3 }), { kind: 'play', cue: 'chidori.lightning_charge', delayMs: CHARGE_DELAY_MS, fadeInMs: CHARGE_FADE_IN_MS }])
    const [step, charge] = ctx.sources.slice(before)
    expect(step.playbackRate.value).toBeCloseTo(2 ** (2 / 12))
    const stepGain = step.outputs[0] as FakeGain // no filter on the seal
    expect(stepGain.gain).toBeDefined()
    expect(stepGain.gain.value).toBeCloseTo(1) // cue gain 1 x the seal volume 1
    expect(stepGain.outputs[0]).toBe(output)
    expect(step.startedAt).toBe(10)
    // the charge: no filter, unchanged pitch, 220 ms later, from silence to its level in 400 ms
    expect(charge.playbackRate.value).toBe(1)
    expect(charge.startedAt).toBeCloseTo(10 + CHARGE_DELAY_MS / 1000)
    const chargeGain = charge.outputs[0] as FakeGain
    expect(chargeGain.gain.calls).toEqual([
      ['set', 0, 10],
      ['set', 0, expect.closeTo(10 + CHARGE_DELAY_MS / 1000)],
      ['ramp', expect.closeTo(0.62), expect.closeTo(10 + (CHARGE_DELAY_MS + CHARGE_FADE_IN_MS) / 1000)],
    ])
  })
})

describe('background music: ducked under a character voice', () => {
  const w = globalThis as unknown as Record<string, unknown>
  beforeEach(() => {
    w.window = globalThis
    w.AudioContext = FakeContext
  })
  afterEach(() => {
    delete w.window
    delete w.AudioContext
  })

  it('goes down fast under a voice and comes back slowly; a later context starts at the current level', () => {
    const player = new MusicPlayer('/audio/music/leaf_trail_loop.flac')
    player.setDuck(VOICE_DUCK_MUSIC) // before the music ever played: remembered
    const ctx = (player as unknown as { context(): FakeContext }).context()
    const [, duck] = ctx.gains
    expect(duck.gain.value).toBe(VOICE_DUCK_MUSIC)
    player.setDuck(1)
    expect(duck.gain.calls.at(-1)).toEqual(['target', 1, 10, 0.35])
    player.setDuck(VOICE_DUCK_MUSIC)
    expect(duck.gain.calls.at(-1)).toEqual(['target', VOICE_DUCK_MUSIC, 10, 0.05])
    const n = duck.gain.calls.length
    player.setDuck(VOICE_DUCK_MUSIC) // unchanged: no new automation
    expect(duck.gain.calls.length).toBe(n)
    player.dispose()
  })
})

// Web Audio engine: decodes the 19 cues of cues.ts once, plays one-shots and loops with fades,
// per-cue gain normalisation (gains.ts), the user's volume (master x sfx, muted) and a limiter.
// Also the character voice clips (voices.ts: licensed files listed by /api/voices, none bundled) on
// their own volume; while one speaks, the sound effects and the music are ducked. And the jutsu
// sequence music (jutsuMusicPlayer.ts) on the user's Music volume.
//
//   voice (buffer source -> gain: cue gain x play volume x fade envelope)
//     -> output gain (user volume) -> duck (quieter under a character voice) -> limiter -> speakers
//   character voice clip -> clip gain (fades) -> voice gain (user voice volume) -> limiter
//   jutsu music (jutsuMusicPlayer.ts) -> music gain (user music volume) -> music duck (voice) -> limiter
//
// Browsers keep an AudioContext suspended until the user interacts with the page, so the context is
// created and resumed in unlock(), which must be called from a click/tap/key handler (or after one).
import { CUES, type CueId } from './cues'
import type { CueFilter, SoundCommand } from './eventCues'
import { CUE_GAIN, DUCK_ATTACK_S, DUCK_RELEASE_S, VOICE_DUCK_MUSIC, VOICE_DUCK_SFX } from './gains'
import { JutsuMusicPlayer } from './jutsuMusicPlayer'
import { VOICE_REPLACE_FADE_MS, VOICE_STOP_FADE_MS, type VoicePlan } from './voiceCues'
import { fetchVoiceManifest, type VoiceClipId } from './voices'

export interface OneShotOptions {
  volume?: number
  delayMs?: number
  fadeInMs?: number
  fadeOutAfterMs?: number
  fadeOutMs?: number
  /** playback rate (pitch and speed), 1 = as recorded */
  rate?: number
  filter?: CueFilter
}

export interface LoopOptions {
  volume?: number
  delayMs?: number
  fadeInMs?: number
}

interface Voice {
  cue: CueId
  source: AudioBufferSourceNode
  gain: GainNode
  loop: boolean
  stopping: boolean
}

const MAX_VOICES = 32
/** a character voice starts this long after it is asked for (room to duck the effects first) */
const SPEECH_START_S = 0.03

interface Speech {
  key: string
  clips: { source: AudioBufferSourceNode; gain: GainNode }[]
  timer: ReturnType<typeof setTimeout>
}

type ContextFactory = () => AudioContext

/** freeze an AudioParam at its current value from `time` on (drops the automation after it) */
function holdAt(param: AudioParam, time: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(time)
  else {
    param.cancelScheduledValues(time)
    param.setValueAtTime(param.value, time)
  }
}

function defaultContext(): AudioContext {
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) throw new Error('Web Audio is not supported by this browser')
  return new Ctor({ latencyHint: 'interactive' })
}

export class SoundEngine {
  private ctx: AudioContext | null = null
  private output: GainNode | null = null
  private duck: GainNode | null = null
  private voiceOut: GainNode | null = null
  private voiceVolume = 1
  private musicOut: GainNode | null = null
  private musicDuck: GainNode | null = null
  private musicVolume = 0
  private voiceBuffers = new Map<VoiceClipId, AudioBuffer>()
  private voicesLoading: Promise<void> | null = null
  private speech: Speech | null = null
  private speechListeners = new Set<() => void>()
  private buffers = new Map<CueId, AudioBuffer>()
  private loading: Promise<void> | null = null
  private voices = new Set<Voice>()
  private pendingLoops = new Map<CueId, LoopOptions>() // wanted before their buffer was decoded
  private volume = 1
  private enabled = true
  private listeners = new Set<() => void>()
  private readonly createContext: ContextFactory
  private readonly fetchImpl: typeof fetch
  /** the jutsu sequence music (jutsuMusic.ts), on the music bus */
  readonly music: JutsuMusicPlayer

  constructor(options: { createContext?: ContextFactory; fetchImpl?: typeof fetch } = {}) {
    this.createContext = options.createContext ?? defaultContext
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
    this.music = new JutsuMusicPlayer({ musicBus: () => this.musicBus(), subscribe: this.subscribe }, this.fetchImpl)
  }

  // ------------------------------------------------------------------ state
  /** audio allowed by the browser and enabled by the user */
  isReady = (): boolean => this.enabled && this.ctx?.state === 'running'

  /** useSyncExternalStore-compatible subscription to isReady() changes */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    this.listeners.forEach((l) => l())
  }

  /** Create / resume the AudioContext and start decoding the cues. Safe to call often. */
  async unlock(): Promise<void> {
    if (!this.enabled) return
    if (!this.ctx) {
      let ctx: AudioContext
      try {
        ctx = this.createContext()
      } catch (e) {
        console.warn('[shinobi] no audio:', e)
        return
      }
      const output = ctx.createGain()
      output.gain.value = this.volume
      const duck = ctx.createGain()
      const voiceOut = ctx.createGain()
      voiceOut.gain.value = this.voiceVolume
      const limiter = ctx.createDynamicsCompressor()
      limiter.threshold.value = -6
      limiter.knee.value = 6
      limiter.ratio.value = 12
      limiter.attack.value = 0.003
      limiter.release.value = 0.2
      const musicOut = ctx.createGain()
      musicOut.gain.value = this.musicVolume
      const musicDuck = ctx.createGain()
      output.connect(duck)
      duck.connect(limiter)
      voiceOut.connect(limiter)
      musicOut.connect(musicDuck)
      musicDuck.connect(limiter)
      limiter.connect(ctx.destination)
      ctx.onstatechange = () => this.notify()
      this.ctx = ctx
      this.output = output
      this.duck = duck
      this.voiceOut = voiceOut
      this.musicOut = musicOut
      this.musicDuck = musicDuck
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch {
        // still blocked: the next gesture tries again
      }
    }
    this.load()
    this.loadVoices()
    this.notify()
  }

  /** The character voice clips the backend lists (none are bundled; missing ones are skipped). */
  private loadVoices(): void {
    const ctx = this.ctx
    if (this.voicesLoading || !ctx) return
    this.voicesLoading = fetchVoiceManifest(this.fetchImpl).then(async (manifest) => {
      if (this.ctx !== ctx) return
      await Promise.all(
        [...manifest].map(async ([id, url]) => {
          try {
            const response = await this.fetchImpl(url)
            if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
            const buffer = await ctx.decodeAudioData(await response.arrayBuffer())
            if (this.ctx === ctx) this.voiceBuffers.set(id, buffer)
          } catch (e) {
            console.warn('[shinobi] voice clip not loaded:', id, e)
          }
        }),
      )
    })
  }

  /** Length in ms of a decoded character voice clip; null when it is not installed or not loaded yet. */
  voiceDuration = (id: VoiceClipId): number | null => {
    const buffer = this.voiceBuffers.get(id)
    return buffer ? buffer.duration * 1000 : null
  }

  private load(): void {
    const ctx = this.ctx
    if (this.loading || !ctx) return
    this.loading = Promise.all(
      (Object.keys(CUES) as CueId[]).map(async (cue) => {
        try {
          const response = await this.fetchImpl(CUES[cue].url)
          if (!response.ok) throw new Error(`${CUES[cue].url}: HTTP ${response.status}`)
          const buffer = await ctx.decodeAudioData(await response.arrayBuffer())
          if (this.ctx !== ctx) return // disposed meanwhile
          this.buffers.set(cue, buffer)
          const pending = this.pendingLoops.get(cue)
          if (pending) {
            this.pendingLoops.delete(cue)
            this.startLoop(cue, pending)
          }
        } catch (e) {
          console.warn('[shinobi] sound not loaded:', cue, e)
        }
      }),
    ).then(() => undefined)
  }

  /** user volume 0..1 (master x sfx, 0 when muted) */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume))
    if (this.ctx && this.output) {
      this.output.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03)
    }
  }

  /** user character-voice volume 0..1 (master x voice, 0 when muted) */
  setVoiceVolume(volume: number): void {
    this.voiceVolume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0))
    if (this.ctx && this.voiceOut) {
      this.voiceOut.gain.setTargetAtTime(this.voiceVolume, this.ctx.currentTime, 0.03)
    }
  }

  /** user music volume 0..1 (master x music, 0 when muted): the jutsu sequence music */
  setMusicVolume(volume: number): void {
    this.musicVolume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0))
    if (this.ctx && this.musicOut) {
      this.musicOut.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.05)
    }
  }

  /** the music bus for the jutsu music player, once audio is allowed */
  musicBus(): { ctx: AudioContext; input: AudioNode } | null {
    if (!this.isReady() || !this.ctx || !this.musicOut) return null
    return { ctx: this.ctx, input: this.musicOut }
  }

  /** audioEnabled setting: false stops everything and plays nothing until enabled again */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return
    this.enabled = enabled
    if (!enabled) {
      this.stopAll(0)
      this.music.stop(0)
    }
    this.notify()
  }

  // ------------------------------------------------------------------ playback
  play(cue: CueId, options: OneShotOptions = {}): void {
    if (!this.isReady() || this.voices.size >= MAX_VOICES) return
    const buffer = this.buffers.get(cue)
    if (!buffer) return // not decoded yet: a late sound would not match the picture
    const voice = this.makeVoice(cue, buffer, false, options.volume, options)
    if (!voice || !this.ctx) return
    const t0 = this.ctx.currentTime + Math.max(0, options.delayMs ?? 0) / 1000
    const fadeIn = Math.max(0, options.fadeInMs ?? 0) / 1000
    if (fadeIn > 0) {
      const level = voice.gain.gain.value
      voice.gain.gain.setValueAtTime(0, this.ctx.currentTime)
      voice.gain.gain.setValueAtTime(0, t0)
      voice.gain.gain.linearRampToValueAtTime(level, t0 + fadeIn)
    }
    voice.source.start(t0)
    if (options.fadeOutAfterMs !== undefined) {
      const level = voice.gain.gain.value
      const fadeStart = t0 + options.fadeOutAfterMs / 1000
      const fadeEnd = fadeStart + Math.max(0.01, (options.fadeOutMs ?? 300) / 1000)
      voice.gain.gain.setValueAtTime(level, fadeStart)
      voice.gain.gain.linearRampToValueAtTime(0, fadeEnd)
      voice.source.stop(fadeEnd + 0.02)
    }
  }

  /** Start a loop (one voice per cue: a running loop of that cue is kept). */
  startLoop(cue: CueId, options: LoopOptions = {}): void {
    if (!this.isReady()) return
    for (const v of this.voices) if (v.cue === cue && v.loop && !v.stopping) return
    const buffer = this.buffers.get(cue)
    if (!buffer) {
      this.pendingLoops.set(cue, options)
      return
    }
    const voice = this.makeVoice(cue, buffer, true, options.volume)
    if (!voice || !this.ctx) return
    const t0 = this.ctx.currentTime + Math.max(0, options.delayMs ?? 0) / 1000
    const level = voice.gain.gain.value
    const fadeIn = Math.max(0, options.fadeInMs ?? 0) / 1000
    if (fadeIn > 0) {
      voice.gain.gain.setValueAtTime(0, this.ctx.currentTime)
      voice.gain.gain.setValueAtTime(0, t0)
      voice.gain.gain.linearRampToValueAtTime(level, t0 + fadeIn)
    }
    voice.source.start(t0)
  }

  /** Stop every voice of this cue (loop or one-shot) with a fade. */
  stop(cue: CueId, fadeMs = 300): void {
    this.pendingLoops.delete(cue)
    for (const v of this.voices) if (v.cue === cue) this.fadeOut(v, fadeMs)
  }

  stopAll(fadeMs = 150): void {
    this.pendingLoops.clear()
    for (const v of this.voices) this.fadeOut(v, fadeMs)
    this.stopVoice(fadeMs)
  }

  // ------------------------------------------------------------------ character voices
  /**
   * Play the voice clips of one activation (voiceCues.voiceForFrame) in place of any voice still
   * speaking. The sound effects are ducked until the last clip ends (the music follows isSpeaking()).
   */
  playVoice(plan: VoicePlan): void {
    this.stopVoice(VOICE_REPLACE_FADE_MS)
    const ctx = this.ctx
    const voiceOut = this.voiceOut
    if (!ctx || !voiceOut || !this.isReady()) return
    const t0 = ctx.currentTime + SPEECH_START_S
    const clips: Speech['clips'] = []
    for (const clip of plan.clips) {
      const buffer = this.voiceBuffers.get(clip.id)
      if (!buffer) continue
      const source = ctx.createBufferSource()
      source.buffer = buffer
      const gain = ctx.createGain()
      source.connect(gain)
      gain.connect(voiceOut)
      source.onended = () => {
        source.disconnect()
        gain.disconnect()
      }
      source.start(t0 + clip.atMs / 1000)
      clips.push({ source, gain })
    }
    if (clips.length === 0) return
    const end = t0 + plan.endMs / 1000
    this.setDuck(VOICE_DUCK_SFX, DUCK_ATTACK_S, end)
    this.setMusicDuck(VOICE_DUCK_MUSIC, DUCK_ATTACK_S, end)
    const timer = setTimeout(() => {
      if (this.speech?.key !== plan.key) return
      this.speech = null // the duck already comes back on the audio clock
      this.notifySpeech()
    }, (end - ctx.currentTime) * 1000 + 30)
    this.speech = { key: plan.key, clips, timer }
    this.notifySpeech()
  }

  /** Fade out the character voice (and bring the sound effects back). Nothing when none speaks. */
  stopVoice(fadeMs = VOICE_STOP_FADE_MS): void {
    const speech = this.speech
    if (!speech) return
    this.speech = null
    clearTimeout(speech.timer)
    const ctx = this.ctx
    if (ctx) {
      const now = ctx.currentTime
      const end = now + Math.max(0, fadeMs) / 1000
      for (const { source, gain } of speech.clips) {
        try {
          holdAt(gain.gain, now)
          if (end > now) gain.gain.linearRampToValueAtTime(0, end)
          else gain.gain.setValueAtTime(0, now)
          source.stop(end + 0.02) // a clip that had not started yet never plays
        } catch {
          // already stopped
        }
      }
      this.setDuck(1, DUCK_RELEASE_S)
      this.setMusicDuck(1, DUCK_RELEASE_S)
    }
    this.notifySpeech()
  }

  /** a character voice is speaking (the music ducks meanwhile) */
  isSpeaking = (): boolean => this.speech !== null

  subscribeSpeech = (listener: () => void): (() => void) => {
    this.speechListeners.add(listener)
    return () => this.speechListeners.delete(listener)
  }

  private notifySpeech(): void {
    this.speechListeners.forEach((l) => l())
  }

  /** sound effects bus level: to `level` now, then back to 1 at `releaseAt` (audio clock) if given */
  private setDuck(level: number, timeConstant: number, releaseAt?: number): void {
    const ctx = this.ctx
    const param = this.duck?.gain
    if (!ctx || !param) return
    const now = ctx.currentTime
    holdAt(param, now)
    param.setTargetAtTime(level, now, timeConstant)
    if (releaseAt !== undefined) param.setTargetAtTime(1, releaseAt, DUCK_RELEASE_S)
  }

  /** music bus level under a character voice: to `level` now, back to 1 at `releaseAt` if given */
  private setMusicDuck(level: number, timeConstant: number, releaseAt?: number): void {
    const ctx = this.ctx
    const param = this.musicDuck?.gain
    if (!ctx || !param) return
    const now = ctx.currentTime
    holdAt(param, now)
    param.setTargetAtTime(level, now, timeConstant)
    if (releaseAt !== undefined) param.setTargetAtTime(1, releaseAt, DUCK_RELEASE_S)
  }

  /** Execute the commands of eventCues.soundsForFrame(). */
  run(commands: readonly SoundCommand[]): void {
    for (const c of commands) {
      if (c.kind === 'play') this.play(c.cue, c)
      else if (c.kind === 'loop') this.startLoop(c.cue, c)
      else this.stop(c.cue, c.fadeMs)
    }
  }

  /** Release the AudioContext (the next unlock() creates a new one). */
  dispose(): void {
    this.stopAll(0)
    this.music.dispose()
    const ctx = this.ctx
    this.ctx = null
    this.output = null
    this.duck = null
    this.voiceOut = null
    this.musicOut = null
    this.musicDuck = null
    this.buffers.clear()
    this.voiceBuffers.clear()
    this.loading = null
    this.voicesLoading = null
    this.voices.clear()
    if (ctx) {
      ctx.onstatechange = null
      void ctx.close().catch(() => {})
    }
    this.notify()
  }

  // ------------------------------------------------------------------ internals
  private makeVoice(
    cue: CueId,
    buffer: AudioBuffer,
    loop: boolean,
    volume = 1,
    shape: { rate?: number; filter?: CueFilter } = {},
  ): Voice | null {
    const ctx = this.ctx
    if (!ctx || !this.output) return null
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = loop
    if (shape.rate !== undefined && Number.isFinite(shape.rate) && shape.rate > 0) source.playbackRate.value = shape.rate
    const gain = ctx.createGain()
    gain.gain.value = CUE_GAIN[cue] * Math.min(1, Math.max(0, volume))
    let filter: BiquadFilterNode | null = null
    if (shape.filter) {
      filter = ctx.createBiquadFilter()
      filter.type = shape.filter.type
      filter.frequency.value = shape.filter.frequency
      filter.Q.value = shape.filter.q
      source.connect(filter)
      filter.connect(gain)
    } else {
      source.connect(gain)
    }
    gain.connect(this.output)
    const voice: Voice = { cue, source, gain, loop, stopping: false }
    this.voices.add(voice)
    source.onended = () => {
      this.voices.delete(voice)
      source.disconnect()
      filter?.disconnect()
      gain.disconnect()
    }
    return voice
  }

  private fadeOut(voice: Voice, fadeMs: number): void {
    const ctx = this.ctx
    if (!ctx || voice.stopping) return
    voice.stopping = true
    const now = ctx.currentTime
    const end = now + Math.max(0, fadeMs) / 1000
    const g = voice.gain.gain
    try {
      if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(now)
      else {
        g.cancelScheduledValues(now)
        g.setValueAtTime(g.value, now)
      }
      if (end > now) g.linearRampToValueAtTime(0, end)
      else g.setValueAtTime(0, now)
      voice.source.stop(end + 0.02)
    } catch {
      // source never started or already stopped
      this.voices.delete(voice)
    }
  }
}

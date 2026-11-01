// Background music player on its own small Web Audio graph: the loop is decoded once and played by
// a looping AudioBufferSourceNode (sample-accurate, no gap at the loop point, unlike <audio loop>),
// through a gain for smooth fades. Kept apart from the sound-effects engine (src/audio): the music
// is a soft bed under the app, not a cue.
//
// Browsers block sound until the user interacts with the page, so the first play() must come from
// a click / key press (or after one). MusicContext takes care of that.

/** Original loop composed for SHINOBI AI (assets/audio/music, see assets/audio/SOURCES.md). */
export const MUSIC_SRC = '/audio/music/leaf_trail_loop.flac'

const FADE_IN_S = 2.2
const FADE_OUT_S = 0.8
const FOLLOW_S = 0.25
/** time constants (s) of the duck under a character voice: down fast, back slowly */
const DUCK_DOWN_S = 0.05
const DUCK_UP_S = 0.35

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }

export class MusicPlayer {
  private readonly src: string
  private bytes: Promise<ArrayBuffer | null> | null = null
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private duckGain: GainNode | null = null
  private duckLevel = 1
  private buffer: Promise<AudioBuffer | null> | null = null
  private source: AudioBufferSourceNode | null = null
  private startedAt = 0
  private offset = 0
  private wanted = false
  private playing = false
  private stopTimer: number | undefined
  private readonly listeners = new Set<() => void>()

  constructor(src: string) {
    this.src = src
  }

  /** useSyncExternalStore subscription */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** true while the music plays (and is not fading out) */
  isPlaying = (): boolean => this.playing

  /** download the file now, silently (decoding waits for the first play) */
  preload(): void {
    void this.download()
  }

  /**
   * Start with a fade-in, or follow a new level when already playing (0..1).
   * The first call must come from a user gesture (or after one).
   */
  async play(level: number): Promise<void> {
    window.clearTimeout(this.stopTimer)
    const followed = this.wanted
    this.wanted = true
    const ctx = this.context()
    if (!ctx || !this.gain) return this.fail()
    if (ctx.state !== 'running') {
      try {
        await ctx.resume()
      } catch {
        // not allowed yet
      }
      if ((ctx.state as AudioContextState) !== 'running') return this.fail() // the next gesture tries again
    }
    if (this.source) {
      this.ramp(level, followed ? FOLLOW_S : FADE_IN_S) // playing, or fading out: follow / come back
      this.setPlaying(true)
      return
    }
    const buffer = await this.decoded(ctx)
    if (!buffer) return this.fail()
    if (!this.wanted || this.ctx !== ctx) return // paused or disposed while loading
    if (!this.source) {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.connect(this.gain)
      const offset = this.offset % buffer.duration
      this.ramp(0, 0)
      source.start(ctx.currentTime, offset)
      this.startedAt = ctx.currentTime - offset
      this.source = source
    }
    this.ramp(level, FADE_IN_S)
    this.setPlaying(true)
  }

  /** fade out, then stop (the position is kept: play() continues the loop from there) */
  pause(fadeS = FADE_OUT_S): void {
    window.clearTimeout(this.stopTimer)
    if (!this.wanted && !this.source) return
    this.wanted = false
    this.setPlaying(false)
    this.ramp(0, fadeS)
    this.stopTimer = window.setTimeout(() => {
      if (!this.wanted) this.stopSource()
    }, fadeS * 1000 + 80)
  }

  /**
   * Quieter while a character voice speaks (1 = normal, e.g. 0.3 under a voice), silent while a jutsu's
   * own music plays (0). Independent of the volume and the fades; kept for the next play().
   * `timeConstantS`: how fast it follows (default: down fast, back slowly).
   */
  setDuck(level: number, timeConstantS?: number): void {
    const value = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 1))
    if (value === this.duckLevel) return
    const down = value < this.duckLevel
    this.duckLevel = value
    if (!this.duckGain || !this.ctx) return
    const param = this.duckGain.gain
    const now = this.ctx.currentTime
    param.cancelScheduledValues(now)
    param.setValueAtTime(param.value, now)
    param.setTargetAtTime(value, now, timeConstantS ?? (down ? DUCK_DOWN_S : DUCK_UP_S))
  }

  /** stop everything; the player can still be used again (React StrictMode re-runs effects) */
  dispose(): void {
    window.clearTimeout(this.stopTimer)
    this.wanted = false
    this.setPlaying(false)
    this.stopSource()
    void this.ctx?.close().catch(() => {})
    this.ctx = null
    this.gain = null
    this.duckGain = null
    this.buffer = null
  }

  private fail(): void {
    this.wanted = false
    this.setPlaying(false)
  }

  private stopSource(): void {
    const source = this.source
    if (!source) return
    if (this.ctx && source.buffer) this.offset = (this.ctx.currentTime - this.startedAt) % source.buffer.duration
    try {
      source.stop()
    } catch {
      // already stopped
    }
    source.disconnect()
    this.source = null
  }

  private download(): Promise<ArrayBuffer | null> {
    this.bytes ??= fetch(this.src)
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .catch(() => null)
      .then((bytes) => {
        if (!bytes) this.bytes = null // try again next time
        return bytes
      })
    return this.bytes
  }

  private decoded(ctx: AudioContext): Promise<AudioBuffer | null> {
    this.buffer ??= this.download()
      .then((bytes) => (bytes ? ctx.decodeAudioData(bytes.slice(0)) : null))
      .catch(() => null)
      .then((buffer) => {
        if (!buffer) this.buffer = null
        return buffer
      })
    return this.buffer
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx
    const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
    if (!Ctor) return null
    try {
      const ctx = new Ctor()
      const gain = ctx.createGain()
      gain.gain.value = 0
      const duckGain = ctx.createGain()
      duckGain.gain.value = this.duckLevel
      gain.connect(duckGain)
      duckGain.connect(ctx.destination)
      this.ctx = ctx
      this.gain = gain
      this.duckGain = duckGain
      return ctx
    } catch {
      return null
    }
  }

  private ramp(to: number, seconds: number): void {
    if (!this.gain || !this.ctx) return
    const value = Math.min(1, Math.max(0, Number.isFinite(to) ? to : 0))
    const param = this.gain.gain
    const now = this.ctx.currentTime
    param.cancelScheduledValues(now)
    param.setValueAtTime(param.value, now)
    if (seconds <= 0) param.setValueAtTime(value, now)
    else param.linearRampToValueAtTime(value, now + seconds)
  }

  private setPlaying(value: boolean): void {
    if (this.playing === value) return
    this.playing = value
    for (const listener of this.listeners) listener()
  }
}

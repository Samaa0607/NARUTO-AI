// Plays the jutsu sequence music (jutsuMusic.ts) on the sound engine's Web Audio context, through its
// music bus (the user's Music volume, quieter under a character voice: engine.ts):
//
//   loop source -> track gain (fades, the track's level) -> activation duck -> step dip -> music bus
//
// One track at a time: a new one crossfades from the old once its file is decoded; going back to a
// track that is still fading out brings that same copy back (never two copies of a track). The two
// most recent tracks stay decoded; prefetch() downloads the files ahead (a live session's first frame)
// so a first start only waits for the decoding. Nothing plays before the browser allows audio (the
// user's first click or key press): a track asked for earlier starts as soon as it is allowed.
import type { JutsuId } from '../types/protocol'
import { STOP_FADE_MS, TRACKS, type MusicCommand } from './jutsuMusic'

/** what the player needs from the sound engine */
export interface MusicHost {
  /** the context and the music bus input, once audio is allowed (null before) */
  musicBus(): { ctx: AudioContext; input: AudioNode } | null
  /** called when audio becomes allowed / is disposed */
  subscribe(listener: () => void): () => void
}

interface Playing {
  jutsu: JutsuId
  source: AudioBufferSourceNode
  gain: GainNode
  fading: boolean
}

/** the dip under a hand seal: down to this level, then back */
const DIP_LEVEL = 0.5
const DIP_DOWN_S = 0.015
const DIP_BACK_AFTER_S = 0.12
const DIP_BACK_S = 0.12
/** decoded tracks kept (a track is up to ~18 MB decoded) */
const KEEP_DECODED = 2

export class JutsuMusicPlayer {
  private ctx: AudioContext | null = null
  private duck: GainNode | null = null
  private dip: GainNode | null = null
  private current: Playing | null = null
  private readonly fading = new Set<Playing>()
  private readonly decoded = new Map<string, Promise<AudioBuffer | null>>()
  private readonly bytes = new Map<string, Promise<ArrayBuffer | null>>()
  private wanted: { jutsu: JutsuId; fadeMs: number } | null = null
  private enabled = true
  private token = 0
  private loading = false
  private readonly listeners = new Set<() => void>()
  private readonly host: MusicHost
  private readonly fetchImpl: typeof fetch

  constructor(host: MusicHost, fetchImpl: typeof fetch) {
    this.host = host
    this.fetchImpl = fetchImpl
    host.subscribe(() => this.resumeWanted())
  }

  /** a jutsu track is playing (not fading out) */
  isPlaying = (): boolean => this.current !== null

  /** the jutsu whose track plays, null when none */
  playing = (): JutsuId | null => this.current?.jutsu ?? null

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Settings: jutsu music on / off. Off fades the music out; on again resumes the wanted track. */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return
    this.enabled = enabled
    if (!enabled) this.fadeCurrent(STOP_FADE_MS)
    else this.resumeWanted()
  }

  /** Execute the commands of jutsuMusic.musicForFrame(). */
  run(commands: readonly MusicCommand[]): void {
    for (const c of commands) {
      if (c.kind === 'start') this.start(c.jutsu, c.fadeMs)
      else if (c.kind === 'duck') this.setDuck(c.level, c.rampMs)
      else if (c.kind === 'pulse') this.pulse()
      else this.stop(c.fadeMs)
    }
  }

  /** download the four files now (not decoded yet), once audio is allowed and the music is on */
  prefetch(): void {
    if (!this.enabled || !this.nodes()) return
    for (const { url } of Object.values(TRACKS)) {
      if (this.decoded.has(url) || this.bytes.has(url)) continue
      this.bytes.set(url, this.download(url).catch(() => null))
    }
  }

  /** fade out and forget the wanted track (camera stopped, disconnected, page left) */
  stop(fadeMs = STOP_FADE_MS): void {
    this.wanted = null
    this.token += 1 // a track still loading never starts
    this.fadeCurrent(fadeMs)
  }

  /** the engine released its context */
  dispose(): void {
    this.wanted = null
    this.token += 1
    for (const p of [...this.fading, ...(this.current ? [this.current] : [])]) this.kill(p)
    this.fading.clear()
    this.current = null
    this.ctx = null
    this.duck = null
    this.dip = null
    this.decoded.clear()
    this.bytes.clear()
    this.notify()
  }

  // ------------------------------------------------------------------ internals
  private nodes(): { ctx: AudioContext; duck: GainNode; dip: GainNode } | null {
    const bus = this.host.musicBus()
    if (!bus) return null
    if (this.ctx !== bus.ctx || !this.duck || !this.dip) {
      // a new context (first unlock, or after dispose): fresh nodes, nothing decoded for it yet
      this.ctx = bus.ctx
      this.decoded.clear()
      this.current = null
      this.fading.clear()
      const duck = bus.ctx.createGain()
      const dip = bus.ctx.createGain()
      duck.connect(dip)
      dip.connect(bus.input)
      this.duck = duck
      this.dip = dip
    }
    return { ctx: bus.ctx, duck: this.duck, dip: this.dip }
  }

  private start(jutsu: JutsuId, fadeMs: number): void {
    this.wanted = { jutsu, fadeMs }
    if (!this.enabled) return
    const n = this.nodes()
    if (!n) return // not allowed yet: resumeWanted() starts it
    if (this.current?.jutsu === jutsu) {
      this.setDuck(1, 200)
      return
    }
    // the same track fading out: bring that copy back instead of starting a second one
    const back = [...this.fading].find((p) => p.jutsu === jutsu)
    if (back) {
      this.token += 1
      if (this.current) this.fadeOut(this.current, fadeMs)
      this.fading.delete(back)
      back.fading = false
      this.ramp(back.gain.gain, TRACKS[jutsu].gain, fadeMs)
      try {
        back.source.stop(n.ctx.currentTime + 86400) // replaces the scheduled stop (the last stop() wins)
      } catch {
        // already ended: start a fresh copy below
      }
      this.current = back
      this.setDuck(1, 200)
      this.notify()
      return
    }
    const token = ++this.token
    this.loading = true
    void this.load(TRACKS[jutsu].url, n.ctx).then((buffer) => {
      if (token === this.token) this.loading = false
      if (!buffer || token !== this.token || this.ctx !== n.ctx || !this.enabled) return
      // crossfade: the old track goes as the new one comes, once the new one is ready
      if (this.current) this.fadeOut(this.current, fadeMs)
      this.setDuck(1, 0)
      const source = n.ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true
      const gain = n.ctx.createGain()
      gain.gain.value = 0
      source.connect(gain)
      gain.connect(n.duck)
      const playing: Playing = { jutsu, source, gain, fading: false }
      source.onended = () => {
        this.fading.delete(playing)
        source.disconnect()
        gain.disconnect()
      }
      this.ramp(gain.gain, TRACKS[jutsu].gain, fadeMs)
      source.start(n.ctx.currentTime)
      this.current = playing
      this.notify()
    })
  }

  /** a track was wanted before audio was allowed (or while the music was off): start it now */
  private resumeWanted(): void {
    const wanted = this.wanted
    if (!wanted || this.current || this.loading || !this.enabled || !this.host.musicBus()) return
    this.start(wanted.jutsu, wanted.fadeMs)
  }

  private fadeCurrent(fadeMs: number): void {
    if (this.current) {
      this.fadeOut(this.current, fadeMs)
      this.current = null
      this.notify()
    }
  }

  private fadeOut(p: Playing, fadeMs: number): void {
    if (p.fading || !this.ctx) return
    p.fading = true
    this.fading.add(p)
    const now = this.ctx.currentTime
    const end = now + Math.max(0.01, fadeMs / 1000)
    this.hold(p.gain.gain, now)
    p.gain.gain.linearRampToValueAtTime(0, end)
    try {
      p.source.stop(end + 0.05)
    } catch {
      // never started
    }
  }

  private kill(p: Playing): void {
    try {
      p.source.stop()
    } catch {
      // already stopped
    }
    p.source.disconnect()
    p.gain.disconnect()
  }

  private setDuck(level: number, rampMs: number): void {
    if (!this.duck || !this.ctx) return
    this.ramp(this.duck.gain, level, rampMs)
  }

  private pulse(): void {
    if (!this.dip || !this.ctx || !this.current) return
    const param = this.dip.gain
    const now = this.ctx.currentTime
    this.hold(param, now)
    param.setTargetAtTime(DIP_LEVEL, now, DIP_DOWN_S)
    param.setTargetAtTime(1, now + DIP_BACK_AFTER_S, DIP_BACK_S)
  }

  private ramp(param: AudioParam, to: number, ms: number): void {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    this.hold(param, now)
    if (ms <= 0) param.setValueAtTime(to, now)
    else param.linearRampToValueAtTime(to, now + ms / 1000)
  }

  private hold(param: AudioParam, time: number): void {
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(time)
    else {
      param.cancelScheduledValues(time)
      param.setValueAtTime(param.value, time)
    }
  }

  private load(url: string, ctx: AudioContext): Promise<AudioBuffer | null> {
    const cached = this.decoded.get(url)
    if (cached) {
      this.decoded.delete(url) // most recent last
      this.decoded.set(url, cached)
      return cached
    }
    const ahead = this.bytes.get(url)
    this.bytes.delete(url) // decoded from here on (a track dropped from the cache is downloaded again)
    const promise = (ahead ?? this.download(url))
      .then((bytes) => {
        if (!bytes) throw new Error(`${url}: not downloaded`)
        return ctx.decodeAudioData(bytes)
      })
      .catch((e: unknown) => {
        console.warn('[shinobi] jutsu music not loaded:', url, e)
        this.decoded.delete(url)
        return null
      })
    this.decoded.set(url, promise)
    while (this.decoded.size > KEEP_DECODED) {
      const oldest = this.decoded.keys().next().value as string
      this.decoded.delete(oldest)
    }
    return promise
  }

  private async download(url: string): Promise<ArrayBuffer | null> {
    const response = await this.fetchImpl(url)
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    return response.arrayBuffer()
  }

  private notify(): void {
    this.listeners.forEach((l) => l())
  }
}

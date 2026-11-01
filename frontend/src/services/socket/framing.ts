// Binary framing and message parsing of the WebSocket contract (docs/web_protocol.md, 3.2 - 3.6).
//
//   [ uint32 big-endian N ][ N bytes: UTF-8 JSON header ][ JPEG bytes ]
//
// Pure functions (no WebSocket, no DOM): unit-tested in framing.test.ts.
import type { FrameState, ServerTextMessage, ShinobiEvent } from '../../types/protocol'

export class FramingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FramingError'
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

/** Builds one binary message: length prefix, JSON header, payload (the JPEG). */
export function encodeBinaryMessage(header: unknown, payload: ArrayBuffer | Uint8Array): ArrayBuffer {
  const json = encoder.encode(JSON.stringify(header))
  const body = payload instanceof Uint8Array ? payload : new Uint8Array(payload)
  const out = new Uint8Array(4 + json.byteLength + body.byteLength)
  new DataView(out.buffer).setUint32(0, json.byteLength, false)
  out.set(json, 4)
  out.set(body, 4 + json.byteLength)
  return out.buffer
}

export interface BinaryMessage {
  header: unknown
  /** the image bytes (a view into the received buffer, no copy) */
  payload: Uint8Array
}

/** Splits one binary message into its JSON header and payload. Throws FramingError when malformed. */
export function decodeBinaryMessage(data: ArrayBuffer | Uint8Array): BinaryMessage {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (bytes.byteLength < 4) throw new FramingError(`binary message too short (${bytes.byteLength} bytes)`)
  const n = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false)
  if (4 + n > bytes.byteLength) {
    throw new FramingError(`header length ${n} exceeds the message (${bytes.byteLength} bytes)`)
  }
  let header: unknown
  try {
    header = JSON.parse(decoder.decode(bytes.subarray(4, 4 + n)))
  } catch (e) {
    throw new FramingError(`header is not UTF-8 JSON: ${e instanceof Error ? e.message : String(e)}`)
  }
  return { header, payload: bytes.subarray(4 + n) }
}

// ------------------------------------------------------------------ validation
// The server is ours, but a protocol drift must not crash the page: anything that does not look
// like the contract is rejected (or, for single unknown events, dropped).

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isString = (v: unknown): v is string => typeof v === 'string'

const EVENT_TYPES = new Set([
  'sign',
  'step',
  'sequence_failed',
  'wrong_sign',
  'jutsu',
  'effect_phase',
  'effect_stopping',
  'effect_end',
  'clones',
])
const PHASES = new Set(['charge', 'name', 'release'])

/** JutsuEvent.stages: absent, or three non-negative numbers */
const isStages = (v: unknown): boolean =>
  v === undefined || (isObject(v) && [v.voice, v.charge, v.name].every((s) => isNumber(s) && s >= 0))

function isEvent(v: unknown): v is ShinobiEvent {
  if (!isObject(v) || !isString(v.type) || !EVENT_TYPES.has(v.type)) return false
  switch (v.type) {
    case 'sign':
      return isString(v.sign)
    case 'step':
      return isString(v.jutsu) && isNumber(v.step) && isNumber(v.total) && isString(v.sign)
    case 'sequence_failed':
      return (v.reason === 'wrong_sign' || v.reason === 'timeout') && isString(v.jutsu) && isNumber(v.step)
    case 'wrong_sign':
      return isString(v.jutsu) && isNumber(v.step) && isString(v.expected) && isString(v.got)
    case 'jutsu':
      return isString(v.jutsu) && isString(v.effect) && isStages(v.stages)
    case 'effect_phase':
      return isString(v.effect) && isString(v.jutsu) && isString(v.phase) && PHASES.has(v.phase)
    case 'effect_stopping':
    case 'effect_end':
      return isString(v.effect)
    case 'clones':
      return isNumber(v.count)
    default:
      return false
  }
}

/** Returns the header as a FrameState, or null if it is not one. Unknown event types are dropped. */
export function parseFrameState(header: unknown): FrameState | null {
  if (!isObject(header) || header.type !== 'frame') return null
  if (!isNumber(header.seq) || !isNumber(header.width) || !isNumber(header.height)) return null
  if (!isObject(header.sign) || !isString(header.sign.name)) return null
  if (!isObject(header.mode) || !isString(header.mode.mode)) return null
  const events = Array.isArray(header.events) ? header.events.filter(isEvent) : []
  return {
    ...(header as unknown as FrameState),
    client_t: isNumber(header.client_t) ? header.client_t : null,
    fps: isNumber(header.fps) ? header.fps : 0,
    hands: isNumber(header.hands) ? header.hands : 0,
    hold: isNumber(header.hold) ? header.hold : 0,
    cooldown: isNumber(header.cooldown) ? header.cooldown : 0,
    time_left: isNumber(header.time_left) ? header.time_left : null,
    ready: typeof header.ready === 'boolean' ? header.ready : true,
    time_left_per_jutsu: isObject(header.time_left_per_jutsu)
      ? (Object.fromEntries(
          Object.entries(header.time_left_per_jutsu).filter(([, v]) => isNumber(v)),
        ) as FrameState['time_left_per_jutsu'])
      : undefined,
    history: Array.isArray(header.history) ? (header.history.filter(isString) as FrameState['history']) : [],
    progress: isObject(header.progress) ? (header.progress as FrameState['progress']) : {},
    timings: isObject(header.timings) ? (header.timings as FrameState['timings']) : {},
    effect: isObject(header.effect) ? (header.effect as unknown as FrameState['effect']) : null,
    events,
  }
}

/** Parses a server text message; null when it is not valid JSON or not a message of the contract. */
export function parseServerText(text: string): ServerTextMessage | null {
  let msg: unknown
  try {
    msg = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObject(msg) || !isString(msg.type)) return null
  switch (msg.type) {
    case 'hello':
      return isNumber(msg.protocol) && isObject(msg.info) && isObject(msg.mode) ? (msg as unknown as ServerTextMessage) : null
    case 'mode':
      return msg.mode === 'free' || (msg.mode === 'practice' && isString(msg.jutsu))
        ? (msg as unknown as ServerTextMessage)
        : null
    case 'pong':
      return isNumber(msg.t) ? (msg as unknown as ServerTextMessage) : null
    case 'skipped':
      // client_t is null when the server could not read the frame's header (bad_frame); the type
      // in types/protocol.ts says number, so callers must also expect null here
      return isNumber(msg.client_t) || msg.client_t === null ? (msg as unknown as ServerTextMessage) : null
    case 'error':
      return isString(msg.code)
        ? ({
            type: 'error',
            code: msg.code,
            message: isString(msg.message) ? msg.message : msg.code,
            fatal: msg.fatal === true,
          } as ServerTextMessage)
        : null
    default:
      return null
  }
}

// ------------------------------------------------------------------ frame geometry

/** Size that fits (w, h) into (maxW, maxH) keeping the aspect ratio; never upscales. */
export function fitWithin(w: number, h: number, maxW: number, maxH: number): { width: number; height: number } {
  if (w <= 0 || h <= 0) return { width: 0, height: 0 }
  const scale = Math.min(1, maxW > 0 ? maxW / w : 1, maxH > 0 ? maxH / h : 1)
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

// ------------------------------------------------------------------ in-flight bookkeeping

/**
 * Camera frames sent and not answered yet, keyed by their `t`. The server answers in order, so an
 * answer for `t` also settles every older frame (they were skipped or lost); `skipped` settles one.
 * Entries older than `maxAgeMs` are dropped so a lost answer can never stall the stream.
 */
export class InFlightFrames {
  private readonly sent = new Map<number, number>() // t -> sent at (ms)

  get size(): number {
    return this.sent.size
  }

  add(t: number, now: number): void {
    this.sent.set(t, now)
  }

  /** a processed frame answered `t`: settles it and everything sent before it */
  answer(t: number): boolean {
    if (!this.sent.has(t)) return false
    for (const key of [...this.sent.keys()]) {
      this.sent.delete(key)
      if (key === t) break
    }
    return true
  }

  /** the server skipped `t` */
  skip(t: number): boolean {
    return this.sent.delete(t)
  }

  /** forget the oldest frame (a non-fatal bad_frame error does not name the frame) */
  dropOldest(): void {
    const first = this.sent.keys().next()
    if (!first.done) this.sent.delete(first.value)
  }

  expire(now: number, maxAgeMs: number): number {
    let dropped = 0
    for (const [t, at] of [...this.sent]) {
      if (now - at > maxAgeMs) {
        this.sent.delete(t)
        dropped += 1
      }
    }
    return dropped
  }

  clear(): void {
    this.sent.clear()
  }
}

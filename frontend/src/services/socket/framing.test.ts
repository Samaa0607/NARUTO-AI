import { describe, expect, it } from 'vitest'
import {
  FramingError,
  InFlightFrames,
  decodeBinaryMessage,
  encodeBinaryMessage,
  fitWithin,
  parseFrameState,
  parseServerText,
} from './framing'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])

function frameHeader(extra: Record<string, unknown> = {}) {
  return {
    type: 'frame',
    seq: 7,
    client_t: 1234.5,
    width: 1280,
    height: 720,
    fps: 10.4,
    timings: { hands: 50 },
    hands: 2,
    sign: { name: 'tiger', source: 'yolox', score: 0.93 },
    candidate: 'tiger',
    hold: 0.6,
    latched: null,
    history: ['monkey', 'boar', 'horse'],
    progress: { fire_style: 3, chidori: 0, shadow_clone: 0, rasengan: 0 },
    time_left: 2.7,
    cooldown: 0,
    mode: { mode: 'free', jutsu: null },
    effect: null,
    events: [],
    ...extra,
  }
}

describe('binary framing', () => {
  it('writes [uint32 BE length][JSON][payload]', () => {
    const buf = encodeBinaryMessage({ t: 12.5 }, JPEG)
    const bytes = new Uint8Array(buf)
    const json = '{"t":12.5}'
    expect(new DataView(buf).getUint32(0, false)).toBe(json.length)
    expect(bytes.slice(0, 4)).toEqual(new Uint8Array([0, 0, 0, json.length]))
    expect(new TextDecoder().decode(bytes.slice(4, 4 + json.length))).toBe(json)
    expect(bytes.slice(4 + json.length)).toEqual(JPEG)
    expect(bytes.byteLength).toBe(4 + json.length + JPEG.byteLength)
  })

  it('round-trips header and payload, including non-ASCII JSON', () => {
    const header = { type: 'frame', note: '火遁・豪火球の術', n: 3 }
    const decoded = decodeBinaryMessage(encodeBinaryMessage(header, JPEG.buffer.slice(0)))
    expect(decoded.header).toEqual(header)
    expect(decoded.payload).toEqual(JPEG)
  })

  it('uses the byte length (not the string length) of UTF-8 headers', () => {
    const buf = encodeBinaryMessage({ k: '寅' }, new Uint8Array())
    const n = new DataView(buf).getUint32(0, false)
    expect(n).toBe(new TextEncoder().encode('{"k":"寅"}').byteLength)
    expect(n).toBeGreaterThan('{"k":"寅"}'.length)
  })

  it('handles large headers (length prefix above 255 and 65535)', () => {
    const header = { pad: 'x'.repeat(70000) }
    const decoded = decodeBinaryMessage(encodeBinaryMessage(header, JPEG))
    expect(decoded.header).toEqual(header)
    expect(decoded.payload).toEqual(JPEG)
  })

  it('accepts an empty payload', () => {
    const decoded = decodeBinaryMessage(encodeBinaryMessage({ a: 1 }, new Uint8Array()))
    expect(decoded.payload.byteLength).toBe(0)
  })

  it('decodes from a Uint8Array view with an offset', () => {
    const inner = new Uint8Array(encodeBinaryMessage({ a: 1 }, JPEG))
    const big = new Uint8Array(inner.byteLength + 10)
    big.set(inner, 5)
    const decoded = decodeBinaryMessage(big.subarray(5, 5 + inner.byteLength))
    expect(decoded.header).toEqual({ a: 1 })
    expect(decoded.payload).toEqual(JPEG)
  })

  it('rejects messages shorter than the prefix', () => {
    expect(() => decodeBinaryMessage(new Uint8Array([0, 0, 1]))).toThrow(FramingError)
  })

  it('rejects a length that runs past the end', () => {
    const buf = new Uint8Array(10)
    new DataView(buf.buffer).setUint32(0, 100, false)
    expect(() => decodeBinaryMessage(buf)).toThrow(FramingError)
  })

  it('rejects a header that is not JSON', () => {
    const body = new TextEncoder().encode('{nope')
    const buf = new Uint8Array(4 + body.byteLength)
    new DataView(buf.buffer).setUint32(0, body.byteLength, false)
    buf.set(body, 4)
    expect(() => decodeBinaryMessage(buf)).toThrow(FramingError)
  })

  it('rejects invalid UTF-8 in the header', () => {
    const buf = new Uint8Array([0, 0, 0, 2, 0xc3, 0x28])
    expect(() => decodeBinaryMessage(buf)).toThrow(FramingError)
  })
})

describe('parseFrameState', () => {
  it('accepts the contract example', () => {
    const state = parseFrameState(frameHeader())
    expect(state).not.toBeNull()
    expect(state?.sign.name).toBe('tiger')
    expect(state?.progress.fire_style).toBe(3)
    expect(state?.client_t).toBe(1234.5)
  })

  it('keeps the per-jutsu time left (numbers only) and leaves it undefined on older servers', () => {
    const state = parseFrameState(frameHeader({ time_left_per_jutsu: { fire_style: 4.2, chidori: 'x' } }))
    expect(state?.time_left_per_jutsu).toEqual({ fire_style: 4.2 })
    expect(parseFrameState(frameHeader({}))?.time_left_per_jutsu).toBeUndefined()
  })

  it('keeps known events in order and drops unknown or malformed ones', () => {
    const state = parseFrameState(
      frameHeader({
        events: [
          { type: 'sign', sign: 'tiger' },
          { type: 'future_event', x: 1 },
          { type: 'step', jutsu: 'fire_style', step: 2, total: 4, sign: 'boar' },
          { type: 'step', jutsu: 'fire_style' }, // missing fields
          { type: 'sequence_failed', reason: 'timeout', jutsu: 'chidori', step: 1, expected: 'dog', got: null },
          { type: 'wrong_sign', jutsu: 'fire_style', step: 2, expected: 'horse', got: 'dog' },
          { type: 'wrong_sign', jutsu: 'fire_style', step: 2, expected: 'horse' }, // missing got
          { type: 'jutsu', jutsu: 'fire_style', effect: 'fire' },
          { type: 'jutsu', jutsu: 'fire_style', effect: 'fire', stages: { voice: 1.1, charge: 1.2, name: 0.9 } },
          { type: 'jutsu', jutsu: 'fire_style', effect: 'fire', stages: { voice: 'long' } }, // malformed stages
          { type: 'effect_phase', effect: 'fire', jutsu: 'fire_style', phase: 'charge' },
          { type: 'effect_phase', effect: 'fire', jutsu: 'fire_style', phase: 'boom' }, // unknown phase
          { type: 'effect_stopping', effect: 'fire' },
          { type: 'effect_end', effect: 'fire' },
          { type: 'clones', count: 3 },
          'garbage',
        ],
      }),
    )
    expect(state?.events.map((e) => e.type)).toEqual([
      'sign',
      'step',
      'sequence_failed',
      'wrong_sign',
      'jutsu',
      'jutsu',
      'effect_phase',
      'effect_stopping',
      'effect_end',
      'clones',
    ])
  })

  it('fills defaults for optional / null fields', () => {
    const state = parseFrameState(
      frameHeader({ client_t: undefined, time_left: null, history: undefined, events: undefined, timings: undefined }),
    )
    expect(state?.client_t).toBeNull()
    expect(state?.time_left).toBeNull()
    expect(state?.history).toEqual([])
    expect(state?.events).toEqual([])
    expect(state?.timings).toEqual({})
  })

  it('rejects headers that are not frames', () => {
    expect(parseFrameState(null)).toBeNull()
    expect(parseFrameState({ type: 'hello' })).toBeNull()
    expect(parseFrameState(frameHeader({ seq: 'x' }))).toBeNull()
    expect(parseFrameState(frameHeader({ sign: null }))).toBeNull()
  })
})

describe('parseServerText', () => {
  it('parses every server text message of the contract', () => {
    const info = { frame: { max_width: 1280, max_height: 1280, jpeg_quality: 0.8, max_in_flight: 2 } }
    expect(
      parseServerText(JSON.stringify({ type: 'hello', protocol: 1, session: 'a1', info, mode: { mode: 'free', jutsu: null } }))
        ?.type,
    ).toBe('hello')
    expect(parseServerText('{"type":"mode","mode":"practice","jutsu":"chidori"}')).toEqual({
      type: 'mode',
      mode: 'practice',
      jutsu: 'chidori',
    })
    expect(parseServerText('{"type":"mode","mode":"free","jutsu":null}')?.type).toBe('mode')
    expect(parseServerText('{"type":"pong","t":5}')).toEqual({ type: 'pong', t: 5 })
    expect(parseServerText('{"type":"skipped","client_t":42.5}')).toEqual({ type: 'skipped', client_t: 42.5 })
    expect(parseServerText('{"type":"error","code":"busy","message":"full","fatal":true}')).toEqual({
      type: 'error',
      code: 'busy',
      message: 'full',
      fatal: true,
    })
  })

  it('accepts skipped with client_t null (unreadable header of a bad frame)', () => {
    expect(parseServerText('{"type":"skipped","client_t":null}')).toEqual({ type: 'skipped', client_t: null })
  })

  it('treats a missing fatal flag as non-fatal', () => {
    expect(parseServerText('{"type":"error","code":"bad_frame","message":"x"}')).toMatchObject({ fatal: false })
  })

  it('rejects junk', () => {
    expect(parseServerText('not json')).toBeNull()
    expect(parseServerText('[]')).toBeNull()
    expect(parseServerText('{"type":"nope"}')).toBeNull()
    expect(parseServerText('{"type":"skipped"}')).toBeNull()
    expect(parseServerText('{"type":"skipped","client_t":"x"}')).toBeNull()
    expect(parseServerText('{"type":"mode","mode":"practice"}')).toBeNull()
  })
})

describe('fitWithin', () => {
  it('scales down keeping the aspect ratio', () => {
    expect(fitWithin(1920, 1080, 1280, 1280)).toEqual({ width: 1280, height: 720 })
    expect(fitWithin(1080, 1920, 1280, 1280)).toEqual({ width: 720, height: 1280 })
    expect(fitWithin(2000, 2000, 1280, 720)).toEqual({ width: 720, height: 720 })
  })

  it('never upscales', () => {
    expect(fitWithin(640, 480, 1280, 1280)).toEqual({ width: 640, height: 480 })
  })

  it('handles zero sizes', () => {
    expect(fitWithin(0, 0, 1280, 1280)).toEqual({ width: 0, height: 0 })
  })
})

describe('InFlightFrames', () => {
  it('an answer settles that frame and every older one (the server answers in order)', () => {
    const f = new InFlightFrames()
    f.add(1, 0)
    f.add(2, 0)
    f.add(3, 0)
    expect(f.answer(2)).toBe(true)
    expect(f.size).toBe(1)
    expect(f.answer(2)).toBe(false)
    expect(f.answer(3)).toBe(true)
    expect(f.size).toBe(0)
  })

  it('skipped settles exactly one frame', () => {
    const f = new InFlightFrames()
    f.add(1, 0)
    f.add(2, 0)
    expect(f.skip(1)).toBe(true)
    expect(f.skip(1)).toBe(false)
    expect(f.size).toBe(1)
  })

  it('expires frames that never got an answer', () => {
    const f = new InFlightFrames()
    f.add(1, 0)
    f.add(2, 4000)
    expect(f.expire(5000, 3000)).toBe(1)
    expect(f.size).toBe(1)
  })

  it('dropOldest removes the first frame sent', () => {
    const f = new InFlightFrames()
    f.add(10, 0)
    f.add(20, 0)
    f.dropOldest()
    expect(f.answer(10)).toBe(false)
    expect(f.answer(20)).toBe(true)
  })
})

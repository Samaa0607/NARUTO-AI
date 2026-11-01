import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FrameState, HelloMessage } from '../../types/protocol'
import { ShinobiSocket, backoffDelay, type SocketStatus } from './client'
import { decodeBinaryMessage, encodeBinaryMessage } from './framing'

/** Minimal stand-in for the browser WebSocket: the test drives the server side. */
class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: FakeWebSocket[] = []

  readonly url: string
  readyState = FakeWebSocket.CONNECTING
  binaryType = 'blob'
  bufferedAmount = 0
  sent: (string | ArrayBuffer)[] = []
  closedWith: { code?: number; reason?: string } | null = null
  onopen: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose: ((ev: { code: number; reason: string }) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  send(data: string | ArrayBuffer) {
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error('not open')
    this.sent.push(data)
  }

  close(code?: number, reason?: string) {
    this.closedWith = { code, reason }
    this.readyState = FakeWebSocket.CLOSED
  }

  // ---- server side
  serverOpen() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.({})
  }

  serverText(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) })
  }

  serverBinary(header: unknown, payload = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])) {
    this.onmessage?.({ data: encodeBinaryMessage(header, payload) })
  }

  serverClose(code = 1006, reason = '') {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code, reason })
  }

  get textSent(): Record<string, unknown>[] {
    return this.sent.filter((d): d is string => typeof d === 'string').map((d) => JSON.parse(d))
  }
}

const INFO = {
  name: 'SHINOBI AI',
  version: '0.1.0',
  protocol: 1,
  yolox: true,
  landmark_model: false,
  recognizable: ['tiger'],
  jutsu_available: { fire_style: true, chidori: true, shadow_clone: false, rasengan: false },
  sessions: { active: 1, max: 2 },
  frame: { max_width: 1280, max_height: 1280, jpeg_quality: 0.8, max_in_flight: 2 },
  mirror: true,
}

const hello = (protocol = 1): HelloMessage =>
  ({ type: 'hello', protocol, session: 'abc', info: INFO, mode: { mode: 'free', jutsu: null } }) as HelloMessage

function frame(seq: number, clientT: number): Partial<FrameState> {
  return {
    type: 'frame',
    seq,
    client_t: clientT,
    width: 640,
    height: 360,
    fps: 9,
    timings: {},
    hands: 1,
    sign: { name: 'idle', source: 'none', score: 0 },
    candidate: null,
    hold: 0,
    latched: null,
    history: [],
    progress: {},
    time_left: null,
    cooldown: 0,
    mode: { mode: 'free', jutsu: null },
    effect: null,
    events: [],
  }
}

let now = 0
let statuses: SocketStatus[]

function makeSocket(extra: Partial<ConstructorParameters<typeof ShinobiSocket>[0]> = {}) {
  statuses = []
  return new ShinobiSocket({
    url: 'ws://test/ws',
    WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    now: () => now,
    random: () => 0.5, // no jitter
    backoff: { baseMs: 500, maxMs: 4000, factor: 2, jitter: 0.2 },
    pingIntervalMs: 0,
    ...extra,
    handlers: { onStatus: (s) => statuses.push(s), ...extra.handlers },
  })
}

const last = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
const states = () => statuses.map((s) => s.state)

beforeEach(() => {
  vi.useFakeTimers()
  FakeWebSocket.instances = []
  now = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe('backoffDelay', () => {
  const opts = { baseMs: 500, maxMs: 4000, factor: 2, jitter: 0.2 }
  it('grows exponentially up to the maximum', () => {
    const mid = () => 0.5
    expect([1, 2, 3, 4, 5, 6].map((n) => backoffDelay(n, opts, mid))).toEqual([500, 1000, 2000, 4000, 4000, 4000])
  })
  it('applies the jitter range', () => {
    expect(backoffDelay(1, opts, () => 0)).toBe(400)
    expect(backoffDelay(1, opts, () => 1)).toBe(600)
  })
})

describe('ShinobiSocket', () => {
  it('connects, waits for hello, then reports connected', () => {
    const onHello = vi.fn()
    const s = makeSocket({ handlers: { onHello } })
    s.connect()
    expect(last().url).toBe('ws://test/ws')
    expect(last().binaryType).toBe('arraybuffer')
    expect(s.state).toBe('connecting')
    last().serverOpen()
    expect(s.state).toBe('connecting') // open is not enough: the hello makes the session
    last().serverText(hello())
    expect(s.state).toBe('connected')
    expect(onHello).toHaveBeenCalledOnce()
    expect(s.session?.session).toBe('abc')
    expect(states()).toEqual(['connecting', 'connected'])
  })

  it('sends text messages and framed camera images only while connected', () => {
    const s = makeSocket()
    expect(s.send({ type: 'reset' })).toBe(false)
    s.connect()
    last().serverOpen()
    expect(s.send({ type: 'reset' })).toBe(false) // no hello yet
    last().serverText(hello())
    expect(s.send({ type: 'mode', mode: 'practice', jutsu: 'chidori' })).toBe(true)
    expect(s.sendFrame({ t: 12 }, new Uint8Array([1, 2, 3]))).toBe(true)
    expect(last().textSent).toEqual([{ type: 'mode', mode: 'practice', jutsu: 'chidori' }])
    const bin = last().sent.find((d) => d instanceof ArrayBuffer) as ArrayBuffer
    const decoded = decodeBinaryMessage(bin)
    expect(decoded.header).toEqual({ t: 12 })
    expect([...decoded.payload]).toEqual([1, 2, 3])
  })

  it('delivers processed frames and text messages to the handlers', () => {
    const onFrame = vi.fn()
    const onSkipped = vi.fn()
    const onMode = vi.fn()
    const onServerError = vi.fn()
    const s = makeSocket({ handlers: { onFrame, onSkipped, onMode, onServerError } })
    s.connect()
    last().serverOpen()
    last().serverText(hello())
    last().serverBinary(frame(1, 33))
    last().serverText({ type: 'skipped', client_t: 66 })
    last().serverText({ type: 'mode', mode: 'practice', jutsu: 'fire_style' })
    last().serverText({ type: 'error', code: 'bad_frame', message: 'not a jpeg', fatal: false })
    last().serverBinary({ type: 'something-else' }) // dropped
    expect(onFrame).toHaveBeenCalledOnce()
    expect(onFrame.mock.calls[0][0].client_t).toBe(33)
    expect([...onFrame.mock.calls[0][1]]).toEqual([0xff, 0xd8, 0xff, 0xd9])
    expect(onSkipped).toHaveBeenCalledWith(66)
    expect(onMode).toHaveBeenCalledWith({ mode: 'practice', jutsu: 'fire_style' })
    expect(onServerError).toHaveBeenCalledWith(expect.objectContaining({ code: 'bad_frame' }))
    expect(s.state).toBe('connected')
  })

  it('reports offline when the server cannot be reached, and keeps retrying with backoff', () => {
    const s = makeSocket()
    s.connect()
    last().serverClose(1006)
    expect(s.state).toBe('offline')
    expect(s.currentStatus.retryAt).toBe(500)
    expect(FakeWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(499)
    expect(FakeWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(2)
    last().serverClose(1006)
    expect(s.currentStatus.failures).toBe(2)
    vi.advanceTimersByTime(999)
    expect(FakeWebSocket.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(3)
    last().serverOpen()
    last().serverText(hello())
    expect(s.state).toBe('connected')
    expect(s.currentStatus.failures).toBe(0)
  })

  it('goes reconnecting after a drop, then offline after repeated failures, then recovers', () => {
    const s = makeSocket({ offlineAfter: 3 })
    s.connect()
    last().serverOpen()
    last().serverText(hello())
    last().serverClose(1006) // server stopped
    expect(s.state).toBe('reconnecting')
    vi.advanceTimersByTime(500)
    last().serverClose(1006)
    expect(s.state).toBe('reconnecting') // 2 failures
    vi.advanceTimersByTime(1000)
    last().serverClose(1006)
    expect(s.state).toBe('offline') // 3 failures
    vi.advanceTimersByTime(2000)
    last().serverOpen()
    last().serverText(hello())
    expect(s.state).toBe('connected')
    const distinct = states().filter((st, i, all) => i === 0 || st !== all[i - 1])
    expect(distinct).toEqual(['connecting', 'connected', 'reconnecting', 'offline', 'connected'])
  })

  it('handles busy: error + close 1013, retries after the busy delay', () => {
    const s = makeSocket({ busyRetryMs: 3000 })
    s.connect()
    last().serverOpen()
    last().serverText({ type: 'error', code: 'busy', message: 'Two sessions are already running.', fatal: true })
    last().serverClose(1013)
    expect(s.state).toBe('busy')
    expect(s.currentStatus.message).toBe('Two sessions are already running.')
    vi.advanceTimersByTime(2999)
    expect(FakeWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(2)
  })

  it('treats a bare 1013 close as busy', () => {
    const s = makeSocket()
    s.connect()
    last().serverClose(1013, 'full')
    expect(s.state).toBe('busy')
  })

  it('stops on a protocol mismatch (no retry)', () => {
    const s = makeSocket()
    s.connect()
    last().serverOpen()
    last().serverText(hello(2))
    expect(s.state).toBe('error')
    expect(s.currentStatus.message).toMatch(/protocol 2/)
    expect(s.currentStatus.retryAt).toBeNull()
    vi.advanceTimersByTime(60000)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('shows a fatal internal error and starts a fresh session after it', () => {
    const s = makeSocket()
    s.connect()
    last().serverOpen()
    last().serverText(hello())
    last().serverText({ type: 'error', code: 'internal', message: 'engine crashed', fatal: true })
    last().serverClose(1011)
    expect(s.state).toBe('error')
    expect(s.currentStatus.message).toBe('engine crashed')
    vi.advanceTimersByTime(500)
    expect(FakeWebSocket.instances).toHaveLength(2)
  })

  it('gives up on an attempt without hello after the timeout', () => {
    const s = makeSocket({ helloTimeoutMs: 1000 })
    s.connect()
    last().serverOpen()
    vi.advanceTimersByTime(1000)
    expect(last().closedWith).not.toBeNull()
    expect(s.state).toBe('offline')
    vi.advanceTimersByTime(500)
    expect(FakeWebSocket.instances).toHaveLength(2)
  })

  it('disconnect() closes cleanly, cancels retries and ignores late events', () => {
    const onFrame = vi.fn()
    const s = makeSocket({ handlers: { onFrame } })
    s.connect()
    const ws = last()
    ws.serverOpen()
    ws.serverText(hello())
    s.disconnect()
    expect(ws.closedWith?.code).toBe(1000)
    expect(s.state).toBe('idle')
    ws.serverBinary(frame(1, 1)) // late message of the old socket
    ws.serverClose(1000)
    vi.advanceTimersByTime(60000)
    expect(onFrame).not.toHaveBeenCalled()
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(s.state).toBe('idle')
  })

  it('retryNow() skips the backoff wait', () => {
    const s = makeSocket({ backoff: { baseMs: 5000, maxMs: 5000, factor: 2, jitter: 0 } })
    s.connect()
    last().serverClose(1006)
    expect(FakeWebSocket.instances).toHaveLength(1)
    s.retryNow()
    expect(FakeWebSocket.instances).toHaveLength(2)
    s.retryNow() // an attempt is already running: no second socket
    expect(FakeWebSocket.instances).toHaveLength(2)
  })

  it('pings while connected and reconnects when the server stops answering', () => {
    const onPong = vi.fn()
    const s = makeSocket({ pingIntervalMs: 1000, staleMs: 3000, handlers: { onPong } })
    s.connect()
    last().serverOpen()
    last().serverText(hello())
    now = 1000
    vi.advanceTimersByTime(1000)
    expect(last().textSent).toEqual([{ type: 'ping', t: 1000 }])
    now = 1020
    last().serverText({ type: 'pong', t: 1000 })
    expect(onPong).toHaveBeenCalledWith(1000, 20)
    // now the server goes silent: pings keep going out, nothing comes back
    for (let i = 2; i <= 6; i++) {
      now = i * 1000
      vi.advanceTimersByTime(1000)
    }
    expect(s.state).toBe('reconnecting')
    expect(FakeWebSocket.instances[0].closedWith?.code).toBe(4000)
  })
})

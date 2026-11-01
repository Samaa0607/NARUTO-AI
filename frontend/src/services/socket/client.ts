// Typed WebSocket client of the SHINOBI AI backend (docs/web_protocol.md, section 3).
//
// One ShinobiSocket = one backend session (its own engine). It connects, waits for `hello`,
// reconnects with exponential backoff when the connection drops, reports busy / offline / error,
// sends heartbeats (ping) and detects a stalled server. It knows nothing about cameras or React:
// the session hook (hooks/useShinobiSession.ts) drives it.
import {
  PROTOCOL_VERSION,
  type ClientFrameHeader,
  type ClientMessage,
  type ErrorMessage,
  type FrameState,
  type HelloMessage,
  type Mode,
} from '../../types/protocol'
import { FramingError, decodeBinaryMessage, encodeBinaryMessage, parseFrameState, parseServerText } from './framing'

export type ConnectionState =
  | 'idle' // not started (or stopped by the app)
  | 'connecting' // first attempt, waiting for the server's hello
  | 'connected' // hello received: frames can flow
  | 'reconnecting' // the connection dropped, trying again
  | 'offline' // the server cannot be reached (keeps retrying in the background)
  | 'busy' // the server has no free session slot (keeps retrying)
  | 'error' // protocol mismatch or a fatal server error

export interface SocketStatus {
  state: ConnectionState
  /** user-facing detail (server message, reason), null when there is nothing to add */
  message: string | null
  /** consecutive failed attempts since the last successful connection */
  failures: number
  /** when the next automatic attempt happens (performance.now() ms), null if none is scheduled */
  retryAt: number | null
}

export interface ShinobiSocketHandlers {
  onStatus?: (status: SocketStatus) => void
  onHello?: (hello: HelloMessage) => void
  onFrame?: (state: FrameState, jpeg: Uint8Array) => void
  /** null: the server could not read that frame's header (see framing.parseServerText) */
  onSkipped?: (clientT: number | null) => void
  onMode?: (mode: Mode) => void
  onPong?: (t: number, rttMs: number) => void
  /** non-fatal server errors (bad_frame, bad_message) */
  onServerError?: (error: ErrorMessage) => void
}

export interface BackoffOptions {
  baseMs: number
  maxMs: number
  factor: number
  /** 0..1: the delay is multiplied by a random factor in [1 - jitter, 1 + jitter] */
  jitter: number
}

export interface ShinobiSocketOptions {
  url: string | (() => string)
  handlers?: ShinobiSocketHandlers
  backoff?: Partial<BackoffOptions>
  /** consecutive failures after a lost connection before the state becomes 'offline' */
  offlineAfter?: number
  /** minimum delay before retrying after a `busy` answer */
  busyRetryMs?: number
  /** give up on an attempt that got no hello after this long */
  helloTimeoutMs?: number
  /** heartbeat ping interval while connected (0 = off) */
  pingIntervalMs?: number
  /** reconnect when something was sent and nothing came back for this long */
  staleMs?: number
  /** injection points for tests */
  WebSocketImpl?: typeof WebSocket
  now?: () => number
  random?: () => number
}

const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 600, maxMs: 8000, factor: 2, jitter: 0.2 }

export const CLOSE_NORMAL = 1000
export const CLOSE_TRY_AGAIN_LATER = 1013
const CLOSE_STALE = 4000 // our own code: no answer for too long
const CLOSE_PROTOCOL = 4001 // our own code: the server speaks another protocol version

/** Exponential backoff with jitter; failures counts from 1. */
export function backoffDelay(failures: number, opts: BackoffOptions, random: () => number = Math.random): number {
  const raw = Math.min(opts.maxMs, opts.baseMs * opts.factor ** Math.max(0, failures - 1))
  const jitter = 1 + opts.jitter * (2 * random() - 1)
  return Math.round(Math.min(opts.maxMs * (1 + opts.jitter), raw * jitter))
}

type CloseReason = { state: ConnectionState; message: string | null; retry: boolean } | null

export class ShinobiSocket {
  private readonly opts: Required<Omit<ShinobiSocketOptions, 'handlers' | 'backoff'>> & { backoff: BackoffOptions }
  private handlers: ShinobiSocketHandlers
  private ws: WebSocket | null = null
  private generation = 0 // increments per WebSocket, so late callbacks of old sockets are ignored
  private running = false
  private everConnected = false
  private helloReceived = false // for the current WebSocket
  private closeReason: CloseReason = null
  private status: SocketStatus = { state: 'idle', message: null, failures: 0, retryAt: null }
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private helloTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private awaitingSince: number | null = null // first send not followed by any server message
  private hello: HelloMessage | null = null

  constructor(options: ShinobiSocketOptions) {
    this.handlers = options.handlers ?? {}
    this.opts = {
      url: options.url,
      backoff: { ...DEFAULT_BACKOFF, ...options.backoff },
      offlineAfter: options.offlineAfter ?? 3,
      busyRetryMs: options.busyRetryMs ?? 4000,
      helloTimeoutMs: options.helloTimeoutMs ?? 8000,
      pingIntervalMs: options.pingIntervalMs ?? 4000,
      staleMs: options.staleMs ?? 12000,
      WebSocketImpl: options.WebSocketImpl ?? WebSocket,
      now: options.now ?? (() => performance.now()),
      random: options.random ?? Math.random,
    }
  }

  // ------------------------------------------------------------------ public API
  get state(): ConnectionState {
    return this.status.state
  }

  get currentStatus(): SocketStatus {
    return this.status
  }

  /** the hello of the current connection (null when not connected) */
  get session(): HelloMessage | null {
    return this.hello
  }

  get isConnected(): boolean {
    return this.status.state === 'connected' && this.ws?.readyState === this.opts.WebSocketImpl.OPEN
  }

  /** bytes queued in the browser and not sent yet */
  get bufferedAmount(): number {
    return this.ws?.bufferedAmount ?? 0
  }

  setHandlers(handlers: ShinobiSocketHandlers): void {
    this.handlers = handlers
  }

  /** start connecting (no-op if already running) */
  connect(): void {
    if (this.running) return
    this.running = true
    this.everConnected = false
    this.setStatus({ state: 'connecting', message: null, failures: 0, retryAt: null })
    this.open()
  }

  /** stop for good: closes the socket, cancels retries, state 'idle' */
  disconnect(): void {
    this.running = false
    this.clearTimers()
    const ws = this.ws
    this.ws = null
    this.generation += 1
    this.hello = null
    if (ws && ws.readyState !== this.opts.WebSocketImpl.CLOSED && ws.readyState !== this.opts.WebSocketImpl.CLOSING) {
      try {
        ws.close(CLOSE_NORMAL, 'client stopped')
      } catch {
        // already closing
      }
    }
    this.setStatus({ state: 'idle', message: null, failures: 0, retryAt: null })
  }

  /** skip the backoff wait and try again now (Retry button, browser came back online) */
  retryNow(): void {
    if (!this.running) {
      this.connect()
      return
    }
    if (this.ws || this.status.state === 'connected') return
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.open()
  }

  send(message: ClientMessage): boolean {
    if (!this.isConnected || !this.ws) return false
    this.ws.send(JSON.stringify(message))
    this.markAwaiting()
    return true
  }

  sendFrame(header: ClientFrameHeader, jpeg: ArrayBuffer | Uint8Array): boolean {
    if (!this.isConnected || !this.ws) return false
    this.ws.send(encodeBinaryMessage(header, jpeg))
    this.markAwaiting()
    return true
  }

  // ------------------------------------------------------------------ connection lifecycle
  private open(): void {
    const Impl = this.opts.WebSocketImpl
    const url = typeof this.opts.url === 'function' ? this.opts.url() : this.opts.url
    const gen = ++this.generation
    this.helloReceived = false
    this.closeReason = null
    this.awaitingSince = null
    if (this.status.retryAt !== null) this.setStatus({ ...this.status, retryAt: null })
    let ws: WebSocket
    try {
      ws = new Impl(url)
    } catch (e) {
      this.ws = null
      this.handleClosed(gen, { state: 'error', message: `Bad server address: ${String(e)}`, retry: false })
      return
    }
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    this.helloTimer = setTimeout(() => {
      if (gen !== this.generation || this.helloReceived) return
      this.closeReason = { state: 'offline', message: 'The server did not answer.', retry: true }
      ws.close(CLOSE_STALE, 'no hello')
      // some implementations never fire close for a socket stuck in CONNECTING
      this.handleClosed(gen, null)
    }, this.opts.helloTimeoutMs)
    ws.onmessage = (ev: MessageEvent) => {
      if (gen !== this.generation) return
      this.onMessage(gen, ev.data)
    }
    ws.onclose = (ev: CloseEvent) => {
      if (gen !== this.generation) return
      if (!this.closeReason && ev.code === CLOSE_TRY_AGAIN_LATER) {
        this.closeReason = { state: 'busy', message: ev.reason || 'The server is busy.', retry: true }
      }
      this.handleClosed(gen, null)
    }
    ws.onerror = () => {
      // the close event follows and carries the decision
    }
  }

  private onMessage(gen: number, data: unknown): void {
    this.awaitingSince = null
    if (typeof data === 'string') {
      this.onText(gen, data)
      return
    }
    if (!(data instanceof ArrayBuffer)) return
    let decoded
    try {
      decoded = decodeBinaryMessage(data)
    } catch (e) {
      if (e instanceof FramingError) console.warn('[shinobi] dropped a malformed binary message:', e.message)
      return
    }
    const state = parseFrameState(decoded.header)
    if (!state) {
      console.warn('[shinobi] dropped a binary message whose header is not a FrameState')
      return
    }
    this.handlers.onFrame?.(state, decoded.payload)
  }

  private onText(gen: number, text: string): void {
    const msg = parseServerText(text)
    if (!msg) {
      console.warn('[shinobi] ignored an unknown text message:', text.slice(0, 200))
      return
    }
    switch (msg.type) {
      case 'hello': {
        if (msg.protocol !== PROTOCOL_VERSION) {
          this.closeReason = {
            state: 'error',
            message: `The server speaks protocol ${msg.protocol}, this app speaks ${PROTOCOL_VERSION}. Update the app or the server.`,
            retry: false,
          }
          this.ws?.close(CLOSE_PROTOCOL, 'protocol mismatch')
          this.handleClosed(gen, null)
          return
        }
        if (this.helloTimer) clearTimeout(this.helloTimer)
        this.helloTimer = null
        this.helloReceived = true
        this.everConnected = true
        this.hello = msg
        this.setStatus({ state: 'connected', message: null, failures: 0, retryAt: null })
        this.startPing(gen)
        this.handlers.onHello?.(msg)
        return
      }
      case 'mode':
        this.handlers.onMode?.(msg.mode === 'free' ? { mode: 'free', jutsu: null } : { mode: 'practice', jutsu: msg.jutsu })
        return
      case 'pong':
        this.handlers.onPong?.(msg.t, this.opts.now() - msg.t)
        return
      case 'skipped':
        this.handlers.onSkipped?.((msg.client_t as number | null) ?? null)
        return
      case 'error':
        if (msg.fatal) {
          this.closeReason =
            msg.code === 'busy'
              ? { state: 'busy', message: msg.message, retry: true }
              : { state: 'error', message: msg.message, retry: true }
          // the server closes next; the close event schedules the retry
          return
        }
        this.handlers.onServerError?.(msg)
        return
    }
  }

  private handleClosed(gen: number, reason: CloseReason): void {
    if (gen !== this.generation) return
    this.generation += 1 // ignore anything the old socket still does
    const ws = this.ws
    this.ws = null
    this.hello = null
    if (ws) {
      ws.onmessage = null
      ws.onclose = null
      ws.onerror = null
    }
    this.clearTimers()
    if (!this.running) return
    const wasConnected = this.helloReceived
    const r = reason ?? this.closeReason
    const failures = wasConnected ? 1 : this.status.failures + 1
    let state: ConnectionState
    let message: string | null = r?.message ?? null
    if (r && r.state !== 'offline') {
      state = r.state
    } else if (!this.everConnected) {
      state = 'offline'
      message = message ?? 'The SHINOBI AI server cannot be reached. Is it running?'
    } else if (failures >= this.opts.offlineAfter) {
      state = 'offline'
      message = message ?? 'Lost the connection to the SHINOBI AI server.'
    } else {
      state = 'reconnecting'
      message = message ?? 'Connection lost. Reconnecting…'
    }
    if (r && !r.retry) {
      this.running = false
      this.setStatus({ state, message, failures, retryAt: null })
      return
    }
    let delay = backoffDelay(failures, this.opts.backoff, this.opts.random)
    if (state === 'busy') delay = Math.max(delay, this.opts.busyRetryMs)
    if (wasConnected && state === 'reconnecting') delay = Math.min(delay, this.opts.backoff.baseMs)
    this.setStatus({ state, message, failures, retryAt: this.opts.now() + delay })
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (this.running) this.open()
    }, delay)
  }

  // ------------------------------------------------------------------ heartbeat
  private markAwaiting(): void {
    if (this.awaitingSince === null) this.awaitingSince = this.opts.now()
  }

  private startPing(gen: number): void {
    if (this.pingTimer) clearInterval(this.pingTimer)
    if (this.opts.pingIntervalMs <= 0) return
    this.pingTimer = setInterval(() => {
      if (gen !== this.generation || !this.ws) return
      const now = this.opts.now()
      if (this.awaitingSince !== null && now - this.awaitingSince > this.opts.staleMs) {
        this.closeReason = { state: 'reconnecting', message: 'The server stopped answering. Reconnecting…', retry: true }
        try {
          this.ws.close(CLOSE_STALE, 'stale')
        } catch {
          // ignore
        }
        this.handleClosed(gen, null)
        return
      }
      this.send({ type: 'ping', t: now })
    }, this.opts.pingIntervalMs)
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (this.helloTimer) clearTimeout(this.helloTimer)
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.retryTimer = this.helloTimer = this.pingTimer = null
  }

  private setStatus(next: SocketStatus): void {
    const prev = this.status
    this.status = next
    if (
      prev.state !== next.state ||
      prev.message !== next.message ||
      prev.failures !== next.failures ||
      prev.retryAt !== next.retryAt
    ) {
      this.handlers.onStatus?.(next)
    }
  }
}

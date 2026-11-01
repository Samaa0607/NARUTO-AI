// One live recognition session with the SHINOBI AI backend (docs/web_protocol.md, section 3).
//
//   camera MediaStream -> hidden <video> -> canvas (scaled to fit info.frame.max_*, NOT mirrored)
//     -> JPEG (info.frame.jpeg_quality) -> [len][{"t": performance.now()}][jpeg] -> WebSocket
//   WebSocket -> [len][FrameState][jpeg] -> createImageBitmap -> the stage canvas (already mirrored)
//
// At most info.frame.max_in_flight frames are unanswered (an answer or a `skipped` frees a slot).
// Sending pauses while the tab is hidden; after a long time hidden the session is closed so it
// does not hold one of the server's few session slots. Every recognition value exposed here comes
// from the server's FrameState: nothing is inferred locally, and everything is cleared when the
// connection is not 'connected'.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sessionUrl } from '../services/api'
import { InFlightFrames, ShinobiSocket, fitWithin, type SocketStatus } from '../services/socket'
import type { FrameState, HelloMessage, Mode, ServerInfo } from '../types/protocol'

export type FrameListener = (frame: FrameState) => void

export interface ShinobiSessionOptions {
  /** the camera stream (hooks/useCamera); the session runs only while there is one */
  stream: MediaStream | null
  /** free (Live Demo) or practice of one jutsu */
  mode: Mode
  /** ask the server to draw the MediaPipe hand landmarks */
  landmarks: boolean
  /** set false to stay disconnected even with a stream (default true) */
  enabled?: boolean
}

export interface ShinobiSession {
  status: SocketStatus
  connected: boolean
  info: ServerInfo | null
  sessionId: string | null
  /** latest processed FrameState (null while not connected) */
  frame: FrameState | null
  /** a processed frame from the server is on the canvas */
  live: boolean
  /** smoothed round trip camera frame -> processed frame, ms */
  latencyMs: number | null
  /** the session's processing rate reported by the server */
  serverFps: number | null
  /** the mode the server confirmed last */
  serverMode: Mode | null
  /** sending is paused because the tab is hidden */
  paused: boolean
  /** attach to the <canvas> that shows the processed frames */
  attachCanvas: (canvas: HTMLCanvasElement | null) => void
  /** called once per processed frame, before React re-renders (events are never missed) */
  subscribe: (listener: FrameListener) => () => void
  /** forget the sequence in progress (Retry) */
  reset: () => void
  /** reconnect now instead of waiting for the backoff */
  retry: () => void
}

const IDLE: SocketStatus = { state: 'idle', message: null, failures: 0, retryAt: null }
const HIDDEN_DISCONNECT_MS = 60_000 // a hidden tab gives its session slot back after this long
const MAX_FRAME_AGE_MS = 5000 // an unanswered frame older than this no longer blocks sending
const MAX_BUFFERED_BYTES = 1_500_000 // socket backpressure: wait instead of queueing more
const LATENCY_SMOOTHING = 0.2
const SAFETY_TICK_MS = 400

interface View {
  frame: FrameState | null
  latencyMs: number | null
  serverFps: number | null
}
const EMPTY_VIEW: View = { frame: null, latencyMs: null, serverFps: null }

type EncodeCanvas = OffscreenCanvas | HTMLCanvasElement

interface Pipeline {
  video: HTMLVideoElement | null
  encodeCanvas: EncodeCanvas | null
  inflight: InFlightFrames
  encoding: boolean
  lastSentAt: number
  frameIntervalMs: number
  maxInFlight: number
  maxWidth: number
  maxHeight: number
  quality: number
  latency: number | null
  drawnSeq: number
  hidden: boolean
  timer: ReturnType<typeof setTimeout> | null
  live: boolean
}

function makeEncodeCanvas(): EncodeCanvas {
  return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(2, 2) : document.createElement('canvas')
}

async function canvasToJpeg(canvas: EncodeCanvas, quality: number): Promise<Blob | null> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality })
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

const modeKey = (m: Mode) => `${m.mode}:${m.jutsu ?? ''}`
const modeMessage = (m: Mode) =>
  m.mode === 'free' ? ({ type: 'mode', mode: 'free' } as const) : ({ type: 'mode', mode: 'practice', jutsu: m.jutsu } as const)

export function useShinobiSession({ stream, mode, landmarks, enabled = true }: ShinobiSessionOptions): ShinobiSession {
  const [status, setStatus] = useState<SocketStatus>(IDLE)
  const [hello, setHello] = useState<HelloMessage | null>(null)
  const [serverMode, setServerMode] = useState<Mode | null>(null)
  const [view, setView] = useState<View>(EMPTY_VIEW)
  const [live, setLive] = useState(false)
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.visibilityState === 'hidden')
  const [hiddenLong, setHiddenLong] = useState(false)

  const socketRef = useRef<ShinobiSocket | null>(null)
  const canvasEl = useRef<HTMLCanvasElement | null>(null)
  const listeners = useRef(new Set<FrameListener>())
  const modeRef = useRef(mode)
  const landmarksRef = useRef(landmarks)
  const pipe = useRef<Pipeline>({
    video: null,
    encodeCanvas: null,
    inflight: new InFlightFrames(),
    encoding: false,
    lastSentAt: -Infinity,
    frameIntervalMs: 1000 / 30,
    maxInFlight: 2,
    maxWidth: 1280,
    maxHeight: 1280,
    quality: 0.8,
    latency: null,
    drawnSeq: 0,
    hidden: false,
    timer: null,
    live: false,
  })

  const active = enabled && stream !== null && !hiddenLong

  useEffect(() => {
    modeRef.current = mode
    landmarksRef.current = landmarks
  })

  // ------------------------------------------------------------------ sending camera frames
  const pump = useCallback(function pump() {
    const p = pipe.current
    const socket = socketRef.current
    if (!socket || !socket.isConnected || p.encoding || p.hidden) return
    const video = p.video
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return
    const now = performance.now()
    p.inflight.expire(now, MAX_FRAME_AGE_MS)
    if (p.inflight.size >= p.maxInFlight) return // the next answer (or skipped) calls pump again
    const wait = Math.max(p.lastSentAt + p.frameIntervalMs - now, socket.bufferedAmount > MAX_BUFFERED_BYTES ? 50 : 0)
    if (wait > 0) {
      if (!p.timer) {
        p.timer = setTimeout(() => {
          p.timer = null
          pump()
        }, wait)
      }
      return
    }
    p.encoding = true
    const t = now
    const { width, height } = fitWithin(video.videoWidth, video.videoHeight, p.maxWidth, p.maxHeight)
    const canvas = (p.encodeCanvas ??= makeEncodeCanvas())
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (!ctx) {
      p.encoding = false
      return
    }
    ctx.drawImage(video, 0, 0, width, height) // as the camera delivers it: the server mirrors
    canvasToJpeg(canvas, p.quality)
      .then((blob) => (blob ? blob.arrayBuffer() : null))
      .then((bytes) => {
        if (!bytes || socketRef.current !== socket || !socket.isConnected) return
        if (socket.sendFrame({ t }, bytes)) {
          p.inflight.add(t, performance.now())
          p.lastSentAt = t
        }
      })
      .catch((e: unknown) => console.warn('[shinobi] frame not sent:', e))
      .finally(() => {
        p.encoding = false
        pump()
      })
  }, [])

  // ------------------------------------------------------------------ drawing processed frames
  const draw = useCallback((jpeg: Uint8Array, seq: number, socket: ShinobiSocket) => {
    const blob = new Blob([jpeg as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })
    createImageBitmap(blob)
      .then((bitmap) => {
        const p = pipe.current
        const canvas = canvasEl.current
        if (socketRef.current !== socket || !socket.isConnected || seq <= p.drawnSeq || !canvas) {
          bitmap.close()
          return
        }
        p.drawnSeq = seq
        if (canvas.width !== bitmap.width) canvas.width = bitmap.width
        if (canvas.height !== bitmap.height) canvas.height = bitmap.height
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
        bitmap.close()
        if (!p.live) {
          p.live = true
          setLive(true)
        }
      })
      .catch(() => {
        // a corrupt JPEG: skip this one, the next frame follows
      })
  }, [])

  // ------------------------------------------------------------------ the connection
  useEffect(() => {
    if (!active) return
    const p = pipe.current
    const clearSession = () => {
      p.inflight.clear()
      p.latency = null
      p.drawnSeq = 0
      p.live = false
      setLive(false)
      setView(EMPTY_VIEW)
      setHello(null)
      setServerMode(null)
    }
    const socket = new ShinobiSocket({
      url: sessionUrl,
      handlers: {
        onStatus: (s) => {
          setStatus(s)
          if (s.state !== 'connected') clearSession() // never show recognition while disconnected
        },
        onHello: (h) => {
          const f = h.info.frame
          p.maxInFlight = Math.max(1, f.max_in_flight || 1)
          p.maxWidth = f.max_width || 1280
          p.maxHeight = f.max_height || 1280
          p.quality = f.jpeg_quality > 0 && f.jpeg_quality <= 1 ? f.jpeg_quality : 0.8
          p.inflight.clear()
          p.drawnSeq = 0
          setHello(h)
          setServerMode(h.mode)
          socket.send(modeMessage(modeRef.current))
          socket.send({ type: 'options', landmarks: landmarksRef.current })
          pump()
        },
        onFrame: (frame, jpeg) => {
          const now = performance.now()
          if (frame.client_t !== null) {
            p.inflight.answer(frame.client_t)
            const rtt = now - frame.client_t
            if (rtt >= 0 && rtt < 60_000) {
              p.latency = p.latency === null ? rtt : p.latency + LATENCY_SMOOTHING * (rtt - p.latency)
            }
          }
          listeners.current.forEach((listener) => {
            try {
              listener(frame)
            } catch (e) {
              console.error('[shinobi] frame listener failed:', e)
            }
          })
          setView({ frame, latencyMs: p.latency, serverFps: frame.fps })
          draw(jpeg, frame.seq, socket)
          pump()
        },
        onSkipped: (clientT) => {
          if (clientT === null) p.inflight.dropOldest() // its header was unreadable: answers are FIFO
          else p.inflight.skip(clientT)
          pump()
        },
        onMode: (m) => setServerMode(m),
        onServerError: (err) => {
          // a bad_frame error is followed by its own `skipped`, which settles the in-flight count
          console.warn(`[shinobi] server: ${err.code}: ${err.message}`)
          pump()
        },
      },
    })
    socketRef.current = socket
    socket.connect()
    const tick = setInterval(pump, SAFETY_TICK_MS)
    const onOnline = () => socket.retryNow()
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
      clearInterval(tick)
      if (p.timer) clearTimeout(p.timer)
      p.timer = null
      socketRef.current = null
      socket.disconnect()
      clearSession()
      setStatus(IDLE)
    }
  }, [active, pump, draw])

  // ------------------------------------------------------------------ the camera feed to capture
  useEffect(() => {
    const p = pipe.current
    if (!stream) return
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    video.srcObject = stream
    const fps = stream.getVideoTracks()[0]?.getSettings().frameRate
    p.frameIntervalMs = 1000 / Math.min(30, fps && fps > 0 ? fps : 30)
    p.video = video
    video.addEventListener('loadeddata', pump)
    video.addEventListener('playing', pump)
    video.play().catch(() => {
      // autoplay of a muted camera stream is allowed; ignore aborted plays (stream switched)
    })
    return () => {
      video.removeEventListener('loadeddata', pump)
      video.removeEventListener('playing', pump)
      video.pause()
      video.srcObject = null
      if (p.video === video) p.video = null
    }
  }, [stream, pump])

  // ------------------------------------------------------------------ tab visibility
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onVisibility = () => {
      const isHidden = document.visibilityState === 'hidden'
      pipe.current.hidden = isHidden
      setHidden(isHidden)
      if (timer) clearTimeout(timer)
      timer = null
      if (isHidden) {
        timer = setTimeout(() => setHiddenLong(true), HIDDEN_DISCONNECT_MS)
      } else {
        setHiddenLong(false)
        pump()
      }
    }
    pipe.current.hidden = document.visibilityState === 'hidden'
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      if (timer) clearTimeout(timer)
    }
  }, [pump])

  // ------------------------------------------------------------------ mode and options
  const currentModeKey = modeKey(mode)
  useEffect(() => {
    socketRef.current?.send(modeMessage(modeRef.current))
  }, [currentModeKey])

  useEffect(() => {
    socketRef.current?.send({ type: 'options', landmarks })
  }, [landmarks])

  // ------------------------------------------------------------------ API
  const subscribe = useCallback((listener: FrameListener) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])
  const reset = useCallback(() => {
    socketRef.current?.send({ type: 'reset' })
  }, [])
  const retry = useCallback(() => {
    if (hiddenLong) setHiddenLong(false)
    socketRef.current?.retryNow()
  }, [hiddenLong])
  const attachCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasEl.current = canvas
  }, [])

  const connected = status.state === 'connected'
  return useMemo(
    () => ({
      status,
      connected,
      info: connected ? (hello?.info ?? null) : null,
      sessionId: connected ? (hello?.session ?? null) : null,
      frame: connected ? view.frame : null,
      live: connected && live,
      latencyMs: connected ? view.latencyMs : null,
      serverFps: connected ? view.serverFps : null,
      serverMode: connected ? serverMode : null,
      paused: hidden,
      attachCanvas,
      subscribe,
      reset,
      retry,
    }),
    [status, connected, hello, view, live, serverMode, hidden, attachCanvas, subscribe, reset, retry],
  )
}

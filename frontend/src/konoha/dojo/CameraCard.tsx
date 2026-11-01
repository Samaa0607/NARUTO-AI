// "LIVE CAMERA" card of the dojo. While the AI is live it shows the processed frames from the
// server (already mirrored, effects drawn by Python) with two small chips: what the AI sees now and
// the connection. Otherwise it shows the local camera preview (mirrored) with a clear
// connecting / offline notice and NO recognition. Start / Stop, camera picker, full screen.
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, CameraOff, Hand, Loader2, Maximize, Minimize, RefreshCw, ShieldAlert, Square, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { connectionText, formatFps, formatMs, signName } from '../../components/live/labels'
import { StageOverlay } from '../../components/live/StageOverlay'
import type { LiveEvents } from '../../components/live/useLiveEvents'
import { useSettings } from '../../contexts/SettingsContext'
import { useSound } from '../../contexts/SoundContext'
import type { UseCamera } from '../../hooks/useCamera'
import type { ShinobiSession } from '../../hooks/useShinobiSession'
import type { Catalog } from '../../types/catalog'
import type { FrameState } from '../../types/protocol'
import { BrushButton } from '../BrushButton'
import { ParchmentCard } from '../ParchmentCard'
import styles from './CameraCard.module.css'

export interface CameraCardProps {
  camera: UseCamera
  session: ShinobiSession
  catalog: Catalog | null
  events: LiveEvents
  className?: string
  /** 'hero' (Live page): the video as large as the card and the window allow (the page sets
   *  --video-max-h on the card); 'default' keeps the Home look */
  size?: 'default' | 'hero'
}

function useNow(active: boolean, everyMs = 500): number {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(performance.now()), everyMs)
    return () => clearInterval(id)
  }, [active, everyMs])
  return now
}

/** Full screen for one element (the video box). `supported` is false where the API is missing. */
function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false)
  const supported = typeof document !== 'undefined' && document.fullscreenEnabled === true
  useEffect(() => {
    const onChange = () => setActive(document.fullscreenElement !== null && document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [ref])
  const toggle = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
    } else {
      void ref.current?.requestFullscreen().catch(() => {})
    }
  }
  return { active, supported, toggle }
}

const CAMERA_PROBLEM_TITLE = {
  denied: 'Camera blocked',
  insecure: 'Camera needs a secure page',
  unavailable: 'No camera found',
  error: 'Camera unavailable',
} as const

export function CameraCard({ camera, session, catalog, events, className, size = 'default' }: CameraCardProps) {
  const { settings, update } = useSettings()
  const sound = useSound()
  const stageRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const { attachCanvas } = session
  const [previewAspect, setPreviewAspect] = useState<number | null>(null)
  const fullscreen = useFullscreen(stageRef)

  const cameraOn = camera.status === 'active' && camera.stream !== null
  const live = cameraOn && session.live
  // processed frames are shown, but the AI does not count signs yet (warm-up)
  const warming = live && session.frame?.ready === false
  const waitingForAi = cameraOn && (!live || warming)
  const frame = live ? session.frame : null
  const state = session.status.state
  const now = useNow(waitingForAi && session.status.retryAt !== null)
  const conn = connectionText(session.status, now)
  const requesting = camera.status === 'requesting'
  const problem =
    camera.status === 'denied' || camera.status === 'unavailable' || camera.status === 'insecure' || camera.status === 'error'
      ? camera.status
      : null

  // the local preview (shown only while the AI is not live)
  useEffect(() => {
    const video = previewRef.current
    if (!video) return
    if (video.srcObject !== camera.stream) video.srcObject = camera.stream
    if (camera.stream) video.play().catch(() => {})
  }, [camera.stream])

  // leaving full screen when the camera stops
  useEffect(() => {
    if (!cameraOn && document.fullscreenElement && document.fullscreenElement === stageRef.current) {
      void document.exitFullscreen().catch(() => {})
    }
  }, [cameraOn])

  const frameW = session.frame?.width
  const frameH = session.frame?.height
  const rawAspect = live && frameW && frameH ? frameW / frameH : cameraOn && previewAspect ? previewAspect : 16 / 9
  const aspect = Math.min(16 / 9, Math.max(1, rawAspect))

  const start = async () => {
    try {
      await sound.unlock()
    } catch {
      // sound is optional: the camera starts anyway
    }
    await camera.start(settings.cameraId)
  }

  const cams = camera.devices.filter((d) => d.deviceId)
  const pickedId = cameraOn ? (camera.activeDeviceId ?? settings.cameraId ?? '') : (settings.cameraId ?? '')
  const pickerValue = cams.some((d) => d.deviceId === pickedId) ? pickedId : ''
  const pickCamera = (deviceId: string) => {
    update({ cameraId: deviceId || null })
    if (cameraOn) void camera.start(deviceId || null)
  }

  return (
    <ParchmentCard
      title="Live Camera"
      icon={<Camera />}
      className={[styles.card, size === 'hero' ? styles.hero : '', className ?? ''].filter(Boolean).join(' ')}
    >
      <div
        ref={stageRef}
        className={[styles.stage, cameraOn ? styles.on : '', live ? styles.live : ''].filter(Boolean).join(' ')}
        style={{ '--ar': String(aspect) } as CSSProperties}
        data-testid="camera-stage"
        data-ai-state={state}
        data-live={live ? 'true' : 'false'}
      >
        <div className={styles.media} role="img" aria-label={live ? 'Live camera, processed by the AI' : 'Live camera'}>
          {/* processed frames from the server (already mirrored, effects drawn by Python) */}
          <canvas ref={attachCanvas} className={styles.canvas} hidden={!live} data-testid="processed-canvas" />
          {/* local preview while the AI is not live: mirrored selfie view */}
          <video
            ref={previewRef}
            className={styles.preview}
            muted
            playsInline
            autoPlay
            hidden={!waitingForAi}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget
              if (v.videoWidth && v.videoHeight) setPreviewAspect(v.videoWidth / v.videoHeight)
            }}
          />
        </div>

        {cameraOn ? <ConnectionChip session={session} label={conn.label} tone={conn.tone} detail={conn.detail} /> : null}
        {frame ? <SignChip frame={frame} catalog={catalog} /> : null}

        {fullscreen.supported && cameraOn ? (
          <button
            type="button"
            className={styles.fullscreen}
            onClick={fullscreen.toggle}
            aria-label={fullscreen.active ? 'Exit full screen' : 'Show the camera full screen'}
            title={fullscreen.active ? 'Exit full screen' : 'Full screen'}
            data-testid="fullscreen"
          >
            {fullscreen.active ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
          </button>
        ) : null}

        {/* AI not live: the preview is dimmed and says so; never any recognition here */}
        <AnimatePresence>
          {waitingForAi ? (
            <motion.div
              key="ai-wait"
              className={styles.notice}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              data-testid="ai-offline-badge"
              data-state={warming ? 'warming' : state}
            >
              <span className={[styles.noticeIcon, styles[conn.tone]].join(' ')} aria-hidden="true">
                {warming || state === 'connecting' || state === 'connected' ? (
                  <Loader2 className={styles.spin} />
                ) : state === 'busy' ? (
                  <ShieldAlert />
                ) : (
                  <WifiOff />
                )}
              </span>
              <span className={styles.noticeTitle}>
                {warming || state === 'connecting' || state === 'connected' ? 'AI is getting ready…' : conn.label}
              </span>
              <span className={styles.noticeText}>
                <span className={styles.noticeDetail}>
                  {warming
                    ? 'Almost there: the camera and the AI are warming up.'
                    : state === 'connecting'
                      ? 'Loading the AI models (a few seconds).'
                      : state === 'connected'
                        ? 'Warming up the models. The first processed frame is on its way.'
                        : (conn.detail ?? '')}{' '}
                </span>
                <strong>
                  {warming || state === 'connecting' || state === 'connected'
                    ? 'Wait until this message goes away before your first sign. The timer starts only after it.'
                    : 'No recognition is shown until the AI is live.'}
                </strong>
              </span>
              {!warming && state !== 'connecting' && state !== 'connected' ? (
                <button type="button" className={styles.retry} onClick={session.retry}>
                  <RefreshCw aria-hidden="true" /> Retry now
                </button>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {live ? (
          <div className={styles.overlay}>
            <StageOverlay events={events} catalog={catalog} frame={frame} />
          </div>
        ) : null}

        {/* camera not running */}
        {!cameraOn ? (
          requesting ? (
            <div className={styles.idle} role="status">
              <span className={styles.idleIcon} aria-hidden="true">
                <Loader2 className={styles.spin} />
              </span>
              <p className={styles.idleTitle}>Waiting for the camera…</p>
              <p className={styles.idleText}>Allow camera access in the browser prompt.</p>
            </div>
          ) : problem ? (
            <div className={[styles.idle, styles.problem].join(' ')} role="alert" data-testid="camera-error">
              <span className={styles.idleIcon} aria-hidden="true">
                <CameraOff />
              </span>
              <p className={styles.idleTitle}>{CAMERA_PROBLEM_TITLE[problem]}</p>
              <p className={styles.idleText}>{camera.error}</p>
            </div>
          ) : (
            <div className={styles.idle}>
              <span className={styles.idleIcon} aria-hidden="true">
                <Camera />
              </span>
              <p className={styles.idleTitle}>Camera is off</p>
              <p className={styles.idleText}>
                Press Start Camera. Frames go to the AI server on this computer for recognition; nothing is
                recorded.
              </p>
            </div>
          )
        ) : null}
      </div>

      <div className={styles.controls}>
        <BrushButton
          icon={problem && problem !== 'insecure' ? <RefreshCw /> : <Camera />}
          onClick={() => void start()}
          disabled={cameraOn || requesting || problem === 'insecure'}
          data-testid="start-camera"
        >
          {problem && problem !== 'insecure' ? 'Try Again' : 'Start Camera'}
        </BrushButton>
        <BrushButton
          variant="secondary"
          icon={<Square className={styles.stopIcon} />}
          onClick={camera.stop}
          disabled={!cameraOn}
          data-testid="stop-camera"
        >
          Stop Camera
        </BrushButton>
        {cams.length > 1 ? (
          <label className={styles.picker}>
            <span className="visually-hidden">Camera</span>
            <Camera aria-hidden="true" />
            <select value={pickerValue} onChange={(e) => pickCamera(e.target.value)} data-testid="camera-picker">
              <option value="">Default camera</option>
              {cams.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </ParchmentCard>
  )
}

function ConnectionChip({
  session,
  label,
  tone,
  detail,
}: {
  session: ShinobiSession
  label: string
  tone: string
  detail: string | null
}) {
  const connected = session.status.state === 'connected'
  const paused = connected && session.paused
  return (
    <span
      className={[styles.chip, styles.connChip, styles[paused ? 'warning' : tone]].join(' ')}
      data-testid="connection-pill"
      data-state={session.status.state}
      title={detail ?? undefined}
    >
      <span className={styles.dot} aria-hidden="true" />
      <span role="status">{paused ? 'Paused' : label}</span>
      {connected && session.latencyMs !== null ? (
        <span className={styles.meta} data-testid="stat-latency">
          {formatMs(session.latencyMs)}
        </span>
      ) : null}
      {connected && session.serverFps !== null ? (
        <span className={[styles.meta, styles.fps].join(' ')}>
          <span data-testid="stat-fps">{formatFps(session.serverFps)}</span> fps
        </span>
      ) : null}
    </span>
  )
}

function SignChip({ frame, catalog }: { frame: FrameState; catalog: Catalog | null }) {
  const seen = frame.sign.name !== 'idle' ? frame.sign.name : null
  const holding = frame.candidate && frame.candidate !== frame.latched ? frame.candidate : null
  const hold = Math.min(1, Math.max(0, frame.hold))
  return (
    <span
      className={[styles.chip, styles.signChip, seen ? '' : styles.signIdle].filter(Boolean).join(' ')}
      data-testid="current-sign"
      data-sign={frame.sign.name}
    >
      <Hand aria-hidden="true" />
      <span className={styles.signKicker}>AI sees</span>
      <strong className={styles.signName}>
        {seen ? signName(catalog, seen) : frame.hands === 0 ? 'No hands' : 'No sign'}
      </strong>
      {seen ? <span className={styles.meta}>{Math.round(frame.sign.score * 100)}%</span> : null}
      {holding ? <span className={styles.holdBar} style={{ transform: `scaleX(${hold})` }} aria-hidden="true" /> : null}
    </span>
  )
}

// The camera stage: the processed frames from the server in a chakra frame. While the AI is not
// live (connecting, offline, busy...) it shows the local camera preview (mirrored, like a selfie)
// with a clear status badge and NO recognition UI. Also: start/stop, camera picker, landmarks.
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, CameraOff, Hand, Loader2, RefreshCw, ShieldAlert, Video, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import { useSound } from '../../contexts/SoundContext'
import type { UseCamera } from '../../hooks/useCamera'
import type { ShinobiSession } from '../../hooks/useShinobiSession'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { Switch } from '../ui/Switch'
import { ConnectionPill } from './ConnectionPill'
import { connectionText } from './labels'
import styles from './CameraStage.module.css'

export interface CameraStageProps {
  camera: UseCamera
  session: ShinobiSession
  /** shown over the processed video only while the AI is live (activation overlay, toasts) */
  overlay?: ReactNode
  /** accessible name of the video area */
  label?: string
  /** text under the Start button */
  intro?: ReactNode
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

export function CameraStage({ camera, session, overlay, label = 'Live camera', intro }: CameraStageProps) {
  const { settings, update } = useSettings()
  const sound = useSound()
  const previewRef = useRef<HTMLVideoElement>(null)
  const { attachCanvas } = session
  const [previewAspect, setPreviewAspect] = useState<number | null>(null)
  const cameraOn = camera.status === 'active' && camera.stream !== null
  const live = cameraOn && session.live
  const waitingForAi = cameraOn && !live
  const now = useNow(waitingForAi && session.status.retryAt !== null)
  const conn = connectionText(session.status, now)

  // local preview (only shown while the AI is not live)
  useEffect(() => {
    const video = previewRef.current
    if (!video) return
    if (video.srcObject !== camera.stream) video.srcObject = camera.stream
    if (camera.stream) video.play().catch(() => {})
  }, [camera.stream])

  const frameW = session.frame?.width
  const frameH = session.frame?.height
  const aspect = live && frameW && frameH ? frameW / frameH : (previewAspect ?? 16 / 9)

  const start = () => {
    void sound.unlock()
    void camera.start(settings.cameraId)
  }

  const pickCamera = (deviceId: string) => {
    update({ cameraId: deviceId || null })
    if (cameraOn) void camera.start(deviceId || null)
  }

  const deviceOptions = [
    { value: '', label: 'Default camera' },
    ...camera.devices.filter((d) => d.deviceId).map((d) => ({ value: d.deviceId, label: d.label })),
  ]
  const selectedDevice = cameraOn ? (camera.activeDeviceId ?? settings.cameraId ?? '') : (settings.cameraId ?? '')
  const deviceValue = deviceOptions.some((o) => o.value === selectedDevice) ? selectedDevice : ''

  const cameraProblem = camera.status === 'denied' || camera.status === 'unavailable' || camera.status === 'insecure' || camera.status === 'error'

  return (
    <div className={styles.wrap}>
      <div
        className={[styles.stage, live ? styles.live : '', cameraOn ? styles.on : ''].filter(Boolean).join(' ')}
        style={{ '--ar': String(aspect) } as CSSProperties}
        data-testid="camera-stage"
        data-ai-state={session.status.state}
        data-live={live ? 'true' : 'false'}
      >
        <div className={styles.media} role="img" aria-label={live ? `${label}: processed by SHINOBI AI` : label}>
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
          {waitingForAi ? <div className={styles.dim} aria-hidden="true" /> : null}
        </div>

        <span className={styles.corner} data-pos="tl" aria-hidden="true" />
        <span className={styles.corner} data-pos="tr" aria-hidden="true" />
        <span className={styles.corner} data-pos="bl" aria-hidden="true" />
        <span className={styles.corner} data-pos="br" aria-hidden="true" />

        {cameraOn ? (
          <div className={styles.topLeft}>
            <ConnectionPill status={session.status} latencyMs={session.latencyMs} paused={session.paused} />
          </div>
        ) : null}

        {/* AI not live: a clear badge in the middle, never any recognition UI */}
        <AnimatePresence>
          {waitingForAi ? (
            <motion.div
              key="ai-wait"
              className={styles.aiNotice}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              data-testid="ai-offline-badge"
            >
              <span className={[styles.aiIcon, styles[conn.tone]].join(' ')} aria-hidden="true">
                {session.status.state === 'connecting' || (session.status.state === 'connected' && !live) ? (
                  <Loader2 className={styles.spin} />
                ) : session.status.state === 'busy' ? (
                  <ShieldAlert />
                ) : (
                  <WifiOff />
                )}
              </span>
              <span className={styles.aiTitle}>
                {session.status.state === 'connected' ? 'Waiting for the first AI frame…' : conn.label}
              </span>
              <span className={styles.aiText}>
                {session.status.state === 'connected'
                  ? 'Connected. The first processed frame is on its way.'
                  : (conn.detail ?? '')}{' '}
                No recognition is shown until the AI is live.
              </span>
              {session.status.state !== 'connecting' && session.status.state !== 'connected' ? (
                <Button variant="secondary" size="sm" icon={<RefreshCw />} onClick={session.retry}>
                  Retry now
                </Button>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {live && overlay ? <div className={styles.overlay}>{overlay}</div> : null}

        {/* camera not running */}
        {!cameraOn ? (
          <div className={styles.idle}>
            {camera.status === 'requesting' ? (
              <div className={styles.idleBody} role="status">
                <span className={styles.seal} aria-hidden="true">
                  <Loader2 className={styles.spin} />
                </span>
                <p className={styles.idleTitle}>Waiting for the camera…</p>
                <p className={styles.idleText}>Allow camera access in the browser prompt.</p>
              </div>
            ) : cameraProblem ? (
              <div className={styles.idleBody} role="alert" data-testid="camera-error">
                <span className={[styles.seal, styles.sealDanger].join(' ')} aria-hidden="true">
                  <CameraOff />
                </span>
                <p className={styles.idleTitle}>
                  {camera.status === 'denied'
                    ? 'Camera blocked'
                    : camera.status === 'insecure'
                      ? 'Camera needs a secure page'
                      : camera.status === 'unavailable'
                        ? 'No camera found'
                        : 'Camera unavailable'}
                </p>
                <p className={styles.idleText}>{camera.error}</p>
                {camera.status !== 'insecure' ? (
                  <Button icon={<RefreshCw />} onClick={start}>
                    Try again
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className={styles.idleBody}>
                <span className={styles.seal} aria-hidden="true">
                  <Camera />
                </span>
                <p className={styles.idleTitle}>Ready when you are</p>
                <div className={styles.idleText}>
                  {intro ?? 'Start the camera. Frames go to the SHINOBI AI server on this computer for recognition; nothing is recorded.'}
                </div>
                <Button size="lg" icon={<Video />} onClick={start} data-testid="start-camera">
                  Start camera
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className={styles.controls}>
        {cameraOn ? (
          <Button variant="secondary" size="sm" icon={<CameraOff />} onClick={camera.stop} data-testid="stop-camera">
            Stop camera
          </Button>
        ) : (
          <Button variant="secondary" size="sm" icon={<Video />} onClick={start} disabled={camera.status === 'requesting'}>
            Start camera
          </Button>
        )}
        {deviceOptions.length > 2 || (cameraOn && deviceOptions.length > 1) ? (
          <Select
            className={styles.picker}
            label="Camera"
            icon={<Camera />}
            value={deviceValue}
            options={deviceOptions}
            onChange={pickCamera}
          />
        ) : null}
        <Switch
          className={styles.landmarks}
          checked={settings.showLandmarks}
          onChange={(checked) => update({ showLandmarks: checked })}
          label="Hand landmarks"
          icon={<Hand />}
        />
      </div>
    </div>
  )
}

// Browser camera (getUserMedia): permission states, device list, start/stop, device switching.
import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus =
  | 'idle' // not started
  | 'requesting' // waiting for the permission prompt / the device
  | 'active' // streaming
  | 'denied' // the user (or the browser) blocked camera access
  | 'unavailable' // no camera found
  | 'insecure' // page is not https/localhost: browsers hide the camera API
  | 'error' // anything else (camera busy in another app, unplugged...)

export interface CameraDevice {
  deviceId: string
  label: string
}

export interface UseCamera {
  status: CameraStatus
  stream: MediaStream | null
  /** user-facing explanation when status is denied / unavailable / insecure / error */
  error: string | null
  devices: CameraDevice[]
  /** deviceId of the camera that is streaming now */
  activeDeviceId: string | null
  /** start (or switch to) a camera; null/undefined = browser default */
  start: (deviceId?: string | null) => Promise<void>
  stop: () => void
  refreshDevices: () => Promise<void>
}

const MESSAGES = {
  insecure: 'Camera access needs a secure page: open the app on http://localhost or over HTTPS.',
  unavailable: 'No camera was found. Connect a webcam and try again.',
  denied: 'Camera access was blocked. Allow the camera in your browser (the camera icon in the address bar), then try again.',
  busy: 'The camera is busy or not readable. Close other apps that use it (Zoom, Teams, the Python camera window) and try again.',
  ended: 'The camera stopped (unplugged or taken by another app).',
}

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

export function useCamera(): UseCamera {
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [devices, setDevices] = useState<CameraDevice[]>([])
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const requestId = useRef(0) // ignore results of superseded start() calls

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const cams = all.filter((d) => d.kind === 'videoinput')
      setDevices(cams.map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` })))
    } catch {
      // enumeration is optional; the default camera still works
    }
  }, [])

  const stop = useCallback(() => {
    requestId.current += 1
    stopTracks(streamRef.current)
    streamRef.current = null
    setStream(null)
    setActiveDeviceId(null)
    setStatus('idle')
    setError(null)
  }, [])

  const start = useCallback(
    async (deviceId?: string | null) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus(window.isSecureContext ? 'unavailable' : 'insecure')
        setError(window.isSecureContext ? MESSAGES.unavailable : MESSAGES.insecure)
        return
      }
      const id = ++requestId.current
      setStatus('requesting')
      setError(null)
      const video = (exact: string | null | undefined): MediaTrackConstraints => ({
        ...(exact ? { deviceId: { exact } } : {}),
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      })
      let next: MediaStream
      try {
        try {
          next = await navigator.mediaDevices.getUserMedia({ video: video(deviceId), audio: false })
        } catch (e) {
          // the saved camera may be gone: fall back to the default one
          if (deviceId && e instanceof DOMException && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {
            next = await navigator.mediaDevices.getUserMedia({ video: video(null), audio: false })
          } else {
            throw e
          }
        }
      } catch (e) {
        if (id !== requestId.current) return
        const name = e instanceof DOMException ? e.name : ''
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setStatus('denied')
          setError(MESSAGES.denied)
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setStatus('unavailable')
          setError(MESSAGES.unavailable)
        } else {
          setStatus('error')
          setError(name === 'NotReadableError' || name === 'AbortError' ? MESSAGES.busy : `Camera error: ${String(e)}`)
        }
        return
      }
      if (id !== requestId.current) {
        stopTracks(next) // a newer start()/stop() won the race
        return
      }
      stopTracks(streamRef.current)
      streamRef.current = next
      const track = next.getVideoTracks()[0]
      track?.addEventListener('ended', () => {
        if (streamRef.current !== next) return
        streamRef.current = null
        setStream(null)
        setStatus('error')
        setError(MESSAGES.ended)
      })
      setStream(next)
      setActiveDeviceId(track?.getSettings().deviceId ?? null)
      setStatus('active')
      void refreshDevices() // labels are only visible after permission
    },
    [refreshDevices],
  )

  useEffect(() => {
    const media = navigator.mediaDevices
    if (!media?.addEventListener) return
    // deferred so the initial enumeration does not set state inside the effect body
    const first = window.setTimeout(() => void refreshDevices(), 0)
    const onChange = () => void refreshDevices()
    media.addEventListener('devicechange', onChange)
    return () => {
      window.clearTimeout(first)
      media.removeEventListener('devicechange', onChange)
    }
  }, [refreshDevices])

  useEffect(
    () => () => {
      requestId.current += 1
      stopTracks(streamRef.current)
      streamRef.current = null
    },
    [],
  )

  return { status, stream, error, devices, activeDeviceId, start, stop, refreshDevices }
}

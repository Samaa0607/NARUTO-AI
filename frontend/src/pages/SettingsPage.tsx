// Settings: theme, animations, camera (with a local preview), sound, landmarks, reset.
// Everything is saved in this browser by SettingsContext / ThemeContext (localStorage).
import {
  Camera,
  CameraOff,
  Check,
  Eye,
  Flame,
  LoaderCircle,
  Music,
  Palette,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  Webcam,
  Zap,
} from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { JutsuMotif } from '../components/art/JutsuMotif'
import { useDocumentTitle } from '../components/layout/useDocumentTitle'
import { Button, Reveal, SectionHeading, SegmentedControl, Select, Slider, Switch } from '../components/ui'
import { useSettings, type AnimationLevel } from '../contexts/SettingsContext'
import { useSound } from '../contexts/SoundContext'
import { useTheme, type ThemeId } from '../contexts/ThemeContext'
import { useCamera, type CameraStatus } from '../hooks/useCamera'
import styles from './SettingsPage.module.css'

function SettingsSection({
  id,
  icon,
  title,
  kanji,
  description,
  children,
}: {
  id: string
  icon: ReactNode
  title: string
  kanji: string
  description: ReactNode
  children: ReactNode
}) {
  return (
    <Reveal>
      <section className={styles.section} aria-labelledby={id}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionKanji} aria-hidden="true">
            {kanji}
          </span>
          <span className={styles.sectionIcon} aria-hidden="true">
            {icon}
          </span>
          <h2 id={id} className={styles.sectionTitle}>
            {title}
          </h2>
          <p className={styles.sectionText}>{description}</p>
        </div>
        <div className={styles.sectionBody}>{children}</div>
      </section>
    </Reveal>
  )
}

// ------------------------------------------------------------------------------------ appearance
const THEME_OPTIONS: { id: ThemeId; name: string; text: string; colors: [string, string]; motif: 'sphere' | 'lightning' }[] =
  [
    { id: 'naruto', name: 'Naruto Mode', text: 'Orange and gold chakra, warm embers', colors: ['#ff7a18', '#ffc23d'], motif: 'sphere' },
    { id: 'sasuke', name: 'Sasuke Mode', text: 'Blue and violet chakra, lightning', colors: ['#4b93ff', '#b88bff'], motif: 'lightning' },
  ]

const MOTION_OPTIONS = [
  { value: 'full', label: 'Full', icon: <Sparkles /> },
  { value: 'reduced', label: 'Reduced', icon: <Eye /> },
  { value: 'off', label: 'Off', icon: <Power /> },
] as const

function Appearance() {
  const { theme, setTheme } = useTheme()
  const { settings, update, motion } = useSettings()
  return (
    <SettingsSection
      id="appearance-title"
      icon={<Palette />}
      title="Appearance"
      kanji="彩"
      description="The style changes only the look of the app. Recognition works exactly the same in both modes."
    >
      <div className={styles.field}>
        <p className={styles.label} id="theme-label">
          Chakra style
        </p>
        <div className={styles.themes} role="radiogroup" aria-labelledby="theme-label">
          {THEME_OPTIONS.map((option) => {
            const active = theme === option.id
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={[styles.theme, active ? styles.themeActive : ''].filter(Boolean).join(' ')}
                style={{ '--t1': option.colors[0], '--t2': option.colors[1] } as CSSProperties}
                onClick={() => setTheme(option.id)}
              >
                <JutsuMotif kind={option.motif} color={option.colors[0]} color2={option.colors[1]} size={64} animated={active} />
                <span className={styles.themeText}>
                  <span className={styles.themeName}>
                    {option.id === 'naruto' ? <Flame aria-hidden="true" /> : <Zap aria-hidden="true" />}
                    {option.name}
                  </span>
                  <span className={styles.themeDesc}>{option.text}</span>
                </span>
                <span className={styles.themeCheck} aria-hidden="true">
                  {active ? <Check /> : null}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className={styles.field}>
        <p className={styles.label} id="motion-label">
          Animations
        </p>
        <SegmentedControl
          options={MOTION_OPTIONS}
          value={settings.animations}
          onChange={(value: AnimationLevel) => update({ animations: value })}
          label="Animations"
          labelledBy="motion-label"
        />
        <p className={styles.hint}>
          {settings.animations === 'full'
            ? 'Particles, glows and transitions at full strength.'
            : settings.animations === 'reduced'
              ? 'Short fades only: no moving particles, no flashes.'
              : 'Every animation is off, including the background particles.'}
          {settings.animations === 'full' && motion === 'reduced'
            ? ' Your system asks for reduced motion, so animations stay reduced.'
            : ''}
        </p>
      </div>
    </SettingsSection>
  )
}

// ------------------------------------------------------------------------------------ camera
const CAMERA_STATES: Record<Exclude<CameraStatus, 'active'>, { title: string; icon: ReactNode }> = {
  idle: { title: 'Camera is off', icon: <CameraOff /> },
  requesting: { title: 'Waiting for the camera…', icon: <LoaderCircle className={styles.spin} /> },
  denied: { title: 'Camera access blocked', icon: <ShieldAlert /> },
  unavailable: { title: 'No camera found', icon: <CameraOff /> },
  insecure: { title: 'Secure page needed', icon: <ShieldAlert /> },
  error: { title: 'The camera stopped', icon: <ShieldAlert /> },
}

function CameraSettings() {
  const { settings, update } = useSettings()
  const camera = useCamera()
  const videoRef = useRef<HTMLVideoElement>(null)
  const { status, stream, error, devices, activeDeviceId, start, stop } = camera

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    if (stream) void video.play().catch(() => {})
  }, [stream])

  // the list only has real ids once the browser allows the camera (privacy); keep the saved one visible
  const known = devices.filter((d) => d.deviceId)
  const options = [
    { value: '', label: 'Browser default' },
    ...known.map((d) => ({ value: d.deviceId, label: d.label })),
    ...(settings.cameraId && !known.some((d) => d.deviceId === settings.cameraId)
      ? [{ value: settings.cameraId, label: 'Saved camera (not detected yet)' }]
      : []),
  ]
  const activeLabel = known.find((d) => d.deviceId === activeDeviceId)?.label

  const choose = (value: string) => {
    const id = value || null
    update({ cameraId: id })
    if (status === 'active' || status === 'requesting') void start(id)
  }

  const live = status === 'active'
  const busy = status === 'requesting'
  const failed = status === 'denied' || status === 'unavailable' || status === 'insecure' || status === 'error'
  const state = live ? null : CAMERA_STATES[status]

  return (
    <SettingsSection
      id="camera-title"
      icon={<Webcam />}
      title="Camera"
      kanji="眼"
      description="Choose the webcam for Live Demo and Practice, and check your framing. This preview stays in your browser: nothing is sent to the server from this page."
    >
      <div className={styles.cameraGrid}>
        <div className={styles.cameraControls}>
          <Select
            label="Camera"
            icon={<Camera />}
            value={settings.cameraId ?? ''}
            options={options}
            onChange={choose}
            hint={known.length ? `${known.length} camera${known.length === 1 ? '' : 's'} found.` : 'Camera names appear after you allow access (start the preview once).'}
          />
          <div className={styles.cameraButtons}>
            {live || busy ? (
              <Button variant="secondary" icon={<Square />} onClick={stop}>
                Stop preview
              </Button>
            ) : (
              <Button icon={failed ? <RefreshCw /> : <Play />} onClick={() => void start(settings.cameraId)}>
                {failed ? 'Try again' : 'Start preview'}
              </Button>
            )}
          </div>
          <Switch
            checked={settings.showLandmarks}
            onChange={(checked) => update({ showLandmarks: checked })}
            label="Show hand landmarks on the video"
            description="The AI server draws the tracked hand points on the processed video in Live Demo and Practice."
          />
        </div>

        <div className={[styles.preview, live ? styles.previewLive : '', failed ? styles.previewFailed : ''].filter(Boolean).join(' ')}>
          <video ref={videoRef} className={styles.video} muted playsInline autoPlay aria-label="Camera preview (mirrored)" hidden={!live} />
          {live ? (
            <div className={styles.previewBar}>
              <span className={styles.liveChip}>
                <span className={styles.liveDot} aria-hidden="true" /> Preview
              </span>
              {activeLabel ? <span className={styles.previewLabel}>{activeLabel}</span> : null}
            </div>
          ) : state ? (
            <div className={styles.previewState} role={failed ? 'alert' : 'status'}>
              <span className={styles.previewIcon} aria-hidden="true">
                {state.icon}
              </span>
              <p className={styles.previewTitle}>{state.title}</p>
              <p className={styles.previewText}>
                {status === 'idle'
                  ? 'Start the preview to check the light and that both hands fit in the picture.'
                  : status === 'requesting'
                    ? 'Allow the camera in your browser’s prompt.'
                    : error}
              </p>
            </div>
          ) : null}
          <span className={styles.corner} data-pos="tl" aria-hidden="true" />
          <span className={styles.corner} data-pos="tr" aria-hidden="true" />
          <span className={styles.corner} data-pos="bl" aria-hidden="true" />
          <span className={styles.corner} data-pos="br" aria-hidden="true" />
        </div>
      </div>
    </SettingsSection>
  )
}

// ------------------------------------------------------------------------------------ sound
function SoundSettings() {
  const { settings, update } = useSettings()
  const sound = useSound()
  const [testing, setTesting] = useState(false)
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const off = !settings.audioEnabled

  const test = async () => {
    setTesting(true)
    try {
      await sound.unlock()
      sound.play('ui.step_success')
    } finally {
      setTesting(false)
    }
  }

  return (
    <SettingsSection
      id="sound-title"
      icon={<Music />}
      title="Sound"
      kanji="音"
      description="Sound effects play on the events the AI server reports: each confirmed step, a failed sequence and every jutsu."
    >
      <div className={styles.soundGrid}>
        <div className={styles.switches}>
          <Switch
            checked={settings.audioEnabled}
            onChange={(checked) => update({ audioEnabled: checked })}
            label="Enable audio"
            icon={<Volume2 />}
            description="Off: no sound is loaded or played."
          />
          <Switch
            checked={settings.muted}
            onChange={(checked) => update({ muted: checked })}
            label="Mute"
            icon={<VolumeX />}
            description="Silence everything for now, keeping your volumes."
            disabled={off}
          />
        </div>
        <div className={styles.sliders}>
          <Slider
            label="Master volume"
            value={settings.masterVolume}
            onChange={(v) => update({ masterVolume: v })}
            format={pct}
            disabled={off}
          />
          <Slider
            label="Sound effects"
            value={settings.sfxVolume}
            onChange={(v) => update({ sfxVolume: v })}
            format={pct}
            disabled={off}
          />
          <div className={styles.testRow}>
            <Button variant="secondary" icon={<Play />} onClick={() => void test()} loading={testing} disabled={off}>
              Test sound
            </Button>
            <p className={styles.hint} aria-live="polite">
              {off ? 'Audio is disabled.' : settings.muted ? 'Muted: unmute to hear the test.' : 'Plays the “step success” sound.'}
            </p>
          </div>
        </div>
      </div>
    </SettingsSection>
  )
}

// ------------------------------------------------------------------------------------ reset
function ResetSettings() {
  const { reset } = useSettings()
  const { setTheme } = useTheme()
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)

  return (
    <SettingsSection
      id="reset-title"
      icon={<RotateCcw />}
      title="Reset"
      kanji="戻"
      description="Settings are saved in this browser only. Reset puts every setting and the theme back to the defaults."
    >
      <div className={styles.reset} aria-live="polite">
        {confirming ? (
          <div className={styles.confirm} role="group" aria-label="Confirm reset">
            <p className={styles.confirmText}>Reset all settings and the theme to the defaults?</p>
            <div className={styles.confirmButtons}>
              <Button
                variant="danger"
                icon={<RotateCcw />}
                onClick={() => {
                  reset()
                  setTheme('naruto')
                  setConfirming(false)
                  setDone(true)
                }}
                autoFocus
              >
                Yes, reset
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button
              variant="danger"
              icon={<RotateCcw />}
              onClick={() => {
                setDone(false)
                setConfirming(true)
              }}
            >
              Reset settings
            </Button>
            {done ? (
              <p className={styles.done}>
                <Check aria-hidden="true" /> Settings restored to the defaults.
              </p>
            ) : null}
          </>
        )}
      </div>
    </SettingsSection>
  )
}

export function SettingsPage() {
  useDocumentTitle('Settings')
  return (
    <div className={styles.page}>
      <Reveal immediate>
        <SectionHeading
          as="h1"
          eyebrow="Your dojo"
          title="Settings"
          kanji="器"
          description="Tune the look, your camera and the sound. Changes apply right away and stay saved in this browser."
        />
      </Reveal>
      <div className={styles.sections}>
        <Appearance />
        <CameraSettings />
        <SoundSettings />
        <ResetSettings />
      </div>
    </div>
  )
}

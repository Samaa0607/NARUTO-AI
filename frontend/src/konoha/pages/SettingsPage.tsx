// Settings in the light Konoha look: camera (with a local, mirrored preview), sound, background
// music, experience and reset. Everything is saved in this browser (SettingsContext, localStorage).
import {
  Camera,
  CameraOff,
  Check,
  Eye,
  Hand,
  Lightbulb,
  LoaderCircle,
  Music,
  Pause,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Square,
  SunMedium,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useVoiceManifest } from '../../audio/useVoiceManifest'
import { VOICE_JUTSU, VOICE_PARTS } from '../../audio/voices'
import { useDocumentTitle } from '../../components/layout/useDocumentTitle'
import { useSettings, type AnimationLevel } from '../../contexts/SettingsContext'
import { useSound } from '../../contexts/SoundContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useCamera, type CameraStatus } from '../../hooks/useCamera'
import { BrushButton } from '../BrushButton'
import { MUSIC_CONTROL_ATTR, useMusic } from '../music/MusicContext'
import { ParchmentCard } from '../ParchmentCard'
import { SelectField, Segmented, SettingRow, SliderRow, SwitchRow, type SegmentOption } from '../settings/controls'
import styles from '../settings/SettingsPage.module.css'

// ------------------------------------------------------------------------------------ camera
const CAMERA_STATES: Record<Exclude<CameraStatus, 'active'>, { title: string; icon: ReactNode }> = {
  idle: { title: 'Camera is off', icon: <CameraOff /> },
  requesting: { title: 'Waiting for the camera…', icon: <LoaderCircle className={styles.spin} /> },
  denied: { title: 'Camera access blocked', icon: <ShieldAlert /> },
  unavailable: { title: 'No camera found', icon: <CameraOff /> },
  insecure: { title: 'Secure page needed', icon: <ShieldAlert /> },
  error: { title: 'The camera stopped', icon: <ShieldAlert /> },
}

function CameraSection() {
  const { settings, update } = useSettings()
  const { status, stream, error, devices, activeDeviceId, start, stop } = useCamera()
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    if (stream) void video.play().catch(() => {})
  }, [stream])

  // real ids and names only appear once the browser allows the camera; keep the saved one visible
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
    <ParchmentCard title="Camera" icon={<Camera />} aria-label="Camera settings">
      <div className={styles.cameraGrid}>
        <div className={styles.stack}>
          <p className={styles.lead}>
            Choose the webcam for Live and Practice, and check your framing. This preview stays in your browser.
          </p>
          <SelectField
            label="Camera"
            icon={<Camera />}
            value={settings.cameraId ?? ''}
            options={options}
            onChange={choose}
            hint={
              known.length
                ? `${known.length} camera${known.length === 1 ? '' : 's'} found.`
                : 'Camera names appear after you allow access (start the preview once).'
            }
          />
          <ul className={styles.tips} aria-label="Framing tips">
            <li className={styles.tip}>
              <SunMedium aria-hidden="true" /> Face a window or a lamp: even light on your hands.
            </li>
            <li className={styles.tip}>
              <Hand aria-hidden="true" /> Keep both hands in the picture, about an arm’s length away.
            </li>
            <li className={styles.tip}>
              <Lightbulb aria-hidden="true" /> A plain background helps the AI see each sign.
            </li>
          </ul>
          <div className={styles.buttons}>
            {live || busy ? (
              <BrushButton variant="secondary" icon={<Square />} onClick={stop}>
                Stop preview
              </BrushButton>
            ) : (
              <BrushButton icon={failed ? <RefreshCw /> : <Play />} onClick={() => void start(settings.cameraId)}>
                {failed ? 'Try again' : 'Start preview'}
              </BrushButton>
            )}
          </div>
        </div>

        <div className={[styles.preview, live ? styles.previewLive : ''].filter(Boolean).join(' ')}>
          <video
            ref={videoRef}
            className={styles.video}
            muted
            playsInline
            autoPlay
            aria-label="Camera preview (mirrored)"
            hidden={!live}
          />
          {live ? (
            <div className={styles.previewBar}>
              <span className={styles.liveChip}>
                <span className={styles.liveDot} aria-hidden="true" /> Preview
              </span>
              {activeLabel ? <span className={styles.previewLabel}>{activeLabel}</span> : null}
            </div>
          ) : state ? (
            <div className={styles.previewState} role={failed ? 'alert' : 'status'}>
              <span className={[styles.previewIcon, failed ? styles.previewIconBad : ''].filter(Boolean).join(' ')} aria-hidden="true">
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
        </div>
      </div>
    </ParchmentCard>
  )
}

// ------------------------------------------------------------------------------------ sound
function SoundSection() {
  const { settings, update } = useSettings()
  const sound = useSound()
  const voices = useVoiceManifest()
  const [testing, setTesting] = useState(false)
  const off = !settings.audioEnabled
  const voiceSlots = VOICE_JUTSU.length * VOICE_PARTS.length
  const voiceHint =
    voices === null
      ? 'Checking for voice clips…'
      : voices.size === 0
        ? `No licensed Naruto / Sasuke voice clips installed yet (${voiceSlots} slots, see assets/audio/voice/README.md). Nothing plays in their place.`
        : `${voices.size} of ${voiceSlots} voice clips installed. Music and effects get quieter while a voice speaks.`

  const test = async () => {
    setTesting(true)
    try {
      await sound.unlock()
      sound.play('ui.hand_seal') // the hand-seal sound of a real step (about -14 dBFS)
    } finally {
      setTesting(false)
    }
  }

  return (
    <ParchmentCard title="Sound" icon={<Volume2 />} aria-label="Sound settings" className={styles.orderSound}>
      <div className={styles.stack}>
        <p className={styles.lead}>
          Sound effects play on each confirmed hand sign, a missed sequence and every jutsu. Character voices
          play only when a complete sequence fires its jutsu.
        </p>
        <SwitchRow
          icon={<Volume2 />}
          label="Enable sounds"
          description="Off: no sound effect or music is loaded or played."
          checked={settings.audioEnabled}
          onChange={(checked) => update({ audioEnabled: checked })}
        />
        <SwitchRow
          icon={<VolumeX />}
          label="Mute"
          description="Silence everything for now and keep your volumes."
          checked={settings.muted}
          onChange={(checked) => update({ muted: checked })}
          disabled={off}
        />
        <SliderRow label="Master volume" value={settings.masterVolume} onChange={(v) => update({ masterVolume: v })} disabled={off} />
        <SliderRow label="Sound effects" value={settings.sfxVolume} onChange={(v) => update({ sfxVolume: v })} disabled={off} />
        <SliderRow
          label="Character voices"
          value={settings.voiceVolume}
          onChange={(v) => update({ voiceVolume: v })}
          disabled={off}
          hint={voiceHint}
        />
        <div className={styles.testRow}>
          <BrushButton variant="secondary" icon={<Play />} onClick={() => void test()} disabled={off || testing}>
            Test sound
          </BrushButton>
          <p className={styles.note} aria-live="polite">
            {off ? 'Sounds are disabled.' : settings.muted ? 'Muted: unmute to hear the test.' : 'Plays the hand-sign sound.'}
          </p>
        </div>
      </div>
    </ParchmentCard>
  )
}

// ------------------------------------------------------------------------------------ music
function MusicSection() {
  const { settings, update } = useSettings()
  const music = useMusic()
  const status = !music.available
    ? 'Turn on “Enable sounds” to play music.'
    : settings.muted && music.on
      ? 'Muted: unmute to hear the music.'
      : music.playing
        ? 'Playing softly. It keeps playing on every page.'
        : music.on
          ? 'Starts with your next click or key press.'
          : 'Paused. Your choice is remembered for your next visit.'

  return (
    <ParchmentCard title="Music" icon={<Music />} aria-label="Music settings" className={styles.orderMusic}>
      <div className={styles.stack}>
        <p className={styles.lead}>
          A soft, original instrumental loop (koto, bamboo flute and taiko) that sets a calm ninja-village mood.
        </p>
        <div className={styles.musicRow} {...{ [MUSIC_CONTROL_ATTR]: '' }}>
          <BrushButton
            variant={music.on ? 'secondary' : 'primary'}
            icon={music.on ? <Pause /> : <Play />}
            onClick={music.toggle}
            disabled={!music.available}
          >
            {music.on ? 'Pause music' : 'Play music'}
          </BrushButton>
          <p className={[styles.status, music.playing ? styles.statusOn : ''].filter(Boolean).join(' ')} aria-live="polite">
            {music.playing ? <span className={styles.statusDot} aria-hidden="true" /> : null}
            {status}
          </p>
        </div>
        <SliderRow
          label="Music volume"
          value={music.volume}
          onChange={music.setVolume}
          disabled={!music.available}
          hint="For the background loop and the jutsu music. Kept low by default so the hand seals, effects and voices stay clear."
        />
        <SwitchRow
          icon={<Music />}
          label="Jutsu music"
          description="Each jutsu has its own music while you make its hand signs. It fades out when the jutsu fires or the sequence is dropped."
          checked={settings.jutsuMusic}
          onChange={(checked) => update({ jutsuMusic: checked })}
          disabled={!music.available}
        />
        <p className={styles.credit}>
          “Leaf Trail”, composed for SHINOBI AI. Jutsu music: “Blackmoor Ninjas” by Matthew Pablo, “Taiko drums” by
          jobro / congusbongus (CC BY 3.0), “Revenge” and “Samurai” by TAD (CC BY 4.0). These are not the Naruto
          soundtrack: no anime music is used.
        </p>
      </div>
    </ParchmentCard>
  )
}

// ------------------------------------------------------------------------------------ experience
const MOTION_OPTIONS: readonly SegmentOption<AnimationLevel>[] = [
  { value: 'full', label: 'Full', icon: <Sparkles /> },
  { value: 'reduced', label: 'Reduced', icon: <Eye /> },
  { value: 'off', label: 'Off', icon: <Power /> },
]

function ExperienceSection() {
  const { settings, update, motion } = useSettings()
  return (
    <ParchmentCard title="Experience" icon={<Sparkles />} aria-label="Experience settings" className={styles.orderExperience}>
      <div className={styles.stack}>
        <Segmented label="Animations" options={MOTION_OPTIONS} value={settings.animations} onChange={(value) => update({ animations: value })} />
        <p className={styles.note}>
          {settings.animations === 'full'
            ? 'Falling leaves, glows and transitions at full strength.'
            : settings.animations === 'reduced'
              ? 'Short fades only: no moving leaves, no flashes.'
              : 'Every animation is off.'}
          {settings.animations === 'full' && motion === 'reduced' ? ' Your system asks for reduced motion, so animations stay reduced.' : ''}
        </p>
        <SwitchRow
          icon={<Hand />}
          label="Show hand landmarks"
          description="The AI draws the tracked hand points on the video in Live and Practice."
          checked={settings.showLandmarks}
          onChange={(checked) => update({ showLandmarks: checked })}
        />
      </div>
    </ParchmentCard>
  )
}

// ------------------------------------------------------------------------------------ reset
function ResetSection() {
  const { reset } = useSettings()
  const { setTheme } = useTheme()
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)

  return (
    <ParchmentCard title="Reset" icon={<RotateCcw />} aria-label="Reset settings" className={styles.orderReset}>
      <div className={styles.stack} aria-live="polite">
        <p className={styles.lead}>Settings are saved in this browser only. Reset puts every setting back to its default.</p>
        {confirming ? (
          <div className={styles.confirm} role="group" aria-label="Confirm reset">
            <SettingRow icon={<RotateCcw />} label="Reset all settings?" description="Camera, sound, music and animations go back to the defaults." />
            <div className={styles.buttons}>
              <BrushButton
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
              </BrushButton>
              <BrushButton variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </BrushButton>
            </div>
          </div>
        ) : (
          <div className={styles.buttons}>
            <BrushButton
              variant="secondary"
              icon={<RotateCcw />}
              onClick={() => {
                setDone(false)
                setConfirming(true)
              }}
            >
              Reset settings
            </BrushButton>
            {done ? (
              <p className={styles.done}>
                <Check aria-hidden="true" /> Settings restored to the defaults.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </ParchmentCard>
  )
}

export function KonohaSettingsPage() {
  useDocumentTitle('Settings')
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>Your camera, sound and music. Changes apply right away and stay saved in this browser.</p>
      </header>
      <div className={styles.grid}>
        <CameraSection />
        <div className={styles.columns}>
          <div className={styles.column}>
            <SoundSection />
            <ResetSection />
          </div>
          <div className={styles.column}>
            <MusicSection />
            <ExperienceSection />
          </div>
        </div>
      </div>
    </div>
  )
}

// User preferences, kept in localStorage (no database).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadJSON, saveJSON } from '../lib/storage'

export type AnimationLevel = 'full' | 'reduced' | 'off'

export interface Settings {
  /** 0..1 */
  masterVolume: number
  /** 0..1, multiplied with masterVolume for sound effects */
  sfxVolume: number
  /** 0..1, multiplied with masterVolume for the character voice clips (when installed) */
  voiceVolume: number
  muted: boolean
  /** false = never load or play any sound */
  audioEnabled: boolean
  /** MediaDeviceInfo.deviceId of the chosen camera, null = browser default */
  cameraId: string | null
  animations: AnimationLevel
  /** ask the server to draw the MediaPipe hand landmarks on the returned frames */
  showLandmarks: boolean
  /** background music wanted (it only starts after the user's first click or key press) */
  musicOn: boolean
  /** 0..1, background music volume (multiplied with masterVolume); also the jutsu sequence music */
  musicVolume: number
  /** a jutsu's own music while its hand signs are being made (on the Music volume) */
  jutsuMusic: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  sfxVolume: 0.9,
  voiceVolume: 1,
  muted: false,
  audioEnabled: true,
  cameraId: null,
  animations: 'full',
  showLandmarks: false,
  musicOn: false,
  musicVolume: 0.3,
  jutsuMusic: true,
}

const KEY = 'shinobi.settings'

interface SettingsContextValue {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  reset: () => void
  /** animations after applying the OS "reduce motion" preference */
  motion: AnimationLevel
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

const clamp01 = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback

function sanitize(raw: Partial<Settings> | null): Settings {
  const s = raw ?? {}
  return {
    masterVolume: clamp01(s.masterVolume, DEFAULT_SETTINGS.masterVolume),
    sfxVolume: clamp01(s.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
    voiceVolume: clamp01(s.voiceVolume, DEFAULT_SETTINGS.voiceVolume),
    muted: typeof s.muted === 'boolean' ? s.muted : DEFAULT_SETTINGS.muted,
    audioEnabled: typeof s.audioEnabled === 'boolean' ? s.audioEnabled : DEFAULT_SETTINGS.audioEnabled,
    cameraId: typeof s.cameraId === 'string' && s.cameraId ? s.cameraId : null,
    animations: s.animations === 'reduced' || s.animations === 'off' ? s.animations : 'full',
    showLandmarks: typeof s.showLandmarks === 'boolean' ? s.showLandmarks : DEFAULT_SETTINGS.showLandmarks,
    musicOn: typeof s.musicOn === 'boolean' ? s.musicOn : DEFAULT_SETTINGS.musicOn,
    musicVolume: clamp01(s.musicVolume, DEFAULT_SETTINGS.musicVolume),
    jutsuMusic: typeof s.jutsuMusic === 'boolean' ? s.jutsuMusic : DEFAULT_SETTINGS.jutsuMusic,
  }
}

function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const media = window.matchMedia?.(query)
    if (!media) return
    const onChange = () => setReduced(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => sanitize(loadJSON<Partial<Settings>>(KEY)))
  const osReduced = usePrefersReducedMotion()
  const motion: AnimationLevel = settings.animations === 'full' && osReduced ? 'reduced' : settings.animations

  useEffect(() => saveJSON(KEY, settings), [settings])
  useEffect(() => {
    document.documentElement.dataset.motion = motion
  }, [motion])

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => sanitize({ ...s, ...patch })), [])
  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), [])
  const value = useMemo(() => ({ settings, update, reset, motion }), [settings, update, reset, motion])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>')
  return value
}

// Sound playback for the whole app, on the Web Audio engine of src/audio/engine.ts.
// The SoundApi below is the stable API pages use. Jutsu sounds are driven by backend events only
// (src/audio/eventCues.ts via src/audio/useSessionSounds.ts).
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { CueId } from '../audio/cues'
import { SoundEngine } from '../audio/engine'
import { musicOutputVolume, outputVolume, voiceOutputVolume } from '../audio/gains'
import { useSettings } from './SettingsContext'
import { useTheme } from './ThemeContext'

export interface PlayOptions {
  /** extra gain for this playback, 0..1 (multiplied with the user's volumes) */
  volume?: number
}

export interface SoundApi {
  /** true once the browser allows audio (after a user gesture) and sounds are enabled */
  ready: boolean
  /** call from a click/tap handler: browsers block audio until the user interacts */
  unlock: () => Promise<void>
  play: (cue: CueId, options?: PlayOptions) => void
  startLoop: (cue: CueId, options?: PlayOptions) => void
  /** stops every voice of this cue (loops and still-playing one-shots) with a fade */
  stopLoop: (cue: CueId, fadeMs?: number) => void
  stopAll: () => void
}

const silent: SoundApi = {
  ready: false,
  unlock: async () => {},
  play: () => {},
  startLoop: () => {},
  stopLoop: () => {},
  stopAll: () => {},
}

const SoundContext = createContext<SoundApi>(silent)
const EngineContext = createContext<SoundEngine | null>(null)

export function SoundProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings()
  const { theme } = useTheme()
  const [engine] = useState(() => new SoundEngine())
  const ready = useSyncExternalStore(engine.subscribe, engine.isReady, () => false)

  const volume = outputVolume(settings)
  useEffect(() => engine.setVolume(volume), [engine, volume])
  const voiceVolume = voiceOutputVolume(settings)
  useEffect(() => engine.setVoiceVolume(voiceVolume), [engine, voiceVolume])
  // the jutsu sequence music: on the Music volume, and only when wanted (Settings > Music)
  const musicVolume = musicOutputVolume(settings)
  useEffect(() => engine.setMusicVolume(musicVolume), [engine, musicVolume])
  useEffect(() => engine.music.setEnabled(settings.jutsuMusic), [engine, settings.jutsuMusic])
  useEffect(() => engine.setEnabled(settings.audioEnabled), [engine, settings.audioEnabled])

  // The first interaction anywhere unlocks audio (pages also call unlock() from their buttons).
  useEffect(() => {
    if (!settings.audioEnabled) return
    const onGesture = () => void engine.unlock()
    const opts = { capture: true, passive: true } as const
    window.addEventListener('pointerdown', onGesture, opts)
    window.addEventListener('keydown', onGesture, opts)
    return () => {
      window.removeEventListener('pointerdown', onGesture, opts)
      window.removeEventListener('keydown', onGesture, opts)
    }
  }, [engine, settings.audioEnabled])

  // Naruto <-> Sasuke switch: a short UI sound (not on the first render).
  const lastTheme = useRef(theme)
  useEffect(() => {
    if (lastTheme.current === theme) return
    lastTheme.current = theme
    void engine.unlock().then(() => engine.play('ui.mode_switch'))
  }, [engine, theme])

  useEffect(() => () => engine.dispose(), [engine])

  const api = useMemo<SoundApi>(
    () => ({
      ready,
      unlock: () => engine.unlock(),
      play: (cue, options) => engine.play(cue, options),
      startLoop: (cue, options) => engine.startLoop(cue, { volume: options?.volume, fadeInMs: 200 }),
      stopLoop: (cue, fadeMs = 300) => engine.stop(cue, fadeMs),
      stopAll: () => engine.stopAll(),
    }),
    [engine, ready],
  )
  return (
    <EngineContext.Provider value={engine}>
      <SoundContext.Provider value={api}>{children}</SoundContext.Provider>
    </EngineContext.Provider>
  )
}

export function useSound(): SoundApi {
  return useContext(SoundContext)
}

/** The engine itself (scheduled commands from src/audio/eventCues.ts). Null outside <SoundProvider>. */
export function useSoundEngine(): SoundEngine | null {
  return useContext(EngineContext)
}

// Soft background music for the whole app (an original loop, see assets/audio/SOURCES.md).
// The choice (on / off and volume) is saved with the other settings. Nothing plays before the user
// interacts with the page: if the music was on last time, it starts again with the first click or
// key press of the visit. It pauses while sounds are disabled or muted, and while the tab is hidden,
// gets quieter while a character voice speaks (sound engine, src/audio/engine.ts) and gives way,
// fading out, while a jutsu's own sequence music plays (src/audio/jutsuMusic.ts), then comes back.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { VOICE_DUCK_MUSIC } from '../../audio/gains'
import { useSettings } from '../../contexts/SettingsContext'
import { useSoundEngine } from '../../contexts/SoundContext'
import { MUSIC_SRC, MusicPlayer } from './player'

export interface MusicApi {
  /** the saved choice: music wanted */
  on: boolean
  /** the music plays right now */
  playing: boolean
  /** sounds are enabled in Settings (the music needs them) */
  available: boolean
  /** on, but waiting for the first click or key press of this visit (browsers block sound before) */
  waiting: boolean
  /** 0..1, the music's own volume (multiplied with the master volume) */
  volume: number
  /** call from a click handler */
  toggle: () => void
  setOn: (on: boolean) => void
  setVolume: (volume: number) => void
}

const MusicContext = createContext<MusicApi | null>(null)

/** time constants (s) of the ambient loop giving way to a jutsu's music, and coming back after it */
const JUTSU_MUSIC_DUCK_S = 0.35
const JUTSU_MUSIC_BACK_S = 0.8

/** marks the music buttons: the first-gesture start skips them (they decide by themselves) */
export const MUSIC_CONTROL_ATTR = 'data-music-control'

function hasBeenActive(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
  return activation?.hasBeenActive ?? false
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const { settings, update } = useSettings()
  const [player] = useState(() => new MusicPlayer(MUSIC_SRC))
  const playing = useSyncExternalStore(player.subscribe, player.isPlaying, () => false)
  const [interacted, setInteracted] = useState(hasBeenActive)
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden')

  const level = Math.min(1, Math.max(0, settings.musicVolume * settings.masterVolume))
  const allowed = settings.musicOn && settings.audioEnabled && !settings.muted && level > 0 && !hidden
  const want = allowed && interacted

  // latest values for the event handlers below
  const latest = useRef({ allowed, level })
  useEffect(() => {
    latest.current = { allowed, level }
  }, [allowed, level])

  // the file is only downloaded when the music is wanted
  useEffect(() => {
    if (settings.musicOn && settings.audioEnabled) player.preload()
  }, [player, settings.musicOn, settings.audioEnabled])

  // start / follow the volume / fade out
  useEffect(() => {
    if (want) void player.play(level)
    else player.pause()
  }, [player, want, level])

  // the first click or key press of the visit (and later ones while a start was blocked)
  useEffect(() => {
    if (interacted && (playing || !allowed)) return
    const onGesture = (event: Event) => {
      if (event instanceof KeyboardEvent && (event.key === 'Escape' || event.key === 'Tab' || event.repeat)) return
      setInteracted(true)
      const target = event.target
      if (target instanceof Element && target.closest(`[${MUSIC_CONTROL_ATTR}]`)) return
      // called inside the gesture itself: the strictest browsers (Safari) need that
      if (latest.current.allowed) void player.play(latest.current.level)
    }
    const opts = { capture: true, passive: true } as const
    window.addEventListener('pointerdown', onGesture, opts)
    window.addEventListener('keydown', onGesture, opts)
    return () => {
      window.removeEventListener('pointerdown', onGesture, opts)
      window.removeEventListener('keydown', onGesture, opts)
    }
  }, [player, interacted, playing, allowed])

  // silent while a jutsu's own music plays (slow fades, no jump), quieter under a character voice
  const engine = useSoundEngine()
  useEffect(() => {
    if (!engine) return
    const follow = () => {
      if (engine.music.isPlaying()) player.setDuck(0, JUTSU_MUSIC_DUCK_S)
      else player.setDuck(engine.isSpeaking() ? VOICE_DUCK_MUSIC : 1, engine.isSpeaking() ? undefined : JUTSU_MUSIC_BACK_S)
    }
    follow()
    const unsubscribeSpeech = engine.subscribeSpeech(follow)
    const unsubscribeMusic = engine.music.subscribe(follow)
    return () => {
      unsubscribeSpeech()
      unsubscribeMusic()
      player.setDuck(1)
    }
  }, [engine, player])

  // no music in a background tab
  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => () => player.dispose(), [player])

  const setOn = useCallback(
    (on: boolean) => {
      update({ musicOn: on })
      setInteracted(true)
      // start inside the click (allowed everywhere); the effect above keeps it in sync afterwards
      if (on && latest.current.level > 0 && settings.audioEnabled && !settings.muted) void player.play(latest.current.level)
      else if (!on) player.pause()
    },
    [player, update, settings.audioEnabled, settings.muted],
  )

  const toggle = useCallback(() => setOn(!settings.musicOn), [setOn, settings.musicOn])
  const setVolume = useCallback((volume: number) => update({ musicVolume: volume }), [update])

  const value = useMemo<MusicApi>(
    () => ({
      on: settings.musicOn,
      playing,
      available: settings.audioEnabled,
      waiting: settings.musicOn && settings.audioEnabled && !settings.muted && !interacted,
      volume: settings.musicVolume,
      toggle,
      setOn,
      setVolume,
    }),
    [settings.musicOn, settings.audioEnabled, settings.muted, settings.musicVolume, playing, interacted, toggle, setOn, setVolume],
  )
  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>
}

export function useMusic(): MusicApi {
  const value = useContext(MusicContext)
  if (!value) throw new Error('useMusic must be used inside <MusicProvider>')
  return value
}

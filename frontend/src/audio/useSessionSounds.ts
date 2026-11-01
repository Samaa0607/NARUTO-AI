// Plays the jutsu sounds of a live session: every processed frame's events go through the pure
// mappings of eventCues.ts (sound effects), voiceCues.ts (character voices, only on a `jutsu`
// event) and jutsuMusic.ts (the jutsu's own music while its signs are made), and the resulting
// commands are run on the shared Web Audio engine.
// Disconnecting, the camera stopping (no frame for a while) or leaving the page stops everything:
// no sound without the backend.
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useSoundEngine } from '../contexts/SoundContext'
import type { ShinobiSession } from '../hooks/useShinobiSession'
import { INITIAL_CUE_STATE, soundsForFrame, type CueState } from './eventCues'
import { INITIAL_MUSIC_STATE, musicForFrame, STOP_FADE_MS, type MusicState } from './jutsuMusic'
import { INITIAL_VOICE_STATE, VOICE_STOP_FADE_MS, voiceForFrame, type VoiceState } from './voiceCues'
import type { VoiceClipId } from './voices'

/** no processed frame for this long (camera stopped, socket stalled): the jutsu music fades out */
const FRAME_GAP_STOP_MS = 2000

export interface SessionSounds {
  /** stop the character voice now (Retry): the next jutsu plays its own */
  stopVoice: () => void
}

export function useSessionSounds(session: Pick<ShinobiSession, 'subscribe' | 'connected'>): SessionSounds {
  const engine = useSoundEngine()
  const state = useRef<CueState>(INITIAL_CUE_STATE)
  const voice = useRef<VoiceState>(INITIAL_VOICE_STATE)
  const music = useRef<MusicState>(INITIAL_MUSIC_STATE)
  const lastFrameAt = useRef(0)
  const prefetched = useRef(false)
  const noted = useRef(new Set<VoiceClipId>())
  const { subscribe, connected } = session

  useEffect(() => {
    if (!engine) return
    const unsubscribe = subscribe((frame) => {
      const now = performance.now()
      lastFrameAt.current = now
      if (!prefetched.current) {
        prefetched.current = true
        engine.music.prefetch() // a live session: the jutsu tracks may be needed any moment
      }
      // the voice first: it ducks the sound effects before this frame's activation cues start
      const spoken = voiceForFrame(voice.current, frame, engine.voiceDuration, now)
      voice.current = spoken.state
      for (const c of spoken.commands) {
        if (c.kind === 'play') engine.playVoice(c.plan)
        else engine.stopVoice(c.fadeMs)
      }
      for (const id of spoken.missing) {
        if (noted.current.has(id)) continue
        noted.current.add(id)
        if (import.meta.env.DEV) console.info(`[shinobi] no voice clip for ${id} (assets/audio/voice/README.md): skipped`)
      }
      const result = soundsForFrame(state.current, frame, now)
      state.current = result.state
      if (result.commands.length > 0) engine.run(result.commands)
      const planned = musicForFrame(music.current, frame)
      music.current = planned.state
      if (planned.commands.length > 0) engine.music.run(planned.commands)
    })
    // the camera stopped (or the frames stalled): the music must not go on by itself
    const watchdog = window.setInterval(() => {
      if (music.current.track && performance.now() - lastFrameAt.current > FRAME_GAP_STOP_MS) {
        engine.music.stop(STOP_FADE_MS)
        music.current = INITIAL_MUSIC_STATE
      }
    }, 500)
    return () => {
      unsubscribe()
      window.clearInterval(watchdog)
      state.current = INITIAL_CUE_STATE
      voice.current = INITIAL_VOICE_STATE
      music.current = INITIAL_MUSIC_STATE
      prefetched.current = false
      engine.stopAll(200)
      engine.music.stop(STOP_FADE_MS)
    }
  }, [engine, subscribe])

  useEffect(() => {
    if (connected || !engine) return
    state.current = INITIAL_CUE_STATE
    voice.current = INITIAL_VOICE_STATE
    music.current = INITIAL_MUSIC_STATE
    engine.stopAll(200)
    engine.music.stop(STOP_FADE_MS)
  }, [connected, engine])

  const stopVoice = useCallback(() => engine?.stopVoice(VOICE_STOP_FADE_MS), [engine])
  return useMemo(() => ({ stopVoice }), [stopVoice])
}

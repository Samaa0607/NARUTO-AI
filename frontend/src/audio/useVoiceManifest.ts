// Which character voice clips the backend has installed (GET /api/voices), for the Settings page.
import { useEffect, useState } from 'react'
import { fetchVoiceManifest, type VoiceManifest } from './voices'

/** null while loading */
export function useVoiceManifest(): VoiceManifest | null {
  const [manifest, setManifest] = useState<VoiceManifest | null>(null)
  useEffect(() => {
    let alive = true
    void fetchVoiceManifest().then((m) => {
      if (alive) setManifest(m)
    })
    return () => {
      alive = false
    }
  }, [])
  return manifest
}

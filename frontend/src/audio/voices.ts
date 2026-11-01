// Character voice clips (Naruto / Sasuke). None are bundled: SHINOBI AI only plays licensed recordings
// the user adds to assets/audio/voice/<jutsu>/ (activation.* and name.*, see the README there). The
// backend lists what is installed (GET /api/voices). A missing clip is skipped, never replaced by
// another sound.
import type { JutsuId } from '../types/protocol'

export type VoicePart = 'activation' | 'name'
/** activation first (hand-sign / activation call), then the technique name */
export const VOICE_PARTS: readonly VoicePart[] = ['activation', 'name']
export type VoiceClipId = `${JutsuId}.${VoicePart}`

export const VOICE_JUTSU: readonly JutsuId[] = ['fire_style', 'chidori', 'shadow_clone', 'rasengan']

export const VOICE_SPEAKER: Record<JutsuId, 'Naruto' | 'Sasuke'> = {
  fire_style: 'Naruto',
  chidori: 'Sasuke',
  shadow_clone: 'Naruto',
  rasengan: 'Naruto',
}

/** clip id -> URL of the installed file (only the installed ones) */
export type VoiceManifest = ReadonlyMap<VoiceClipId, string>

export const VOICES_URL = '/api/voices'

export const voiceClipId = (jutsu: JutsuId, part: VoicePart): VoiceClipId => `${jutsu}.${part}`

/** The installed clips from the /api/voices body; anything unexpected is ignored. */
export function parseVoiceManifest(body: unknown): VoiceManifest {
  const manifest = new Map<VoiceClipId, string>()
  const voices = (body as { voices?: unknown } | null)?.voices
  if (!voices || typeof voices !== 'object') return manifest
  for (const jutsu of VOICE_JUTSU) {
    const entry = (voices as Record<string, unknown>)[jutsu]
    if (!entry || typeof entry !== 'object') continue
    for (const part of VOICE_PARTS) {
      const url = (entry as Record<string, unknown>)[part]
      // only files the backend serves from the voice folder
      if (typeof url === 'string' && url.startsWith(`/audio/voice/${jutsu}/`)) manifest.set(voiceClipId(jutsu, part), url)
    }
  }
  return manifest
}

/** GET /api/voices. An older server without the endpoint, or no network: no voices. */
export async function fetchVoiceManifest(fetchImpl: typeof fetch = (input, init) => fetch(input, init)): Promise<VoiceManifest> {
  try {
    const response = await fetchImpl(VOICES_URL)
    if (!response.ok) return new Map()
    return parseVoiceManifest(await response.json())
  } catch {
    return new Map()
  }
}

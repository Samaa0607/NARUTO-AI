// Texts and small derivations shared by the live components. Everything here only formats what the
// backend sent (FrameState, events, catalog, server info): nothing is guessed.
import type { SocketStatus } from '../../services/socket'
import type { Catalog, JutsuInfo, SignInfo } from '../../types/catalog'
import type {
  FrameState,
  JutsuId,
  SequenceFailedEvent,
  ServerInfo,
  SignId,
  SignSource,
  WrongSignEvent,
} from '../../types/protocol'

export function signName(catalog: Catalog | null, id: SignId | null | undefined): string {
  if (!id) return '—'
  return catalog?.signs[id]?.name ?? id.replace(/_/g, ' ').toUpperCase()
}

export function signInfo(catalog: Catalog | null, id: SignId | null | undefined): SignInfo | undefined {
  return id ? catalog?.signs[id] : undefined
}

export const SOURCE_LABEL: Record<SignSource, string> = {
  yolox: 'Seal detector',
  landmarks: 'Landmark model',
  'landmarks-backup': 'Landmark model (backup)',
  none: '—',
}

/** "Expected HORSE — saw DOG" / "Too slow — sequence reset" */
export function failureTitle(ev: SequenceFailedEvent, catalog: Catalog | null): string {
  if (ev.reason === 'timeout') return 'Too slow — sequence reset'
  return `Expected ${signName(catalog, ev.expected)} — saw ${signName(catalog, ev.got)}`
}

export function failureDetail(ev: SequenceFailedEvent, catalog: Catalog | null): string {
  const jutsu = catalog?.jutsu.find((j) => j.id === ev.jutsu)
  const title = jutsu ? titleCase(jutsu.title) : ev.jutsu
  const total = jutsu?.steps.length ?? 4
  if (ev.reason === 'timeout') {
    return `${title}: the pause before ${signName(catalog, ev.expected)} (step ${ev.step + 1} of ${total}) was too long.`
  }
  return ev.step > 0
    ? `${title}: step ${ev.step + 1} of ${total} needed ${signName(catalog, ev.expected)}. Start again from step 1.`
    : `${title} starts with ${signName(catalog, ev.expected)}.`
}

/** "HORSE not recognized — that looked like DOG" (a wrong sign: nothing is reset) */
export function wrongSignTitle(ev: WrongSignEvent, catalog: Catalog | null): string {
  return `${signName(catalog, ev.expected)} not recognized — that looked like ${signName(catalog, ev.got)}`
}

export function wrongSignDetail(ev: WrongSignEvent, catalog: Catalog | null): string {
  const jutsu = catalog?.jutsu.find((j) => j.id === ev.jutsu)
  const title = jutsu ? titleCase(jutsu.title) : ev.jutsu
  const total = jutsu?.steps.length ?? 4
  const expected = signName(catalog, ev.expected)
  if (ev.step === 0) return `${title} starts with ${expected}. Try it again.`
  const kept = ev.step === 1 ? 'Your completed step is kept' : `Your ${ev.step} completed steps are kept`
  return `${kept}. Try ${expected} again (step ${ev.step + 1} of ${total}).`
}

export function titleCase(text: string): string {
  return text.toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase())
}

/**
 * The jutsu the sequence card follows. It stays on `current` while that jutsu is in progress and no
 * other one has STRICTLY more steps, so a wrong sign that happens to start another jutsu never takes
 * the card (and the progress shown) away from the sequence being performed. Otherwise: the jutsu
 * with the most steps (first in catalog order on a tie), or `current` when nothing is in progress.
 */
export function followFocus(
  current: JutsuId | null,
  progress: FrameState['progress'] | undefined,
  order: readonly JutsuId[],
): JutsuId | null {
  const lead = leadingJutsu(progress, order)
  if (lead === null) return current
  const mine = current ? (progress?.[current] ?? 0) : 0
  return mine > 0 && (progress?.[lead] ?? 0) <= mine ? current : lead
}

/** The card's note when the Live time limit reset a sequence (`sequence_failed`, reason timeout). */
export function timeoutNotice(
  ev: SequenceFailedEvent,
  catalog: Catalog | null,
  maxGap: number,
): { title: string; detail: string } {
  const jutsu = catalog?.jutsu.find((j) => j.id === ev.jutsu)
  const last = jutsu && ev.step > 0 ? signName(catalog, jutsu.steps[ev.step - 1]?.sign) : null
  const first = jutsu ? signName(catalog, jutsu.steps[0]?.sign) : null
  return {
    title: 'Time ran out — sequence reset.',
    detail:
      `${signName(catalog, ev.expected)} was not shown within ${maxGap} s` +
      (last ? ` of ${last}` : '') +
      (first ? `. Start again with ${first}.` : '.'),
  }
}

/** The jutsu with the most steps done (first in catalog order on a tie), or null when none started. */
export function leadingJutsu(progress: FrameState['progress'] | undefined, order: readonly JutsuId[]): JutsuId | null {
  if (!progress) return null
  let best: JutsuId | null = null
  for (const id of order) {
    const n = progress[id] ?? 0
    if (n >= 1 && (best === null || n > (progress[best] ?? 0))) best = id
  }
  return best
}

export interface Availability {
  available: boolean
  /** signs of the sequence this server cannot recognise now */
  missing: SignId[]
  /** why, in plain words (null when available) */
  reason: string | null
}

/** Can this server activate the jutsu now? Uses the live session info when there is one. */
export function jutsuAvailability(jutsu: JutsuInfo, catalog: Catalog | null, info: ServerInfo | null): Availability {
  const recognizable = info ? new Set(info.recognizable) : null
  const missing = recognizable
    ? [...new Set(jutsu.steps.map((s) => s.sign))].filter((sign) => !recognizable.has(sign))
    : jutsu.missing_signs
  const available = info ? info.jutsu_available[jutsu.id] ?? missing.length === 0 : jutsu.available
  if (available && missing.length === 0) return { available: true, missing: [], reason: null }
  const names = missing.map((s) => signName(catalog, s)).join(' and ')
  const byLandmarks = missing.every((s) => catalog?.signs[s]?.recognizer === 'landmarks')
  const landmarkModel = info?.landmark_model ?? false
  let reason: string
  if (missing.length === 0) reason = 'The server reports that this jutsu cannot be recognised right now.'
  else if (byLandmarks && !landmarkModel) {
    reason = `${names} ${missing.length > 1 ? 'are' : 'is'} recognised by the hand-landmark model, which is not trained yet on this server.`
  } else if (info && !info.yolox) reason = `${names}: the seal detector (YOLOX) is not loaded on this server.`
  else reason = `${names} cannot be recognised by this server right now.`
  return { available: false, missing, reason }
}

export interface ConnectionText {
  label: string
  tone: 'success' | 'warning' | 'danger' | 'neutral' | 'accent'
  detail: string | null
}

export function connectionText(status: SocketStatus, now: number = performance.now()): ConnectionText {
  const retryIn = status.retryAt !== null ? Math.max(0, Math.ceil((status.retryAt - now) / 1000)) : null
  const retry = retryIn !== null ? (retryIn > 0 ? ` Retrying in ${retryIn} s.` : ' Retrying…') : ''
  switch (status.state) {
    case 'idle':
      return { label: 'AI idle', tone: 'neutral', detail: 'Start the camera to connect to the AI.' }
    case 'connecting':
      return { label: 'Connecting to AI', tone: 'accent', detail: 'Opening a recognition session on the SHINOBI AI server…' }
    case 'connected':
      return { label: 'AI live', tone: 'success', detail: null }
    case 'reconnecting':
      return { label: 'Reconnecting', tone: 'warning', detail: `${status.message ?? 'Connection lost.'}${retry}` }
    case 'offline':
      return {
        label: 'AI offline',
        tone: 'danger',
        detail: `${status.message ?? 'The SHINOBI AI server cannot be reached.'}${retry}`,
      }
    case 'busy':
      return {
        label: 'Server busy',
        tone: 'warning',
        detail: `${status.message ?? 'All recognition sessions are in use.'} Close another tab or wait.${retry}`,
      }
    case 'error':
      return { label: 'AI error', tone: 'danger', detail: `${status.message ?? 'The session failed.'}${retry}` }
  }
}

export function formatMs(ms: number | null): string {
  return ms === null ? '—' : `${Math.round(ms)} ms`
}

export function formatFps(fps: number | null): string {
  return fps === null || fps <= 0 ? '—' : fps.toFixed(1)
}

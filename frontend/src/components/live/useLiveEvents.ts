// UI state driven by the backend's events: the jutsu activation overlay, toasts and the
// screen-reader announcements. The overlay appears ONLY on a `jutsu` event and goes back to the
// ready state on that effect's `effect_end`. With the activation timeline (the `jutsu` event has
// `stages`) the title shows during the build-up (activation voice, charge, name) and leaves at the
// `release` phase, so the main effect is never covered; older servers: REVEAL_MS. Toasts: a gentle note on `wrong_sign` (the progress is
// kept, retry the same step) and a reset notice on `sequence_failed` (a timeout).
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ShinobiSession } from '../../hooks/useShinobiSession'
import type { Catalog } from '../../types/catalog'
import type { EffectId, JutsuId } from '../../types/protocol'
import { failureDetail, failureTitle, signName, titleCase, wrongSignDetail, wrongSignTitle } from './labels'

export type ActivationPhase = 'reveal' | 'active' | 'ending'

export interface Activation {
  key: number
  jutsu: JutsuId
  effect: EffectId
  phase: ActivationPhase
}

export interface FailureToast {
  id: number
  /** 'wrong_sign': a gentle note, the progress is kept; 'timeout': the sequence was reset */
  kind: 'wrong_sign' | 'timeout'
  jutsu: JutsuId
  title: string
  detail: string
}

export interface LiveEvents {
  activation: Activation | null
  toasts: FailureToast[]
  dismissToast: (id: number) => void
  /** text for an aria-live region (changes on steps, failures, activations) */
  announcement: string
}

export const REVEAL_MS = 2200
/** timeline reveal: if the release phase never arrives, the title still leaves this long after the
 * planned build-up */
export const REVEAL_SLACK_MS = 800
const TOAST_MS = 3400
const MAX_TOASTS = 3

export function useLiveEvents(session: Pick<ShinobiSession, 'subscribe' | 'connected'>, catalog: Catalog | null): LiveEvents {
  const [activation, setActivation] = useState<Activation | null>(null)
  const [toasts, setToasts] = useState<FailureToast[]>([])
  const [announcement, setAnnouncement] = useState('')
  const counter = useRef(0)
  const catalogRef = useRef(catalog)
  // The reveal always runs its full REVEAL_MS: a stop/end that arrives during it (Chidori and Fire
  // end at once when the hand leaves the picture, often in the same frame as `jutsu`) is kept here
  // and applied when the reveal is over.
  const reveal = useRef<{ key: number; effect: EffectId; until: number; pending: 'ending' | 'ended' | null } | null>(null)
  // the end of the current reveal moved earlier (the release came): the timer effect re-arms on it
  const [revealEnd, setRevealEnd] = useState(0)
  const { subscribe, connected } = session

  useEffect(() => {
    catalogRef.current = catalog
  }, [catalog])

  useEffect(
    () =>
      subscribe((frame) => {
        const cat = catalogRef.current
        for (const ev of frame.events) {
          switch (ev.type) {
            case 'jutsu': {
              const key = ++counter.current
              const build = ev.stages ? (ev.stages.voice + ev.stages.charge + ev.stages.name) * 1000 + REVEAL_SLACK_MS : REVEAL_MS
              reveal.current = { key, effect: ev.effect, until: performance.now() + build, pending: null }
              setRevealEnd(reveal.current.until)
              setActivation({ key, jutsu: ev.jutsu, effect: ev.effect, phase: 'reveal' })
              const j = cat?.jutsu.find((x) => x.id === ev.jutsu)
              setAnnouncement(`${j ? titleCase(j.title) : ev.jutsu} activated!`)
              break
            }
            case 'effect_phase': {
              // the main effect is released: the title leaves now, so it never covers the effect
              const r = reveal.current
              if (ev.phase === 'release' && r && r.effect === ev.effect && performance.now() < r.until) {
                r.until = performance.now()
                setRevealEnd(r.until)
              }
              break
            }
            case 'effect_stopping': {
              const r = reveal.current
              if (r && r.effect === ev.effect && performance.now() < r.until) {
                r.pending = r.pending ?? 'ending' // shown after the reveal
                break
              }
              setActivation((a) => (a && a.effect === ev.effect ? { ...a, phase: 'ending' } : a))
              break
            }
            case 'effect_end': {
              const r = reveal.current
              if (r && r.effect === ev.effect && performance.now() < r.until) {
                r.pending = 'ended' // the reveal still plays to its end, then the overlay goes
                break
              }
              setActivation((a) => (a && a.effect === ev.effect ? null : a))
              break
            }
            case 'wrong_sign': {
              const toast: FailureToast = {
                id: ++counter.current,
                kind: 'wrong_sign',
                jutsu: ev.jutsu,
                title: wrongSignTitle(ev, cat),
                detail: wrongSignDetail(ev, cat),
              }
              setToasts((list) => [...list, toast].slice(-MAX_TOASTS))
              setAnnouncement(`${toast.title}. ${toast.detail}`)
              break
            }
            case 'sequence_failed': {
              const toast: FailureToast = {
                id: ++counter.current,
                kind: ev.reason,
                jutsu: ev.jutsu,
                title: failureTitle(ev, cat),
                detail: failureDetail(ev, cat),
              }
              setToasts((list) => [...list, toast].slice(-MAX_TOASTS))
              setAnnouncement(`${toast.title}. ${toast.detail}`)
              break
            }
            case 'step': {
              const j = cat?.jutsu.find((x) => x.id === ev.jutsu)
              setAnnouncement(
                `${j ? titleCase(j.title) : ev.jutsu}: step ${ev.step} of ${ev.total} done, ${signName(cat, ev.sign)}.`,
              )
              break
            }
            default:
              break
          }
        }
      }),
    [subscribe],
  )

  // reveal -> compact "active" banner while the effect runs (or straight to the stop/end that
  // arrived during the reveal)
  useEffect(() => {
    if (!activation || activation.phase !== 'reveal') return
    const key = activation.key
    const wait = reveal.current && reveal.current.key === key ? Math.max(0, reveal.current.until - performance.now()) : REVEAL_MS
    const timer = setTimeout(() => {
      const r = reveal.current
      const pending = r && r.key === key ? r.pending : null
      setActivation((a) => {
        if (!a || a.key !== key || a.phase !== 'reveal') return a
        if (pending === 'ended') return null
        return { ...a, phase: pending === 'ending' ? 'ending' : 'active' }
      })
    }, wait)
    return () => clearTimeout(timer)
  }, [activation, revealEnd])

  // toasts disappear on their own
  useEffect(() => {
    if (toasts.length === 0) return
    const oldest = toasts[0].id
    const timer = setTimeout(() => setToasts((list) => list.filter((t) => t.id !== oldest)), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toasts])

  // no backend, no activation: everything goes back to the ready state
  const [wasConnected, setWasConnected] = useState(connected)
  if (wasConnected !== connected) {
    setWasConnected(connected)
    if (!connected) {
      setActivation(null)
      setToasts([])
    }
  }

  const dismissToast = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])
  return { activation, toasts, dismissToast, announcement }
}

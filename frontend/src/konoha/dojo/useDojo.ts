// State of the dojo (Home and Live): the camera, the backend session and what the cards show.
// Every sign, step, progress value and activation comes from the backend over the WebSocket
// (useShinobiSession: FrameState and its events); with the backend offline nothing is recognised.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSessionSounds } from '../../audio/useSessionSounds'
import {
  followFocus,
  jutsuAvailability,
  leadingJutsu,
  timeoutNotice,
  wrongSignDetail,
  wrongSignTitle,
} from '../../components/live/labels'
import { useLiveEvents } from '../../components/live/useLiveEvents'
import { useCatalog } from '../../contexts/CatalogContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useCamera } from '../../hooks/useCamera'
import { useShinobiSession } from '../../hooks/useShinobiSession'
import type { JutsuId, Mode } from '../../types/protocol'

const FREE: Mode = { mode: 'free', jutsu: null }
/** how long the sequence card shows "activated" after the backend's `jutsu` event */
const SUCCESS_MS = 4000
/** how long the card explains a reset by the time limit */
const NOTICE_MS = 6000

export interface CardNote {
  title: string
  detail: string
}

export function useDojo() {
  const { catalog, info: restInfo, loading, error, reload } = useCatalog()
  const { settings } = useSettings()
  const camera = useCamera()
  const session = useShinobiSession({ stream: camera.stream, mode: FREE, landmarks: settings.showLandmarks })
  useSessionSounds(session)
  const events = useLiveEvents(session, catalog)
  const info = session.info ?? restInfo

  // the catalog failed while the server was down: load it as soon as a session is up
  const connected = session.connected
  useEffect(() => {
    if (connected && !catalog && !loading) reload()
  }, [connected, catalog, loading, reload])

  const cameraOn = camera.status === 'active' && camera.stream !== null
  // "live" for the sequence = processed frames AND the AI counting signs (not while it warms up)
  const live = cameraOn && session.live && session.frame?.ready !== false
  const frame = live ? session.frame : null
  const order = useMemo(() => catalog?.jutsu.map((j) => j.id) ?? [], [catalog])
  const leader = leadingJutsu(frame?.progress, order)

  // The sequence card shows the clicked jutsu, follows the sequence being performed (followFocus:
  // it changes only when another jutsu has strictly more steps, so a wrong sign that starts another
  // jutsu never takes it away) and an activation moves it to the jutsu that fired.
  const [selected, setSelected] = useState<JutsuId | null>(null)
  // the card's notes (filled from the backend's events below); declared first because a reset notice
  // holds the card on its jutsu for a moment, even when it arrives in the same frame as the reset
  const [warning, setWarning] = useState<CardNote | null>(null)
  const [missKey, setMissKey] = useState(0)
  const [notice, setNotice] = useState<{ key: number; note: CardNote } | null>(null)
  const held = notice !== null
  const progressKey = order.map((id) => frame?.progress[id] ?? 0).join(',') + (held ? '|held' : '')
  const [seenProgressKey, setSeenProgressKey] = useState(progressKey)
  if (progressKey !== seenProgressKey) {
    setSeenProgressKey(progressKey)
    const next = held ? selected : followFocus(selected, frame?.progress, order)
    if (next && next !== selected) setSelected(next)
  }

  // short success state after the backend's `jutsu` event
  const [success, setSuccess] = useState<{ key: number; jutsu: JutsuId } | null>(null)
  const activation = events.activation
  const activationKey = activation?.key ?? null
  const [seenActivation, setSeenActivation] = useState<number | null>(null)
  if (activationKey !== seenActivation) {
    setSeenActivation(activationKey)
    if (activation) {
      setSuccess({ key: activation.key, jutsu: activation.jutsu })
      setSelected(activation.jutsu)
    }
  }
  useEffect(() => {
    if (!success) return
    const key = success.key
    const timer = setTimeout(() => setSuccess((s) => (s && s.key === key ? null : s)), SUCCESS_MS)
    return () => clearTimeout(timer)
  }, [success])

  const firstAvailable = catalog?.jutsu.find((j) => jutsuAvailability(j, catalog, info).available)?.id
  const focusId: JutsuId | null = (selected && order.includes(selected) ? selected : null) ?? firstAvailable ?? order[0] ?? null
  const focus = catalog?.jutsu.find((j) => j.id === focusId) ?? null
  const done = focus ? (frame?.progress[focus.id] ?? 0) : 0
  const complete = live && focus !== null && success?.jutsu === focus.id && done === 0
  // the countdown of the jutsu on screen, on its own clock (older servers: only the leader's)
  const perJutsu = frame?.time_left_per_jutsu
  const timeLeft =
    frame && focus
      ? perJutsu
        ? (perJutsu[focus.id] ?? null)
        : leader === focus.id
          ? frame.time_left
          : null
      : null

  // On the card: a wrong attempt at the current step (`wrong_sign`, the steps done are kept) and a
  // reset by the time limit (`sequence_failed`), for the jutsu on screen
  const focusRef = useRef<JutsuId | null>(focusId)
  useEffect(() => {
    focusRef.current = focusId
  }, [focusId])
  const maxGap = info?.sequence_max_gap ?? 7
  const { subscribe } = session
  useEffect(
    () =>
      subscribe((f) => {
        const on = focusRef.current
        for (const ev of f.events) {
          if (ev.type === 'wrong_sign' && ev.jutsu === on) {
            setWarning({ title: wrongSignTitle(ev, catalog), detail: wrongSignDetail(ev, catalog) })
            setMissKey((k) => k + 1)
          } else if (ev.type === 'step' && ev.jutsu === on) {
            setWarning(null)
            setMissKey(0)
            setNotice(null)
          } else if (ev.type === 'step') {
            // a new sequence started on another jutsu: the reset notice no longer holds the card
            setNotice(null)
          } else if (ev.type === 'sequence_failed' && ev.reason === 'timeout' && ev.jutsu === on) {
            setWarning(null)
            setMissKey(0)
            setNotice({ key: Date.now(), note: timeoutNotice(ev, catalog, maxGap) })
          } else if (ev.type === 'jutsu') {
            setWarning(null)
            setMissKey(0)
            setNotice(null)
          }
        }
      }),
    [subscribe, catalog, maxGap],
  )
  useEffect(() => {
    if (!notice) return
    const key = notice.key
    const timer = setTimeout(() => setNotice((n) => (n && n.key === key ? null : n)), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])
  // another jutsu on screen: its own notes only
  const [noteScope, setNoteScope] = useState(focusId)
  if (noteScope !== focusId) {
    setNoteScope(focusId)
    setWarning(null)
    setMissKey(0)
    setNotice(null)
  }

  // "Start over": the backend forgets every sequence in progress (the only reset besides the time limit)
  const { reset } = session
  const startOver = useCallback(() => {
    reset()
    setWarning(null)
    setMissKey(0)
    setNotice(null)
  }, [reset])

  return {
    catalog,
    info,
    loading,
    error,
    reload,
    camera,
    session,
    events,
    cameraOn,
    live,
    frame,
    focusId,
    focus,
    done,
    complete,
    timeLeft,
    warning: live && done > 0 ? warning : null,
    missKey: live && done > 0 ? missKey : 0,
    notice: live ? (notice?.note ?? null) : null,
    startOver,
    select: setSelected,
  }
}

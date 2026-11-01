// Pure helpers of the dojo's sequence card. They only arrange what the backend sent (FrameState
// progress, the `jutsu` event): nothing is guessed here.
import type { SignId } from '../../types/protocol'

export type StepState = 'done' | 'current' | 'todo'

/**
 * State of each step tile. `done` = steps confirmed in order (FrameState.progress); `complete` =
 * the backend fired the jutsu (its `jutsu` event: progress is cleared at that moment, so every
 * step counts as done). The next step is `current` only while the AI is live.
 */
export function stepStates(total: number, done: number, live: boolean, complete: boolean): StepState[] {
  const n = complete ? total : Math.max(0, Math.min(done, total))
  return Array.from({ length: total }, (_, i) => {
    if (i < n) return 'done'
    return live && !complete && i === n ? 'current' : 'todo'
  })
}

/**
 * The step that zooms in ("active step focus"): the next sign, but only once the backend has
 * confirmed at least one sign of this jutsu in order (FrameState.progress > 0) and while the AI is
 * live. null when nothing is confirmed yet, the jutsu fired, or the AI is not live, so the zoom only
 * ever follows a real confirmation from the server.
 */
export function focusStep(total: number, done: number, live: boolean, complete: boolean): number | null {
  if (!live || complete) return null
  const n = Math.max(0, Math.min(done, total))
  return n > 0 && n < total ? n : null
}

/** Steps shown as done ("N / 4"). */
export function shownDone(total: number, done: number, complete: boolean): number {
  return complete ? total : Math.max(0, Math.min(done, total))
}

/** The small motion that suggests how each hand sign is formed (display only, CSS animations). */
/** a jump up in the backend's time left larger than this is a restarted clock, not frame jitter */
export const CLOCK_RESTART_S = 1

export interface CountdownAnchor {
  value: number
  at: number // performance.now() ms
  step: number
}

/**
 * The countdown's new anchor after a backend frame. Within one step it only goes down (frame latency
 * and jitter can only lower it), except when the backend restarted the step's clock: in Live a wrong
 * attempt gives the same step its full time again (a jump up of more than CLOCK_RESTART_S). A new
 * step starts again from the backend's value.
 */
export function nextCountdownAnchor(
  prev: CountdownAnchor | null,
  timeLeft: number,
  now: number,
  step: number,
  maxExtrapolateS: number,
): CountdownAnchor {
  if (!prev || prev.step !== step) return { value: timeLeft, at: now, step }
  const shown = Math.max(0, prev.value - Math.min(maxExtrapolateS, (now - prev.at) / 1000))
  if (timeLeft > shown + CLOCK_RESTART_S) return { value: timeLeft, at: now, step }
  return { value: Math.min(timeLeft, shown), at: now, step }
}

export type SignGesture = 'rise' | 'press' | 'twist' | 'push'

const GESTURES: Partial<Record<SignId, SignGesture>> = {
  tiger: 'rise', // fingers pointing up
  ram: 'rise',
  horse: 'rise', // the triangle points up
  monkey: 'press', // palms pressed together
  boar: 'press',
  dog: 'press', // one hand pressed on the other
  snake: 'twist', // fingers interlocked
  clone_seal: 'twist', // the cross
  rasengan_palm: 'push', // open palm towards the camera
}

export function signGesture(sign: SignId): SignGesture {
  return GESTURES[sign] ?? 'press'
}

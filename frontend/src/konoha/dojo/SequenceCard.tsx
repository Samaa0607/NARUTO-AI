// "FIRE STYLE — HAND SIGN SEQUENCE" card of the dojo: the four signs of the selected (or leading)
// jutsu as numbered tiles. Done steps come from FrameState.progress, the success state from the
// backend's `jutsu` event; with the AI not live nothing is highlighted and the hint says so.
// Light CSS gesture animations (transform / opacity only, full motion only): the sign the AI waits
// for breathes with a slight lift and a motion that suggests the gesture, a confirmed step settles
// with a check "pop", and a shimmer runs across the tiles when the backend fires the jutsu.
// Active step focus: each time the backend confirms a sign, the next sign's step zooms in with a
// spring and the others step back a little (focusStep: never before a real confirmation).
import { Check, ChevronRight, Hand, RotateCcw, Sparkles, Timer, TimerOff, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { connectionText, jutsuAvailability, signName, titleCase } from '../../components/live/labels'
import { useSettings } from '../../contexts/SettingsContext'
import type { SocketStatus } from '../../services/socket'
import type { Catalog, JutsuInfo, SignInfo } from '../../types/catalog'
import type { ServerInfo } from '../../types/protocol'
import { ParchmentCard } from '../ParchmentCard'
import { JutsuIcon } from '../../components/art/JutsuIcon'
import { jutsuVisual } from '../../components/art/jutsuVisuals'
import {
  CLOCK_RESTART_S,
  focusStep,
  nextCountdownAnchor,
  shownDone,
  signGesture,
  stepStates,
  type SignGesture,
} from './sequenceSteps'
import styles from './SequenceCard.module.css'

export interface SequenceCardProps {
  jutsu: JutsuInfo | null
  catalog: Catalog | null
  info: ServerInfo | null
  /** steps done in order (FrameState.progress of this jutsu; 0 when not live) */
  done: number
  /** the backend just fired this jutsu (its `jutsu` event) */
  complete: boolean
  /** processed frames from the AI are on screen */
  live: boolean
  /** the camera is running */
  cameraOn: boolean
  status: SocketStatus
  /** FrameState.time_left while this jutsu is in progress, else null */
  timeLeft: number | null
  loading: boolean
  className?: string
  /** 'side' (Live page side column): a compact 2 x 2 layout when the card is narrow */
  variant?: 'default' | 'side'
  /** show the time-to-next-sign countdown (Live); Practice has no time limit */
  timed?: boolean
  /** changes on every wrong attempt at the current step (a `wrong_sign` event): its tile gets a
   * gentle amber ring until the step is confirmed; null = none */
  missKey?: number | null
  /** explicit reset of the sequence in progress (Live / Home): a "Start over" button while a
   * sequence is in progress; a wrong sign never resets it */
  onReset?: () => void
  /** a wrong attempt at the current step (`wrong_sign`; the steps done are kept): shown in place of
   * the "Next" hint until the step is confirmed */
  warning?: { title: string; detail: string } | null
  /** why the sequence was just reset by the time limit (`sequence_failed`) */
  notice?: { title: string; detail: string } | null
}

export function SequenceCard({
  jutsu,
  catalog,
  info,
  done,
  complete,
  live,
  cameraOn,
  status,
  timeLeft,
  loading,
  className,
  variant = 'default',
  timed = true,
  missKey = null,
  onReset,
  warning = null,
  notice = null,
}: SequenceCardProps) {
  const { motion } = useSettings()
  const cls = [styles.card, variant === 'side' ? styles.side : '', complete ? styles.complete : '', className ?? '']
    .filter(Boolean)
    .join(' ')
  if (!jutsu) {
    return (
      <ParchmentCard className={cls} aria-label="Hand sign sequence" data-testid="sequence-card" data-motion={motion}>
        <div className={styles.head}>
          <h2 className={styles.title}>Hand Sign Sequence</h2>
        </div>
        {loading ? (
          <ol className={styles.tiles} aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className={styles.step}>
                <div className={[styles.tile, styles.tileSkeleton].join(' ')} />
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.hint} data-testid="recognition-offline">
            The jutsu could not be loaded from the server.
          </p>
        )}
      </ParchmentCard>
    )
  }

  const visual = jutsuVisual(jutsu.id)
  const total = jutsu.steps.length
  const n = shownDone(total, done, complete)
  const states = stepStates(total, done, live, complete)
  const focus = focusStep(total, done, live, complete)
  const avail = jutsuAvailability(jutsu, catalog, info)
  const name = titleCase(jutsu.title)
  const next = !complete && n < total ? jutsu.steps[n] : null
  const nextInfo = next ? catalog?.signs[next.sign] : undefined
  const signs = jutsu.steps.map((s) => catalog?.signs[s.sign])
  const counting = live && !complete && n > 0 && timeLeft !== null

  return (
    <ParchmentCard
      className={cls}
      style={{ '--jc': visual.color } as CSSProperties}
      aria-label={`${name} hand sign sequence: ${n} of ${total} steps done`}
      data-testid="sequence-track"
      data-jutsu={jutsu.id}
      data-done={n}
      data-complete={complete ? 'true' : 'false'}
      data-motion={motion}
    >
      <div className={styles.head}>
        {/* the same animated jutsu icon as everywhere else (components/art/JutsuIcon) */}
        <span className={styles.jutsuIcon} aria-hidden="true">
          <JutsuIcon jutsu={jutsu.id} />
        </span>
        <h2 className={styles.title}>{jutsu.title}</h2>
        <span className={styles.kicker}>— Hand sign sequence</span>
        <div className={styles.progress}>
          <span className={styles.dots} aria-hidden="true">
            <span className={styles.line}>
              <span className={styles.lineFill} style={{ transform: `scaleX(${total > 1 ? Math.max(0, n - 1) / (total - 1) : 1})` }} />
            </span>
            {states.map((s, i) => (
              <span key={i} className={[styles.dot, styles[`dot_${s}`]].join(' ')} />
            ))}
          </span>
          <span className={styles.count} data-testid="step-count">
            {n} / {total}
          </span>
        </div>
      </div>

      {timed ? (
        <div className={styles.countdownRow}>
          <Countdown
            counting={counting}
            timeLeft={timeLeft}
            maxGap={info?.sequence_max_gap ?? DEFAULT_MAX_GAP}
            nextName={next ? signName(catalog, next.sign) : null}
            step={n}
          />
          {onReset ? (
            // the slot is always there (hidden when nothing is in progress): the card never jumps
            <button
              type="button"
              className={styles.reset}
              onClick={onReset}
              hidden={!(live && !complete && n > 0)}
              title="Start the sequence over from step 1"
              data-testid="sequence-reset"
            >
              <RotateCcw aria-hidden="true" /> Start over
            </button>
          ) : null}
        </div>
      ) : null}

      <ol
        className={[styles.tiles, focus !== null ? styles.focus : ''].filter(Boolean).join(' ')}
        data-testid="sequence-steps"
        data-focus={focus === null ? undefined : focus + 1}
      >
        {jutsu.steps.map((step, i) => {
          const state = states[i]
          const sign = catalog?.signs[step.sign]
          return (
            <li
              key={step.step}
              className={[styles.step, styles[state]].join(' ')}
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
              style={{ '--i': i } as CSSProperties}
            >
              <div className={styles.tile}>
                {i > 0 ? <ChevronRight className={styles.arrow} aria-hidden="true" /> : null}
                <span className={styles.num} aria-hidden="true">
                  {step.step}
                </span>
                <SignPicture sign={sign} gesture={signGesture(step.sign)} />
                <span className={styles.shine} aria-hidden="true" />
                {state === 'current' && missKey ? (
                  <span key={missKey} className={styles.miss} data-testid="step-miss" aria-hidden="true" />
                ) : null}
                {state === 'done' ? (
                  <span className={styles.check} aria-hidden="true">
                    <Check />
                  </span>
                ) : null}
              </div>
              <span className={styles.signName}>
                {signName(catalog, step.sign)}
                <span className="visually-hidden">{state === 'done' ? ' (done)' : state === 'current' ? ' (next)' : ''}</span>
              </span>
              {sign && !sign.recognizable ? <span className={styles.untrained}>not trained yet</span> : null}
            </li>
          )
        })}
      </ol>

      <div className={styles.foot}>
        {!live ? (
          <p className={styles.hint} data-testid="recognition-offline">
            {offlineHint(status, cameraOn)}
          </p>
        ) : complete ? (
          <p className={[styles.hint, styles.success].join(' ')} data-testid="sequence-complete">
            <Sparkles aria-hidden="true" /> {name} activated!
          </p>
        ) : notice ? (
          <p className={[styles.hint, styles.notice].join(' ')} data-testid="sequence-notice" role="status">
            <TimerOff aria-hidden="true" /> <strong>{notice.title}</strong> {notice.detail}
          </p>
        ) : warning && next ? (
          <p className={[styles.hint, styles.warnHint].join(' ')} data-testid="sequence-warning" role="status">
            <TriangleAlert aria-hidden="true" /> <strong>{warning.title}.</strong> {warning.detail}
          </p>
        ) : !avail.available ? (
          <p className={[styles.hint, styles.warn].join(' ')} data-testid="training-note">
            <strong>Training required.</strong> {avail.reason}
          </p>
        ) : next ? (
          <p className={styles.hint} data-testid="next-hint">
            Next: <strong>{signName(catalog, next.sign)}</strong>
            {nextInfo?.cues[0] ? <> — {nextInfo.cues[0]}</> : null}
          </p>
        ) : null}
        <SignCredit signs={signs} />
      </div>
    </ParchmentCard>
  )
}

/** server default (config.SEQUENCE_MAX_GAP) when an older server does not send sequence_max_gap */
const DEFAULT_MAX_GAP = 7

/** the backend stops counting when no frame arrives (config.SEQUENCE_CLOCK_MAX_STEP): so does the card */
const MAX_EXTRAPOLATE_S = 0.4

/**
 * The backend's time left, counted down smoothly between its frames (every 0.1 s, at most
 * MAX_EXTRAPOLATE_S past the last frame, like the backend's own clock) and re-synced on every frame.
 * Within one step it only goes up when the backend restarts the clock (Live: a wrong attempt gives the
 * step its full time again); a new confirmed step (`step` changes) starts it again from the backend's value.
 */
function useSmoothCountdown(timeLeft: number | null, counting: boolean, step: number): number | null {
  const [display, setDisplay] = useState<{ value: number; step: number } | null>(null)
  const anchor = useRef<{ value: number; at: number; step: number } | null>(null)
  useEffect(() => {
    if (!counting || timeLeft === null) {
      anchor.current = null
      return
    }
    const t = performance.now()
    const a = anchor.current
    const left = (c: { value: number; at: number }, now: number) =>
      Math.max(0, c.value - Math.min(MAX_EXTRAPOLATE_S, (now - c.at) / 1000))
    anchor.current = nextCountdownAnchor(a, timeLeft, t, step, MAX_EXTRAPOLATE_S)
    const tick = () => {
      const c = anchor.current
      if (c) setDisplay({ value: left(c, performance.now()), step: c.step })
    }
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, 100)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [timeLeft, counting, step])
  if (!counting || timeLeft === null) return null
  // this step's smoothed value; before its first tick, or while the last value shown is from before a
  // restart (an earlier countdown at the same step, or a wrong attempt), the backend's own
  return display !== null && display.step === step && timeLeft <= display.value + CLOCK_RESTART_S ? display.value : timeLeft
}

/** Time left to make the next sign (FrameState.time_left_per_jutsu from the backend): a draining bar
 * and the seconds. It is a limit, not a wait: the next sign counts as soon as the AI confirms it. */
function Countdown({
  counting,
  timeLeft,
  maxGap,
  nextName,
  step,
}: {
  counting: boolean
  timeLeft: number | null
  maxGap: number
  nextName: string | null
  /** steps done: a new one restarts the countdown */
  step: number
}) {
  const left = useSmoothCountdown(timeLeft, counting, step)
  const share = left !== null ? Math.min(1, left / maxGap) : 0
  const urgent = left !== null && left <= 2
  return (
    <div
      className={[styles.countdown, left !== null ? styles.counting : '', urgent ? styles.urgent : ''].filter(Boolean).join(' ')}
      data-testid="countdown"
      aria-hidden={left === null}
    >
      <Timer className={styles.countdownIcon} aria-hidden="true" />
      <span className={styles.countdownTrack} aria-hidden="true">
        <span className={styles.countdownFill} style={{ transform: `scaleX(${share})` }} />
      </span>
      <span className={styles.countdownText} role="timer">
        {left !== null ? (
          <>
            <span data-testid="time-left">{left.toFixed(1)} s</span>
            {nextName ? <span className={styles.countdownFor}> for {nextName}</span> : null}
          </>
        ) : (
          '—'
        )}
      </span>
    </div>
  )
}

function offlineHint(status: SocketStatus, cameraOn: boolean): string {
  if (!cameraOn) return 'Start the camera, then form the signs in order. The AI confirms each sign you hold.'
  if (status.state === 'connecting' || status.state === 'connected')
    return 'The AI is getting ready… make your first sign once the camera no longer says so.'
  return `${connectionText(status).label}: no recognition is shown.`
}

/** The line art (black lines on white) on a paper tile; a hand icon if the drawing fails to load. */
function SignPicture({ sign, gesture }: { sign: SignInfo | undefined; gesture: SignGesture }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (!sign || failed === sign.art) {
    return (
      <span
        className={styles.missing}
        role="img"
        aria-label={sign ? `${sign.name} hand sign (drawing unavailable)` : 'Hand sign'}
        data-gesture={gesture}
      >
        <Hand aria-hidden="true" />
      </span>
    )
  }
  return (
    <img
      className={styles.art}
      src={sign.art}
      alt={`${sign.name} hand sign`}
      decoding="async"
      data-gesture={gesture}
      onError={() => setFailed(sign.art)}
    />
  )
}

/** Licence of the drawings: Schlum's seals (CC BY-SA 4.0); the custom palm is SHINOBI AI's own. */
function SignCredit({ signs }: { signs: (SignInfo | undefined)[] }) {
  const list = signs.filter((s): s is SignInfo => Boolean(s))
  const commons = list.length === 0 || list.some((s) => s.official)
  const own = list.some((s) => !s.official)
  return (
    <p className={styles.credit}>
      {commons ? (
        <span>
          Hand-sign line art:{' '}
          <a href="https://commons.wikimedia.org/wiki/User:Schlum" target="_blank" rel="noreferrer noopener">
            Schlum
          </a>{' '}
          / Wikimedia Commons,{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer noopener">
            CC BY-SA 4.0
          </a>
          , lines thickened
        </span>
      ) : null}
      {own ? <span>Palm pose drawn for this project</span> : null}
    </p>
  )
}

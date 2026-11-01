// The four steps of one jutsu with the sign drawings. Done steps (from the backend's
// FrameState.progress) light up with the jutsu colour; the next step pulses; time_left counts down.
import { motion } from 'framer-motion'
import { Check, Timer } from 'lucide-react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import type { Catalog, JutsuInfo } from '../../types/catalog'
import { jutsuVisual } from '../art/jutsuVisuals'
import { SignArt } from '../ui/SignArt'
import { signName, titleCase } from './labels'
import styles from './SequenceTrack.module.css'

export interface SequenceTrackProps {
  jutsu: JutsuInfo
  catalog: Catalog | null
  /** steps done in order (backend progress); steps.length = completed (after a `jutsu` event) */
  done: number
  /** seconds left to show the next sign (FrameState.time_left), null when nothing is in progress */
  timeLeft: number | null
  /** the AI is live: otherwise nothing is highlighted as "next" */
  live: boolean
  /** show the jutsu name row above the steps */
  showTitle?: boolean
  /** extra label on the right of the title row */
  badge?: ReactNode
  size?: 'md' | 'lg'
  className?: string
}

const DEFAULT_GAP = 3.5 // config.SEQUENCE_MAX_GAP; the bar scales to the largest time_left seen

export function SequenceTrack({
  jutsu,
  catalog,
  done,
  timeLeft,
  live,
  showTitle = true,
  badge,
  size = 'md',
  className,
}: SequenceTrackProps) {
  const visual = jutsuVisual(jutsu.id)
  const total = jutsu.steps.length
  const completed = done >= total
  const [maxGap, setMaxGap] = useState(DEFAULT_GAP)
  if (timeLeft !== null && timeLeft > maxGap + 0.05) setMaxGap(timeLeft)
  const counting = live && !completed && done > 0 && timeLeft !== null
  const urgency = counting ? Math.max(0, Math.min(1, timeLeft / maxGap)) : 0

  return (
    <section
      className={[styles.track, styles[size], completed ? styles.completed : '', className ?? ''].filter(Boolean).join(' ')}
      style={{ '--jc': visual.color, '--jc2': visual.color2 } as CSSProperties}
      aria-label={`${titleCase(jutsu.title)} sequence: ${Math.min(done, total)} of ${total} steps done`}
      data-testid="sequence-track"
      data-jutsu={jutsu.id}
      data-done={Math.min(done, total)}
    >
      {showTitle ? (
        <header className={styles.head}>
          <span className={styles.glyph} aria-hidden="true">
            {visual.glyph}
          </span>
          <div className={styles.titles}>
            <h3 className={styles.title}>{jutsu.title}</h3>
            <span className={styles.name}>{jutsu.name}</span>
          </div>
          <div className={styles.headRight}>
            {badge}
            <span className={styles.count} data-testid="step-count">
              {completed ? 'Complete' : `${Math.min(done, total)} / ${total}`}
            </span>
          </div>
        </header>
      ) : null}

      <ol className={styles.steps}>
        <span className={styles.rail} aria-hidden="true">
          <motion.span
            className={styles.railFill}
            initial={false}
            animate={{ scaleX: total > 1 ? Math.min(1, Math.max(0, (Math.min(done, total) - 1) / (total - 1))) : 1 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          />
        </span>
        {jutsu.steps.map((step, i) => {
          const isDone = i < done
          const isNext = live && !completed && i === done
          const sign = catalog?.signs[step.sign]
          const state = isDone ? 'done' : isNext ? 'next' : 'todo'
          return (
            <li
              key={step.step}
              className={[styles.step, styles[state]].join(' ')}
              data-state={state}
              aria-current={isNext ? 'step' : undefined}
            >
              <div className={styles.tileWrap}>
                {sign ? (
                  <SignArt
                    className={styles.tile}
                    src={sign.art}
                    alt={`${sign.name} hand sign`}
                    tint={isDone ? visual.color2 : isNext ? 'var(--accent-2)' : undefined}
                    glow={isDone}
                  />
                ) : (
                  <div className={[styles.tile, styles.tilePlaceholder].join(' ')} />
                )}
                <motion.span
                  className={styles.doneSeal}
                  initial={false}
                  animate={isDone ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                  aria-hidden="true"
                >
                  <Check />
                </motion.span>
                <span className={styles.num} aria-hidden="true">
                  {step.step}
                </span>
              </div>
              <span className={styles.signLabel}>
                {signName(catalog, step.sign)}
                <span className="visually-hidden">{isDone ? ' (done)' : isNext ? ' (next)' : ''}</span>
              </span>
              {sign && !sign.recognizable ? <span className={styles.unrec}>not recognisable yet</span> : null}
            </li>
          )
        })}
      </ol>

      <div className={[styles.timer, counting ? styles.timerOn : ''].join(' ')} aria-hidden={!counting}>
        <Timer aria-hidden="true" />
        <div className={styles.timerBar}>
          <span
            className={[styles.timerFill, urgency < 0.35 ? styles.timerLow : ''].join(' ')}
            style={{ transform: `scaleX(${urgency})` }}
          />
        </div>
        <span className={styles.timerText} data-testid="time-left">
          {counting ? `${timeLeft.toFixed(1)} s` : '—'}
        </span>
        <span className="visually-hidden">to show the next sign</span>
      </div>
    </section>
  )
}

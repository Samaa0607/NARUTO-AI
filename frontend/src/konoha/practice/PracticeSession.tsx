// The practice session of one jutsu (/practice/<id>): the live camera (dojo CameraCard), the current
// step big (line art, cues, what the AI sees now), clear feedback on a wrong sign, the 4-step
// progress (dojo SequenceCard) and the completion state. The session runs in mode "practice" for
// this jutsu: steps advance ONLY on the backend's progress and it completes ONLY on its `jutsu`
// event. Practice has no time limit (no countdown, the backend never times it out) and a wrong sign
// never resets it (`wrong_sign`: a gentle warning, retry the same step, the steps done are kept);
// only "Start over" resets it. Nothing here is guessed or faked.
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check, ExternalLink, Eye, RotateCcw, Sparkles, Target, TimerOff, TriangleAlert, XCircle } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useSessionSounds } from '../../audio/useSessionSounds'
import { jutsuVisual } from '../../components/art/jutsuVisuals'
import {
  failureDetail,
  failureTitle,
  jutsuAvailability,
  signName,
  titleCase,
  wrongSignDetail,
  wrongSignTitle,
} from '../../components/live/labels'
import { useLiveEvents } from '../../components/live/useLiveEvents'
import { useSettings } from '../../contexts/SettingsContext'
import { useCamera } from '../../hooks/useCamera'
import { useShinobiSession } from '../../hooks/useShinobiSession'
import type { Catalog, JutsuInfo } from '../../types/catalog'
import type { Mode, SequenceFailedEvent, ServerInfo, WrongSignEvent } from '../../types/protocol'
import { BrushButton } from '../BrushButton'
import { CameraCard } from '../dojo/CameraCard'
import { SequenceCard } from '../dojo/SequenceCard'
import { ParchmentCard } from '../ParchmentCard'
import { SignArt } from '../jutsu/SignSteps'
import styles from './PracticeSession.module.css'

export interface PracticeSessionProps {
  jutsu: JutsuInfo
  catalog: Catalog
  /** server info from REST (the live session's hello replaces it) */
  restInfo: ServerInfo | null
  loading: boolean
}

export function PracticeSession({ jutsu, catalog, restInfo, loading }: PracticeSessionProps) {
  const { settings } = useSettings()
  const camera = useCamera()
  const mode: Mode = { mode: 'practice', jutsu: jutsu.id }
  const session = useShinobiSession({ stream: camera.stream, mode, landmarks: settings.showLandmarks })
  const sounds = useSessionSounds(session)
  const events = useLiveEvents(session, catalog)
  const info = session.info ?? restInfo
  const practiceId = jutsu.id

  // completion / last failure of THIS jutsu, from the backend's events only
  const [completedKey, setCompletedKey] = useState<number | null>(null)
  const [failure, setFailure] = useState<SequenceFailedEvent | WrongSignEvent | null>(null)
  // one more on every wrong attempt at the current step (the tile's amber ring); 0 = none
  const [missKey, setMissKey] = useState(0)
  const counter = useRef(0)
  const { subscribe, connected } = session
  useEffect(
    () =>
      subscribe((frame) => {
        if (frame.mode.mode !== 'practice' || frame.mode.jutsu !== practiceId) return
        let failedNow = false
        for (const ev of frame.events) {
          if (ev.type === 'jutsu' && ev.jutsu === practiceId) {
            setCompletedKey(++counter.current)
            setFailure(null)
            setMissKey(0)
          } else if (ev.type === 'wrong_sign' && ev.jutsu === practiceId) {
            // the steps done are kept: only a warning, and the same step again
            failedNow = true
            setCompletedKey(null)
            setFailure(ev)
            setMissKey((k) => k + 1)
          } else if (ev.type === 'sequence_failed' && ev.jutsu === practiceId) {
            // older servers only (the current one never times out or resets a practice)
            failedNow = true
            setCompletedKey(null)
            setFailure(ev)
            setMissKey(0)
          } else if (ev.type === 'step' && ev.jutsu === practiceId) {
            setCompletedKey(null)
            setMissKey(0)
            if (!failedNow) setFailure(null) // the wrong sign may itself be step 1: keep its message
          }
        }
      }),
    [subscribe, practiceId],
  )

  // another jutsu or a lost connection starts from scratch
  const scopeKey = `${practiceId}:${connected}`
  const [scope, setScope] = useState(scopeKey)
  if (scope !== scopeKey) {
    setScope(scopeKey)
    setCompletedKey(null)
    setFailure(null)
    setMissKey(0)
  }

  const visual = jutsuVisual(jutsu.id)
  const name = titleCase(jutsu.title)
  const total = jutsu.steps.length
  const cameraOn = camera.status === 'active' && camera.stream !== null
  const live = cameraOn && session.live && session.frame?.ready !== false
  const frame = live ? session.frame : null
  const modeOk = frame?.mode.mode === 'practice' && frame.mode.jutsu === jutsu.id
  const progress = frame && modeOk ? (frame.progress[jutsu.id] ?? 0) : 0
  const completed = completedKey !== null && live
  const done = completed ? total : Math.min(progress, total)
  const current = jutsu.steps[Math.min(done, total - 1)]
  const sign = catalog.signs[current.sign]
  const seen = frame && frame.sign.name !== 'idle' ? frame.sign.name : null
  const seenIsRight = seen === current.sign
  const avail = jutsuAvailability(jutsu, catalog, info)

  const retry = () => {
    session.reset()
    sounds.stopVoice()
    setCompletedKey(null)
    setFailure(null)
    setMissKey(0)
  }

  return (
    <div className={styles.session} style={{ '--jc': visual.color } as CSSProperties} data-testid="practice-session" data-jutsu={jutsu.id}>
      <div className={styles.top}>
        <CameraCard camera={camera} session={session} catalog={catalog} events={events} className={styles.camera} />

        <ParchmentCard
          title={completed ? 'Complete!' : `Step ${current.step} of ${total}`}
          icon={completed ? <Sparkles /> : <Target />}
          className={[styles.coach, completed ? styles.coachDone : ''].filter(Boolean).join(' ')}
          aria-label={`${name}: current step`}
          data-testid="coach"
        >
          <AnimatePresence mode="wait" initial={false}>
            {completed ? (
              <motion.div
                key={`done-${completedKey}`}
                className={styles.complete}
                data-testid="practice-complete"
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className={styles.completeSeal} aria-hidden="true">
                  <Check />
                </span>
                <p className={styles.completeTitle}>{name} activated!</p>
                <p className={styles.completeText}>
                  The AI confirmed all {total} signs in order and fired the jutsu.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key={`step-${jutsu.id}-${done}`}
                className={styles.step}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className={[styles.tile, live ? styles.tileLive : ''].filter(Boolean).join(' ')}>
                  <span className={styles.num} aria-hidden="true">
                    {current.step}
                  </span>
                  <SignArt sign={sign} />
                </div>
                <div className={styles.stepText}>
                  <p className={styles.stepKicker} data-testid="practice-step">
                    Step {current.step} of {total}
                  </p>
                  <h2 className={styles.signName} data-testid="practice-sign">
                    {signName(catalog, current.sign)}
                  </h2>
                  {sign?.jp ? (
                    <p className={styles.jp} lang="ja">
                      {sign.jp}
                    </p>
                  ) : null}
                  {sign && sign.cues.length > 0 ? (
                    <ul className={styles.cues}>
                      {sign.cues.map((cue) => (
                        <li key={cue}>{cue}</li>
                      ))}
                    </ul>
                  ) : null}
                  <a className={styles.refLink} href={current.card} target="_blank" rel="noreferrer noopener">
                    <ExternalLink aria-hidden="true" /> Step card
                  </a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!completed ? (
            <div
              className={[styles.sees, seen ? (seenIsRight ? styles.seesRight : styles.seesOther) : '', live ? '' : styles.seesOff]
                .filter(Boolean)
                .join(' ')}
              data-testid="practice-sees"
              data-sign={seen ?? 'none'}
            >
              <Eye aria-hidden="true" />
              <span className={styles.seesLabel}>AI sees</span>
              <strong className={styles.seesSign}>
                {!live ? 'AI not live' : seen ? signName(catalog, seen) : frame && frame.hands === 0 ? 'No hands' : 'No sign'}
              </strong>
              {live && seen ? (
                <span className={styles.seesNote}>{seenIsRight ? 'Right sign: hold it' : 'Not this step’s sign'}</span>
              ) : null}
            </div>
          ) : null}

          <AnimatePresence>
            {failure && !completed ? (
              failure.type === 'wrong_sign' ? (
                <motion.div
                  key={`wrong-${missKey}`}
                  className={[styles.failure, styles.warning].join(' ')}
                  role="status"
                  data-testid="practice-failure"
                  data-kind="wrong_sign"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0, x: [0, -3, 3, 0] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  <TriangleAlert aria-hidden="true" />
                  <span>
                    <strong>{wrongSignTitle(failure, catalog)}</strong>
                    <span className={styles.failureDetail}>{wrongSignDetail(failure, catalog)}</span>
                  </span>
                </motion.div>
              ) : (
                <motion.div
                  key={`${failure.reason}-${failure.step}-${failure.got}-${failure.expected}`}
                  className={styles.failure}
                  role="alert"
                  data-testid="practice-failure"
                  data-kind={failure.reason}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0, x: [0, -5, 5, -3, 3, 0] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  {failure.reason === 'timeout' ? <TimerOff aria-hidden="true" /> : <XCircle aria-hidden="true" />}
                  <span>
                    <strong>{failureTitle(failure, catalog)}</strong>
                    <span className={styles.failureDetail}>{failureDetail(failure, catalog)}</span>
                  </span>
                </motion.div>
              )
            ) : null}
          </AnimatePresence>

          {avail.available ? null : (
            <p className={styles.training} role="note" data-testid="training-note">
              <TriangleAlert aria-hidden="true" />
              <span>
                <strong>Training Required.</strong> {avail.reason} You can follow the signs, but this jutsu cannot be
                completed on this server yet.
              </span>
            </p>
          )}

          <div className={styles.actions}>
            <BrushButton icon={<RotateCcw />} onClick={retry} disabled={!session.connected} data-testid="retry">
              {completed ? 'Practise again' : 'Start over'}
            </BrushButton>
            <BrushButton variant="secondary" icon={<ArrowLeft />} to="/library" data-testid="back-to-jutsu">
              Back to Jutsu
            </BrushButton>
          </div>
        </ParchmentCard>
      </div>

      <SequenceCard
        jutsu={jutsu}
        catalog={catalog}
        info={info}
        done={done}
        complete={completed}
        live={live}
        cameraOn={cameraOn}
        status={session.status}
        timeLeft={null}
        loading={loading}
        timed={false}
        missKey={missKey || null}
      />

      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {events.announcement}
      </p>
    </div>
  )
}

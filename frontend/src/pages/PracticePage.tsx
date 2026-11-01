// Practice Mode. /practice: choose a jutsu. /practice/:jutsuId: a session in mode "practice" for that
// jutsu: the reference card of the current step, what the AI sees, feedback on wrong signs. It
// advances ONLY on the backend's progress / step events and completes ONLY on its `jutsu` event.
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, BookOpen, CheckCircle2, LayoutGrid, RotateCcw, Target, TimerOff, XCircle } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { useSessionSounds } from '../audio/useSessionSounds'
import { jutsuVisual } from '../components/art/jutsuVisuals'
import { useDocumentTitle } from '../components/layout/useDocumentTitle'
import { AvailabilityNotice } from '../components/live/AvailabilityNotice'
import { CameraStage } from '../components/live/CameraStage'
import { failureDetail, failureTitle, jutsuAvailability, signName, titleCase } from '../components/live/labels'
import { RecognitionPanel } from '../components/live/RecognitionPanel'
import { SequenceTrack } from '../components/live/SequenceTrack'
import { StageOverlay } from '../components/live/StageOverlay'
import { useLiveEvents } from '../components/live/useLiveEvents'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { SectionHeading } from '../components/ui/SectionHeading'
import { SequenceBadge } from '../components/ui/SequenceBadge'
import { SignArt } from '../components/ui/SignArt'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState, ErrorState } from '../components/ui/StatusMessage'
import { useCatalog } from '../contexts/CatalogContext'
import { useSettings } from '../contexts/SettingsContext'
import { useCamera } from '../hooks/useCamera'
import { useShinobiSession } from '../hooks/useShinobiSession'
import type { Catalog, JutsuInfo } from '../types/catalog'
import type { Mode, SequenceFailedEvent } from '../types/protocol'
import styles from './PracticePage.module.css'

export function PracticePage() {
  const { jutsuId } = useParams()
  return jutsuId ? <PracticeSession jutsuId={jutsuId} /> : <PracticeChooser />
}

// ==================================================================== /practice
function PracticeChooser() {
  useDocumentTitle('Practice Mode')
  const { catalog, info, loading, error, reload } = useCatalog()
  return (
    <div className={styles.page}>
      <SectionHeading
        as="h1"
        eyebrow="Practice mode"
        title="Train one jutsu"
        kanji="修"
        description="Pick a jutsu and learn it sign by sign. You see the reference card of each step and what the AI recognises; you move on only when the AI confirms the right sign."
      />
      {catalog ? (
        <ul className={styles.cards} data-testid="practice-chooser">
          {catalog.jutsu.map((j) => (
            <li key={j.id}>
              <PracticeCard jutsu={j} catalog={catalog} info={info} />
            </li>
          ))}
        </ul>
      ) : loading ? (
        <div className={styles.cards}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={360} radius={22} />
          ))}
        </div>
      ) : (
        <ErrorState message={error ?? undefined} onRetry={reload} />
      )}
    </div>
  )
}

function PracticeCard({ jutsu, catalog, info }: { jutsu: JutsuInfo; catalog: Catalog; info: ReturnType<typeof useCatalog>['info'] }) {
  const visual = jutsuVisual(jutsu.id)
  const avail = jutsuAvailability(jutsu, catalog, info)
  return (
    <article
      className={styles.card}
      style={{ '--jc': visual.color, '--jc2': visual.color2 } as CSSProperties}
      data-testid={`practice-card-${jutsu.id}`}
    >
      <span className={styles.cardKanji} aria-hidden="true">
        {visual.glyph}
      </span>
      <header className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{jutsu.title}</h2>
        <p className={styles.cardName}>{jutsu.name}</p>
        <p className={styles.cardJp} lang="ja">
          {jutsu.kanji}
        </p>
      </header>
      <SequenceBadge official={jutsu.official} />
      <ol className={styles.mini} aria-label="Sequence">
        {jutsu.steps.map((s) => {
          const sign = catalog.signs[s.sign]
          return (
            <li key={s.step}>
              {sign ? <SignArt src={sign.art} alt="" tint={visual.color2} /> : <span className={styles.miniBlank} />}
              <span>{signName(catalog, s.sign)}</span>
            </li>
          )
        })}
      </ol>
      {avail.available ? (
        <p className={styles.ok}>
          <CheckCircle2 aria-hidden="true" /> Every sign can be recognised by this server.
        </p>
      ) : (
        <p className={styles.warn}>{avail.reason}</p>
      )}
      <Button to={`/practice/${jutsu.id}`} icon={<Target />} className={styles.cardButton}>
        Practise {titleCase(jutsu.title)}
      </Button>
    </article>
  )
}

// ==================================================================== /practice/:jutsuId
const FREE: Mode = { mode: 'free', jutsu: null }

function PracticeSession({ jutsuId }: { jutsuId: string }) {
  const { catalog, info: restInfo, loading, error, reload, jutsu: findJutsu } = useCatalog()
  const jutsu = findJutsu(jutsuId)
  useDocumentTitle(jutsu ? `Practice · ${titleCase(jutsu.title)}` : 'Practice Mode')
  const { settings } = useSettings()
  const camera = useCamera()
  const practiceId = jutsu?.id ?? null
  const mode: Mode = practiceId ? { mode: 'practice', jutsu: practiceId } : FREE
  const session = useShinobiSession({
    stream: camera.stream,
    mode,
    landmarks: settings.showLandmarks,
    enabled: practiceId !== null,
  })
  useSessionSounds(session)
  const events = useLiveEvents(session, catalog)
  const info = session.info ?? restInfo

  // completion / last failure of THIS jutsu, from backend events only
  const [completedKey, setCompletedKey] = useState<number | null>(null)
  const [failure, setFailure] = useState<SequenceFailedEvent | null>(null)
  const counter = useRef(0)
  const { subscribe, connected } = session
  useEffect(() => {
    if (!practiceId) return
    return subscribe((frame) => {
      if (frame.mode.mode !== 'practice' || frame.mode.jutsu !== practiceId) return
      let failedNow = false
      for (const ev of frame.events) {
        if (ev.type === 'jutsu' && ev.jutsu === practiceId) {
          setCompletedKey(++counter.current)
          setFailure(null)
        } else if (ev.type === 'sequence_failed' && ev.jutsu === practiceId) {
          failedNow = true
          setCompletedKey(null)
          setFailure(ev)
        } else if (ev.type === 'step' && ev.jutsu === practiceId) {
          setCompletedKey(null)
          if (!failedNow) setFailure(null) // the wrong sign may itself be step 1: keep its message
        }
      }
    })
  }, [subscribe, practiceId])

  // a new jutsu or a lost connection starts from scratch
  const [scope, setScope] = useState(`${practiceId}:${connected}`)
  if (scope !== `${practiceId}:${connected}`) {
    setScope(`${practiceId}:${connected}`)
    setCompletedKey(null)
    setFailure(null)
  }

  // the catalog failed while the server was down: load it as soon as a session is up
  useEffect(() => {
    if (connected && !catalog && !loading) reload()
  }, [connected, catalog, loading, reload])

  if (!catalog) {
    return (
      <div className={styles.page}>
        <BackLinks />
        {loading ? <Skeleton height={420} radius={22} /> : <ErrorState message={error ?? undefined} onRetry={reload} />}
      </div>
    )
  }
  if (!jutsu) {
    return (
      <div className={styles.page}>
        <BackLinks />
        <EmptyState
          icon={<Target />}
          title="Unknown jutsu"
          actions={
            <Button to="/practice" icon={<LayoutGrid />}>
              Choose a jutsu
            </Button>
          }
        >
          <p>There is no jutsu called “{jutsuId}”.</p>
        </EmptyState>
      </div>
    )
  }

  const visual = jutsuVisual(jutsu.id)
  const total = jutsu.steps.length
  const frame = session.live ? session.frame : null
  const modeOk = frame?.mode.mode === 'practice' && frame.mode.jutsu === jutsu.id
  const progress = frame && modeOk ? (frame.progress[jutsu.id] ?? 0) : 0
  const completed = completedKey !== null && session.live
  const done = completed ? total : progress
  const current = jutsu.steps[Math.min(done, total - 1)]
  const sign = catalog.signs[current.sign]
  const seen = frame && frame.sign.name !== 'idle' ? frame.sign.name : null
  const seenIsRight = seen === current.sign
  const pct = Math.round((done / total) * 100)
  const available = jutsuAvailability(jutsu, catalog, info).available

  const retry = () => {
    session.reset()
    setCompletedKey(null)
    setFailure(null)
  }

  return (
    <div className={styles.page} style={{ '--jc': visual.color, '--jc2': visual.color2 } as CSSProperties}>
      <BackLinks />

      <header className={styles.hero}>
        <span className={styles.heroGlyph} aria-hidden="true">
          {visual.glyph}
        </span>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Practice mode</p>
          <h1 className={styles.heroTitle}>{jutsu.title}</h1>
          <p className={styles.heroName}>
            {jutsu.name}{' '}
            <span lang="ja" className={styles.heroKanji}>
              {jutsu.kanji}
            </span>
          </p>
          <div className={styles.heroBadges}>
            <SequenceBadge official={jutsu.official} />
            {!available ? <Badge tone="warning">Not completable yet</Badge> : null}
          </div>
          <p className={styles.description}>{jutsu.description}</p>
        </div>
        <div className={styles.heroActions}>
          <Button variant="secondary" icon={<RotateCcw />} onClick={retry} disabled={!session.connected} data-testid="retry">
            Retry
          </Button>
        </div>
      </header>

      <AvailabilityNotice catalog={catalog} info={info} jutsu={jutsu} />

      <div className={styles.grid}>
        <div className={styles.main}>
          <CameraStage
            camera={camera}
            session={session}
            label={`Practice camera for ${titleCase(jutsu.title)}`}
            overlay={<StageOverlay events={events} catalog={catalog} frame={frame} />}
          />
          <div className={styles.progressRow}>
            <span className={styles.progressLabel} data-testid="practice-progress">
              {completed ? 'Complete' : `${done} of ${total} signs`}
            </span>
            <div
              className={styles.progress}
              role="progressbar"
              aria-label="Sequence progress"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
            >
              <motion.span
                className={styles.progressFill}
                initial={false}
                animate={{ scaleX: pct / 100 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
          <SequenceTrack
            jutsu={jutsu}
            catalog={catalog}
            done={done}
            timeLeft={frame && modeOk ? frame.time_left : null}
            live={session.live}
            showTitle={false}
          />
        </div>

        <aside className={styles.side} aria-label="Coach">
          <section className={styles.coach} data-testid="coach" aria-label="Current step">
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
                    <motion.span
                      className={styles.completeRing}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: [0.6, 1.25, 1], opacity: [0, 1, 0.9] }}
                      transition={{ duration: 0.9 }}
                    />
                    <CheckCircle2 />
                  </span>
                  <p className={styles.completeKicker}>Jutsu complete</p>
                  <h2 className={styles.completeTitle}>{jutsu.title}</h2>
                  <p className={styles.completeText}>
                    The AI confirmed all {total} signs in order and fired the jutsu.
                  </p>
                  <div className={styles.completeActions}>
                    <Button icon={<RotateCcw />} onClick={retry} data-testid="practice-again">
                      Practise again
                    </Button>
                    <Button variant="secondary" icon={<BookOpen />} to="/library">
                      Back to Library
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key={`step-${done}`}
                  className={styles.stepCard}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className={styles.stepHead}>
                    <span className={styles.stepNum} data-testid="practice-step">
                      Step {current.step} of {total}
                    </span>
                    {sign && !sign.recognizable ? <Badge tone="warning">Not recognisable yet</Badge> : null}
                  </div>
                  <h2 className={styles.stepSign} data-testid="practice-sign">
                    {signName(catalog, current.sign)}
                  </h2>
                  {sign ? (
                    <p className={styles.stepJp} lang="ja">
                      {sign.jp}
                    </p>
                  ) : null}
                  <img
                    className={styles.refCard}
                    src={current.card}
                    alt={`Reference card: step ${current.step} of ${titleCase(jutsu.title)}, ${signName(catalog, current.sign)}`}
                    loading="eager"
                    decoding="async"
                  />
                  {sign && sign.cues.length > 0 ? (
                    <ul className={styles.cues}>
                      {sign.cues.map((cue) => (
                        <li key={cue}>{cue}</li>
                      ))}
                    </ul>
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>

            {!completed && frame ? (
              <div
                className={[styles.sees, seen ? (seenIsRight ? styles.seesRight : styles.seesOther) : ''].join(' ')}
                data-testid="practice-sees"
              >
                <span className={styles.seesLabel}>AI sees</span>
                <strong>{seen ? signName(catalog, seen) : 'no sign'}</strong>
                {seen ? <span className={styles.seesNote}>{seenIsRight ? 'right sign: hold it' : 'not this step’s sign'}</span> : null}
              </div>
            ) : null}

            <AnimatePresence>
              {failure && !completed ? (
                <motion.div
                  key={`${failure.reason}-${failure.step}-${failure.got}`}
                  className={styles.failure}
                  role="alert"
                  data-testid="practice-failure"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  {failure.reason === 'timeout' ? <TimerOff aria-hidden="true" /> : <XCircle aria-hidden="true" />}
                  <span>
                    <strong>{failureTitle(failure, catalog)}</strong>
                    <span className={styles.failureDetail}>{failureDetail(failure, catalog)}</span>
                  </span>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>

          <RecognitionPanel session={session} catalog={catalog} compact />
        </aside>
      </div>

      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {events.announcement}
      </p>
    </div>
  )
}

function BackLinks() {
  return (
    <nav className={styles.back} aria-label="Practice navigation">
      <Button variant="ghost" size="sm" icon={<ArrowLeft />} to="/library" data-testid="back-to-library">
        Back to Library
      </Button>
      <Button variant="ghost" size="sm" icon={<LayoutGrid />} to="/practice">
        All jutsu
      </Button>
    </nav>
  )
}

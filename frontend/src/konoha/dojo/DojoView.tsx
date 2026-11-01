// The dojo (Home; Live uses the same state in konoha/live/LiveView): the live camera, the four jutsu
// and the hand-sign sequence of the selected one, laid out like the reference. Every sign, step,
// progress value and activation comes from the backend over the WebSocket (useDojo: FrameState and
// its events); with the backend offline nothing is recognised and the cards say so.
import { useDocumentTitle } from '../../components/layout/useDocumentTitle'
import { CameraCard } from './CameraCard'
import { JutsuListCard } from './JutsuListCard'
import { SequenceCard } from './SequenceCard'
import { useDojo } from './useDojo'
import styles from './DojoView.module.css'

export interface DojoViewProps {
  /** the page's (visually hidden) h1 */
  heading: string
  /** browser tab title; null = just "SHINOBI AI" */
  documentTitle: string | null
}

export function DojoView({ heading, documentTitle }: DojoViewProps) {
  useDocumentTitle(documentTitle)
  const dojo = useDojo()
  const { catalog, info, loading, error, reload, camera, session, events, frame, focusId, focus, done, complete, live, cameraOn } = dojo

  return (
    <div className={styles.dojo}>
      <h1 className="visually-hidden">{heading}</h1>
      <div className={styles.top}>
        <CameraCard camera={camera} session={session} catalog={catalog} events={events} className={styles.camera} />
        <JutsuListCard
          className={styles.jutsu}
          catalog={catalog}
          info={info}
          loading={loading}
          error={error}
          onRetry={reload}
          progress={frame?.progress ?? null}
          selected={focusId}
          onSelect={dojo.select}
        />
      </div>
      <SequenceCard
        jutsu={focus}
        catalog={catalog}
        info={info}
        done={done}
        complete={complete}
        live={live}
        cameraOn={cameraOn}
        status={session.status}
        onReset={dojo.startOver}
        warning={dojo.warning}
        notice={dojo.notice}
        missKey={dojo.missKey || null}
        timeLeft={dojo.timeLeft}
        loading={loading}
      />
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {events.announcement}
      </p>
    </div>
  )
}

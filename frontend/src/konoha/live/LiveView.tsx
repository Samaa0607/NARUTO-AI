// The Live page: the camera is the main focus. Desktop: a large camera card with a narrow column
// beside it (the four jutsu, then the leading jutsu's hand signs); tablet and phone: the camera
// first at full width, then the list and the sequence. Same backend-driven state as Home (useDojo):
// every sign, step and activation comes from the server; with it offline nothing is recognised.
import { useDocumentTitle } from '../../components/layout/useDocumentTitle'
import { CameraCard } from '../dojo/CameraCard'
import { JutsuListCard } from '../dojo/JutsuListCard'
import { SequenceCard } from '../dojo/SequenceCard'
import { useDojo } from '../dojo/useDojo'
import styles from './LiveView.module.css'

export interface LiveViewProps {
  /** the page's (visually hidden) h1 */
  heading: string
  /** browser tab title; null = just "SHINOBI AI" */
  documentTitle: string | null
}

export function LiveView({ heading, documentTitle }: LiveViewProps) {
  useDocumentTitle(documentTitle)
  const dojo = useDojo()
  const { catalog, info, camera, session, events, frame, focus } = dojo

  return (
    <div className={styles.live}>
      <h1 className="visually-hidden">{heading}</h1>
      <div className={styles.grid}>
        <CameraCard camera={camera} session={session} catalog={catalog} events={events} size="hero" className={styles.camera} />
        <div className={styles.side}>
          <JutsuListCard
            className={styles.list}
            density="compact"
            catalog={catalog}
            info={info}
            loading={dojo.loading}
            error={dojo.error}
            onRetry={dojo.reload}
            progress={frame?.progress ?? null}
            selected={dojo.focusId}
            onSelect={dojo.select}
          />
          <SequenceCard
            className={styles.sequence}
            variant="side"
            jutsu={focus}
            catalog={catalog}
            info={info}
            done={dojo.done}
            complete={dojo.complete}
            live={dojo.live}
            cameraOn={dojo.cameraOn}
            status={session.status}
            timeLeft={dojo.timeLeft}
            loading={dojo.loading}
            onReset={dojo.startOver}
            warning={dojo.warning}
            notice={dojo.notice}
            missKey={dojo.missKey || null}
          />
        </div>
      </div>
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {events.announcement}
      </p>
    </div>
  )
}

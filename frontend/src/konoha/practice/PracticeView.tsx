// The Practice page (/practice, /practice/:jutsuId): the same jutsu carousel as the Jutsu page to
// choose what to train, and the practice session of the selected jutsu under it. Choosing another
// card switches the session's practice jutsu (the camera keeps running).
import { RefreshCw, Target } from 'lucide-react'
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useDocumentTitle } from '../../components/layout/useDocumentTitle'
import { jutsuAvailability, titleCase } from '../../components/live/labels'
import { useCatalog } from '../../contexts/CatalogContext'
import { BrushTag } from '../BrushTag'
import { Carousel } from '../carousel/Carousel'
import { ParchmentCard } from '../ParchmentCard'
import { JutsuCard } from '../jutsu/JutsuCard'
import { replaceUrl, selectedIndex, useSelectedJutsu } from '../jutsu/pageState'
import pageStyles from '../jutsu/JutsuView.module.css'
import { PracticeSession } from './PracticeSession'

export function PracticeView() {
  const { jutsuId } = useParams()
  const { catalog, info, loading, error, reload } = useCatalog()
  const [selected, setSelected] = useSelectedJutsu(jutsuId)
  const list = catalog?.jutsu ?? []
  const firstReady = catalog?.jutsu.find((j) => jutsuAvailability(j, catalog, info).available)?.id
  const index = selectedIndex(list, selected, firstReady)
  const jutsu = list[index] ?? null
  const unknown = catalog && jutsuId && !list.some((j) => j.id === jutsuId) ? jutsuId : null
  useDocumentTitle(jutsu ? `Practice · ${titleCase(jutsu.title)}` : 'Practice')

  // the catalog failed while the server was down: try again every few seconds
  useEffect(() => {
    if (catalog || loading) return
    const timer = setTimeout(reload, 5000)
    return () => clearTimeout(timer)
  }, [catalog, loading, reload])

  const select = (i: number) => {
    const j = list[i]
    if (!j) return
    setSelected(j.id)
    replaceUrl(`/practice/${j.id}`)
  }

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.intro}>
        <BrushTag as="h1" icon={<Target />}>
          Practice
        </BrushTag>
        <p className={pageStyles.lead}>
          Choose a jutsu, start the camera and make its signs one by one. The AI moves you on only when it confirms
          the right sign.
        </p>
      </header>

      {catalog ? (
        <>
          {unknown ? (
            <p className={pageStyles.unknown} role="status">
              There is no jutsu called “{unknown}”. Choose one of the four below.
            </p>
          ) : null}
          <Carousel
            items={list}
            getKey={(j) => j.id}
            getLabel={(j) => titleCase(j.title)}
            active={index}
            onActiveChange={select}
            label="Choose a jutsu to practise"
            noun="jutsu"
            testId="practice-carousel"
            renderItem={(j, { index: i, active }) => (
              <JutsuCard
                jutsu={j}
                catalog={catalog}
                info={info}
                index={i}
                active={active}
                onSelect={() => select(i)}
                actionHint="Practises it below."
                compact
                extra={active ? <span className={pageStyles.training}>Training now</span> : undefined}
              />
            )}
          />
          {jutsu ? <PracticeSession jutsu={jutsu} catalog={catalog} restInfo={info} loading={loading} /> : null}
        </>
      ) : loading ? (
        <div className={pageStyles.skeletonRow} aria-busy="true" aria-label="Loading the jutsu">
          {[0, 1, 2].map((i) => (
            <div key={i} className={pageStyles.skeleton} />
          ))}
        </div>
      ) : (
        <ParchmentCard title="Practice" icon={<Target />}>
          <div className={pageStyles.error} role="alert">
            <p className={pageStyles.errorTitle}>The jutsu scrolls are sealed</p>
            <p className={pageStyles.errorText}>
              {error ?? 'The AI server cannot be reached.'} Start the server (python -m shinobi.server); this page
              retries on its own.
            </p>
            <button type="button" className={pageStyles.retry} onClick={reload}>
              <RefreshCw aria-hidden="true" /> Retry now
            </button>
          </div>
        </ParchmentCard>
      )}
    </div>
  )
}

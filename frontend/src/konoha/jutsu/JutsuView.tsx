// The Jutsu page (/library, /library/:jutsuId): the four jutsu from /api/jutsu in a horizontal
// carousel, and under it the selected jutsu's hand signs. /library/<id> preselects that card.
import { RefreshCw, ScrollText } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { useDocumentTitle } from '../../components/layout/useDocumentTitle'
import { jutsuAvailability, titleCase } from '../../components/live/labels'
import { useCatalog } from '../../contexts/CatalogContext'
import { BrushTag } from '../BrushTag'
import { Carousel } from '../carousel/Carousel'
import { ParchmentCard } from '../ParchmentCard'
import { JutsuCard } from './JutsuCard'
import { JutsuDetail } from './JutsuDetail'
import { replaceUrl, selectedIndex, useSelectedJutsu } from './pageState'
import styles from './JutsuView.module.css'

export function JutsuView() {
  const { jutsuId } = useParams()
  const { catalog, info, loading, error, reload } = useCatalog()
  const [selected, setSelected] = useSelectedJutsu(jutsuId)
  const list = catalog?.jutsu ?? []
  const index = selectedIndex(list, selected)
  const jutsu = list[index] ?? null
  const unknown = catalog && jutsuId && !list.some((j) => j.id === jutsuId) ? jutsuId : null
  useDocumentTitle(jutsu ? `${titleCase(jutsu.title)} · Jutsu` : 'Jutsu')

  const select = (i: number) => {
    const j = list[i]
    if (!j) return
    setSelected(j.id)
    replaceUrl(`/library/${j.id}`)
  }

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <BrushTag as="h1" icon={<ScrollText />}>
          Jutsu Scrolls
        </BrushTag>
        <p className={styles.lead}>
          Four jutsu, each a sequence of four hand signs. Slide through the scrolls and pick one to see its signs.
        </p>
      </header>

      {catalog ? (
        <>
          {unknown ? (
            <p className={styles.unknown} role="status">
              There is no jutsu called “{unknown}”. Here are the four scrolls.
            </p>
          ) : null}
          <Carousel
            items={list}
            getKey={(j) => j.id}
            getLabel={(j) => titleCase(j.title)}
            active={index}
            onActiveChange={select}
            label="Jutsu"
            noun="jutsu"
            testId="jutsu-carousel"
            renderItem={(j, { index: i, active }) => (
              <JutsuCard
                jutsu={j}
                catalog={catalog}
                info={info}
                index={i}
                active={active}
                onSelect={() => select(i)}
                actionHint="Shows its hand signs below."
              />
            )}
          />
          {jutsu ? <JutsuDetail jutsu={jutsu} catalog={catalog} info={info} /> : null}
          <p className="visually-hidden" aria-live="polite">
            {jutsu
              ? `${titleCase(jutsu.title)} selected. ${jutsuAvailability(jutsu, catalog, info).available ? 'Ready.' : 'Training required.'}`
              : ''}
          </p>
        </>
      ) : loading ? (
        <div className={styles.skeletonRow} aria-busy="true" aria-label="Loading the jutsu">
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.skeleton} />
          ))}
        </div>
      ) : (
        <ParchmentCard title="Jutsu" icon={<ScrollText />}>
          <div className={styles.error} role="alert">
            <p className={styles.errorTitle}>The jutsu scrolls are sealed</p>
            <p className={styles.errorText}>
              {error ?? 'The AI server cannot be reached.'} Start the server (python -m shinobi.server), then retry.
            </p>
            <button type="button" className={styles.retry} onClick={reload}>
              <RefreshCw aria-hidden="true" /> Retry
            </button>
          </div>
        </ParchmentCard>
      )}
    </div>
  )
}

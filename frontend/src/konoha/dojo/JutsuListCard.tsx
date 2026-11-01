// "JUTSU" card of the dojo: the four jutsu in the API's order. Each row says whether this server can
// activate it now ("Ready" / "Training Required", from the server info) or, while a sequence is in
// progress, its live step count from FrameState.progress. Clicking a row shows its sequence below.
import { ChevronRight, RefreshCw, ScrollText } from 'lucide-react'
import { useId } from 'react'
import { jutsuAvailability, titleCase } from '../../components/live/labels'
import type { Catalog } from '../../types/catalog'
import type { FrameState, JutsuId, ServerInfo } from '../../types/protocol'
import { ParchmentCard } from '../ParchmentCard'
import { JutsuIcon } from '../../components/art/JutsuIcon'
import styles from './JutsuListCard.module.css'

export interface JutsuListCardProps {
  catalog: Catalog | null
  info: ServerInfo | null
  loading: boolean
  /** why the catalog could not be loaded */
  error: string | null
  onRetry: () => void
  /** FrameState.progress while the AI is live, else null */
  progress: FrameState['progress'] | null
  /** the jutsu shown in the sequence card */
  selected: JutsuId | null
  onSelect: (id: JutsuId) => void
  className?: string
  /** 'compact' (Live page side column): smaller rows when the card is narrow */
  density?: 'default' | 'compact'
}

export function JutsuListCard({
  catalog,
  info,
  loading,
  error,
  onRetry,
  progress,
  selected,
  onSelect,
  className,
  density = 'default',
}: JutsuListCardProps) {
  const uid = useId()
  return (
    <ParchmentCard
      title="Jutsu"
      icon={<ScrollText />}
      className={[styles.card, density === 'compact' ? styles.compact : '', className ?? ''].filter(Boolean).join(' ')}
    >
      {catalog ? (
        <ul className={styles.list} data-testid="jutsu-list" aria-label="Jutsu: choose one to see its hand signs">
          {catalog.jutsu.map((j) => {
            const done = progress?.[j.id] ?? 0
            const total = j.steps.length
            const avail = jutsuAvailability(j, catalog, info)
            const isSelected = selected === j.id
            const reasonId = `${uid}-${j.id}-reason`
            return (
              <li key={j.id}>
                <button
                  type="button"
                  className={[styles.row, isSelected ? styles.selected : '', done > 0 ? styles.progressing : '']
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={isSelected}
                  aria-describedby={avail.available ? undefined : reasonId}
                  onClick={() => onSelect(j.id)}
                  data-testid={`jutsu-row-${j.id}`}
                  data-done={done}
                  data-available={avail.available ? 'true' : 'false'}
                >
                  {/* the same animated jutsu icon as everywhere else (components/art/JutsuIcon) */}
                  <span className={styles.icon} aria-hidden="true">
                    <JutsuIcon jutsu={j.id} />
                  </span>
                  <span className={styles.text}>
                    <span className={styles.name}>{titleCase(j.title)}</span>
                    <span className={styles.sub}>{j.name}</span>
                  </span>
                  {done > 0 ? (
                    <span className={styles.count} data-testid={`jutsu-count-${j.id}`}>
                      {done}/{total}
                      <span className="visually-hidden"> steps done</span>
                    </span>
                  ) : avail.available ? (
                    <span className={[styles.pill, styles.ready].join(' ')}>Ready</span>
                  ) : (
                    <span className={[styles.pill, styles.train].join(' ')} title={avail.reason ?? undefined}>
                      Training Required
                    </span>
                  )}
                  <ChevronRight className={styles.chevron} aria-hidden="true" />
                </button>
                {avail.available ? null : (
                  <span id={reasonId} className="visually-hidden">
                    {avail.reason}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      ) : loading ? (
        <ul className={styles.list} aria-busy="true" aria-label="Loading the jutsu">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className={styles.skeleton} />
          ))}
        </ul>
      ) : (
        <div className={styles.error} role="alert">
          <p className={styles.errorTitle}>The jutsu scrolls are sealed</p>
          <p className={styles.errorText}>
            {error ?? 'The AI server cannot be reached.'} Start the server (python -m shinobi.server), then retry.
          </p>
          <button type="button" className={styles.retry} onClick={onRetry}>
            <RefreshCw aria-hidden="true" /> Retry
          </button>
        </div>
      )}
    </ParchmentCard>
  )
}

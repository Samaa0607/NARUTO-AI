// One jutsu card of the carousel (Jutsu and Practice pages): the animated jutsu icon (JutsuIcon, the
// same one as everywhere else), the brush name, the kanji, the Official / Custom badge with its meaning,
// a short description and whether this server can activate it ("Ready" / "Training Required").
// The whole card selects it: its heading holds the button, stretched over the card.
import { BadgeCheck, PenTool } from 'lucide-react'
import { useId, type CSSProperties, type ReactNode } from 'react'
import { JutsuIcon } from '../../components/art/JutsuIcon'
import { jutsuVisual } from '../../components/art/jutsuVisuals'
import { jutsuAvailability, titleCase } from '../../components/live/labels'
import type { Catalog, JutsuInfo } from '../../types/catalog'
import type { ServerInfo } from '../../types/protocol'
import { sequenceKind } from './sequenceKind'
import styles from './JutsuCard.module.css'

export interface JutsuCardProps {
  jutsu: JutsuInfo
  catalog: Catalog
  info: ServerInfo | null
  index: number
  active: boolean
  onSelect: () => void
  /** what selecting does, for the button's description ("Show its hand signs") */
  actionHint: string
  /** shown in the card's footer on the right (e.g. live progress) */
  extra?: ReactNode
  /** shorter card (Practice page): smaller stage, no description */
  compact?: boolean
}

export function JutsuCard({ jutsu, catalog, info, index, active, onSelect, actionHint, extra, compact = false }: JutsuCardProps) {
  const uid = useId()
  const visual = jutsuVisual(jutsu.id)
  const avail = jutsuAvailability(jutsu, catalog, info)
  const kind = sequenceKind(jutsu.official)
  const name = titleCase(jutsu.title)
  const descId = `${uid}-desc`
  return (
    <article
      className={[styles.card, active ? styles.active : '', compact ? styles.compact : ''].filter(Boolean).join(' ')}
      style={{ '--jc': visual.color, '--jc2': visual.color2 } as CSSProperties}
      data-testid={`jutsu-card-${jutsu.id}`}
      data-active={active ? 'true' : 'false'}
    >
      <div className={styles.stage}>
        <span className={styles.glyph} aria-hidden="true">
          {visual.glyph}
        </span>
        <span className={styles.index} aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className={[styles.badge, jutsu.official ? styles.official : styles.custom].join(' ')} title={kind.meaning}>
          {jutsu.official ? <BadgeCheck aria-hidden="true" /> : <PenTool aria-hidden="true" />}
          {kind.label}
        </span>
        <span className={styles.seal} aria-hidden="true">
          <JutsuIcon jutsu={jutsu.id} />
        </span>
      </div>

      <div className={styles.body}>
        <h3 className={styles.name}>
          <button
            type="button"
            className={styles.hit}
            onClick={onSelect}
            aria-pressed={active}
            aria-describedby={descId}
            data-testid={`jutsu-select-${jutsu.id}`}
          >
            {name}
          </button>
        </h3>
        <p className={styles.sub}>
          <span>{jutsu.name}</span>
          <span className={styles.kanji} lang="ja">
            {jutsu.kanji}
          </span>
        </p>
        {compact ? null : <p className={styles.desc}>{jutsu.description}</p>}
        <p className={styles.meaning}>{kind.meaning}</p>
        <div className={styles.foot}>
          <span
            className={[styles.status, avail.available ? styles.ready : styles.train].join(' ')}
            title={avail.reason ?? undefined}
            data-testid={`jutsu-status-${jutsu.id}`}
          >
            <span className={styles.statusDot} aria-hidden="true" />
            {avail.available ? 'Ready' : 'Training Required'}
          </span>
          {extra ?? <span className={styles.signs}>{jutsu.steps.length} hand signs</span>}
        </div>
        <span id={descId} className="visually-hidden">
          {kind.label}. {avail.available ? 'Ready on this server.' : `Training required: ${avail.reason ?? ''}`} {actionHint}
        </span>
      </div>
    </article>
  )
}

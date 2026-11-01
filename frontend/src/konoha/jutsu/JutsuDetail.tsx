// The parchment section under the Jutsu carousel: the selected jutsu's four hand signs (tiles with
// line art, names and cues), where the sequence comes from (provenance), whether this server can
// recognise it now, and the Practice button.
import { AnimatePresence, motion } from 'framer-motion'
import { BadgeCheck, Hand, Info, PenTool, Target, TriangleAlert } from 'lucide-react'
import type { CSSProperties } from 'react'
import { jutsuVisual } from '../../components/art/jutsuVisuals'
import { jutsuAvailability, titleCase } from '../../components/live/labels'
import type { Catalog, JutsuInfo } from '../../types/catalog'
import type { ServerInfo } from '../../types/protocol'
import { BrushButton } from '../BrushButton'
import { ParchmentCard } from '../ParchmentCard'
import { sequenceKind } from './sequenceKind'
import { ArtCredit, SignSteps } from './SignSteps'
import styles from './JutsuDetail.module.css'

export interface JutsuDetailProps {
  jutsu: JutsuInfo
  catalog: Catalog
  info: ServerInfo | null
}

export function JutsuDetail({ jutsu, catalog, info }: JutsuDetailProps) {
  const visual = jutsuVisual(jutsu.id)
  const avail = jutsuAvailability(jutsu, catalog, info)
  const kind = sequenceKind(jutsu.official)
  const name = titleCase(jutsu.title)
  return (
    <ParchmentCard
      title="Hand Signs"
      icon={<Hand />}
      className={styles.card}
      style={{ '--jc': visual.color } as CSSProperties}
      aria-label={`${name}: hand signs`}
      data-testid="jutsu-detail"
      data-jutsu={jutsu.id}
      actions={
        <BrushButton to={`/practice/${jutsu.id}`} icon={<Target />} data-testid="practice-button">
          Practice
        </BrushButton>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={jutsu.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          <header className={styles.head}>
            <div className={styles.titles}>
              <h2 className={styles.title}>{name}</h2>
              <p className={styles.sub}>
                {jutsu.name}{' '}
                <span className={styles.kanji} lang="ja">
                  {jutsu.kanji}
                </span>
              </p>
            </div>
            <span className={[styles.kind, jutsu.official ? styles.official : styles.custom].join(' ')}>
              {jutsu.official ? <BadgeCheck aria-hidden="true" /> : <PenTool aria-hidden="true" />}
              {kind.label}
            </span>
          </header>

          <p className={styles.lead}>
            Make the {jutsu.steps.length} signs in this order and hold each one still for about a second. The same
            signs in another order do nothing.
          </p>

          <SignSteps jutsu={jutsu} catalog={catalog} />

          <div className={styles.notes}>
            <div className={styles.provenance}>
              <Info aria-hidden="true" />
              <div>
                <p className={styles.tag}>{jutsu.tag}</p>
                <p className={styles.provText}>{jutsu.provenance}</p>
              </div>
            </div>
            {avail.available ? null : (
              <div className={styles.training} role="note" data-testid="training-note">
                <TriangleAlert aria-hidden="true" />
                <p>
                  <strong>Training Required.</strong> {avail.reason} You can still learn the signs here.
                </p>
              </div>
            )}
          </div>

          <ArtCredit signs={jutsu.steps.map((s) => catalog.signs[s.sign])} className={styles.credit} />
        </motion.div>
      </AnimatePresence>
    </ParchmentCard>
  )
}

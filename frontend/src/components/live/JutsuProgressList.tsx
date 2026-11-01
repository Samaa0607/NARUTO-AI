// Live Demo: all four jutsu, their progress in the current sequence (backend progress) and, honestly,
// whether this server can activate them right now.
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Catalog } from '../../types/catalog'
import type { FrameState, JutsuId, ServerInfo } from '../../types/protocol'
import { jutsuVisual } from '../art/jutsuVisuals'
import { jutsuAvailability, titleCase } from './labels'
import styles from './JutsuProgressList.module.css'

export interface JutsuProgressListProps {
  catalog: Catalog
  info: ServerInfo | null
  progress: FrameState['progress'] | null
  /** the jutsu whose steps are shown in the big track */
  focus: JutsuId | null
  /** the jutsu with the most steps done right now */
  leader: JutsuId | null
  onFocus: (id: JutsuId) => void
}

export function JutsuProgressList({ catalog, info, progress, focus, leader, onFocus }: JutsuProgressListProps) {
  return (
    <ul className={styles.list} data-testid="jutsu-list">
      {catalog.jutsu.map((j) => {
        const visual = jutsuVisual(j.id)
        const done = progress?.[j.id] ?? 0
        const total = j.steps.length
        const avail = jutsuAvailability(j, catalog, info)
        const isFocus = focus === j.id
        return (
          <li key={j.id}>
            <button
              type="button"
              className={[styles.row, isFocus ? styles.focus : '', leader === j.id ? styles.leader : ''].filter(Boolean).join(' ')}
              style={{ '--jc': visual.color, '--jc2': visual.color2 } as CSSProperties}
              aria-pressed={isFocus}
              onClick={() => onFocus(j.id)}
              data-testid={`jutsu-row-${j.id}`}
              data-done={done}
              data-available={avail.available ? 'true' : 'false'}
            >
              <span className={styles.glyph} aria-hidden="true">
                {visual.glyph}
              </span>
              <span className={styles.main}>
                <span className={styles.top}>
                  <span className={styles.title}>{titleCase(j.title)}</span>
                  <span className={styles.pips} aria-label={`${done} of ${total} steps done`}>
                    {j.steps.map((s, i) => (
                      <span key={s.step} className={[styles.pip, i < done ? styles.pipOn : ''].join(' ')} />
                    ))}
                  </span>
                </span>
                {avail.available ? (
                  <span className={[styles.state, styles.ok].join(' ')}>
                    <CheckCircle2 aria-hidden="true" /> Can be activated
                  </span>
                ) : (
                  <span className={[styles.state, styles.warn].join(' ')} title={avail.reason ?? undefined}>
                    <AlertTriangle aria-hidden="true" /> Not activatable yet
                  </span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// States honestly which jutsu this server can activate right now and why the others cannot
// (from the catalog / live server info: jutsu_available, recognizable, missing_signs).
import { Info } from 'lucide-react'
import type { Catalog, JutsuInfo } from '../../types/catalog'
import type { ServerInfo } from '../../types/protocol'
import { jutsuAvailability, titleCase } from './labels'
import styles from './AvailabilityNotice.module.css'

export interface AvailabilityNoticeProps {
  catalog: Catalog
  info: ServerInfo | null
  /** only this jutsu (Practice); default: all */
  jutsu?: JutsuInfo
  className?: string
}

const listText = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

export function AvailabilityNotice({ catalog, info, jutsu, className }: AvailabilityNoticeProps) {
  const all = (jutsu ? [jutsu] : catalog.jutsu).map((j) => ({ j, a: jutsuAvailability(j, catalog, info) }))
  const blocked = all.filter((x) => !x.a.available)
  if (blocked.length === 0) return null
  const ready = all.filter((x) => x.a.available).map((x) => titleCase(x.j.title))
  const cls = [styles.notice, className ?? ''].filter(Boolean).join(' ')

  if (jutsu) {
    const a = blocked[0].a
    const firstBlocked = jutsu.steps.findIndex((s) => a.missing.includes(s.sign))
    return (
      <div className={cls} role="note" data-testid="availability-notice">
        <Info aria-hidden="true" />
        <p>
          <strong>{titleCase(jutsu.title)} cannot be completed on this server yet.</strong> {a.reason}{' '}
          {firstBlocked > 0
            ? `You can practise steps 1–${firstBlocked}; step ${firstBlocked + 1} will not be detected.`
            : firstBlocked === 0
              ? 'Its first sign cannot be detected yet, so the sequence will not advance.'
              : ''}
        </p>
      </div>
    )
  }

  return (
    <div className={cls} role="note" data-testid="availability-notice">
      <Info aria-hidden="true" />
      <p>
        <strong>
          {ready.length > 0 ? `${listText(ready)} can be activated now.` : 'No jutsu can be activated on this server right now.'}
        </strong>{' '}
        {blocked.map((x) => `${titleCase(x.j.title)}: ${x.a.reason}`).join(' ')}
      </p>
    </div>
  )
}

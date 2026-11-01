// A parchment card with an optional black brush tag as its title (the reference's "LIVE CAMERA",
// "JUTSU" headers).
import type { HTMLAttributes, ReactNode } from 'react'
import { BrushTag } from './BrushTag'
import styles from './ParchmentCard.module.css'

export interface ParchmentCardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** brush-tag title shown over the top-left edge */
  title?: ReactNode
  /** icon inside the brush tag (lucide icon or svg) */
  icon?: ReactNode
  /** elements on the right of the header row (e.g. progress) */
  actions?: ReactNode
}

export function ParchmentCard({ title, icon, actions, className, children, ...rest }: ParchmentCardProps) {
  return (
    <section className={[styles.card, title ? styles.titled : '', className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {title ? (
        <header className={styles.header}>
          <BrushTag icon={icon}>{title}</BrushTag>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
      ) : null}
      <div className={styles.body}>{children}</div>
    </section>
  )
}

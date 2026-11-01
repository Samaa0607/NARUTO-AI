// Black brush-stroke label with a white hand-lettered title (card headers in the reference).
import type { ReactNode } from 'react'
import styles from './BrushTag.module.css'

export interface BrushTagProps {
  icon?: ReactNode
  children: ReactNode
  /** heading level for the title text */
  as?: 'h1' | 'h2' | 'h3'
}

export function BrushTag({ icon, children, as: Heading = 'h2' }: BrushTagProps) {
  return (
    <div className={styles.tag}>
      {/* a dry-brush stroke: ragged left and right ends, a few bristle gaps */}
      <svg className={styles.stroke} viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true">
        <path d="M6,14 C40,6 120,9 210,6 C250,5 278,9 296,4 L288,22 L299,30 L286,40 L296,52 C250,57 170,53 100,56 C60,58 30,55 4,58 L12,44 L2,34 L10,24 Z" />
        <path className={styles.bristle} d="M30,20 L260,17 M20,46 L240,49" />
      </svg>
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      <Heading className={styles.title}>{children}</Heading>
    </div>
  )
}

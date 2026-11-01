import type { ReactNode } from 'react'
import styles from './SectionHeading.module.css'

export interface SectionHeadingProps {
  /** small caps line above the title */
  eyebrow?: ReactNode
  title: ReactNode
  /** decorative kanji drawn faintly behind the title (hidden from screen readers) */
  kanji?: string
  description?: ReactNode
  /** heading level (default h2); the size follows the level */
  as?: 'h1' | 'h2' | 'h3'
  align?: 'left' | 'center'
  /** elements shown on the right (or under the text when centred) */
  actions?: ReactNode
  id?: string
  className?: string
}

export function SectionHeading({
  eyebrow,
  title,
  kanji,
  description,
  as: Tag = 'h2',
  align = 'left',
  actions,
  id,
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={[styles.heading, styles[Tag], align === 'center' ? styles.center : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.text}>
        {kanji ? (
          <span className={styles.kanji} aria-hidden="true">
            {kanji}
          </span>
        ) : null}
        {eyebrow ? (
          <p className={styles.eyebrow}>
            <span className={styles.mark} aria-hidden="true" />
            {eyebrow}
          </p>
        ) : null}
        <Tag id={id} className={styles.title}>
          {title}
        </Tag>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  )
}

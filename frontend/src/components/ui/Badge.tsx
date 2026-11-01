import type { HTMLAttributes, ReactNode } from 'react'
import styles from './Badge.module.css'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'official' | 'custom'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  icon?: ReactNode
  /** sm (default) or md */
  size?: 'sm' | 'md'
  /** small pulsing status dot before the label */
  dot?: boolean
}

export function Badge({ tone = 'neutral', icon, size = 'sm', dot = false, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={[styles.badge, styles[tone], size === 'md' ? styles.md : '', className ?? ''].filter(Boolean).join(' ')}
      {...rest}
    >
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      {children}
    </span>
  )
}

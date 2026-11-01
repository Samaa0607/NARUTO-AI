import type { HTMLAttributes, ReactNode } from 'react'
import styles from './Panel.module.css'

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode
  icon?: ReactNode
  /** elements shown on the right of the title row */
  actions?: ReactNode
  /** stronger chakra border glow */
  glow?: boolean
  /** inner spacing (default md) */
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export function Panel({ title, icon, actions, glow = false, padding = 'md', className, children, ...rest }: PanelProps) {
  const cls = [styles.panel, glow ? styles.glow : '', styles[`pad-${padding}`], className ?? '']
    .filter(Boolean)
    .join(' ')
  return (
    <section className={cls} {...rest}>
      {title || actions ? (
        <header className={styles.header}>
          {icon ? <span className={styles.icon}>{icon}</span> : null}
          {title ? <h3 className={styles.title}>{title}</h3> : null}
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  )
}

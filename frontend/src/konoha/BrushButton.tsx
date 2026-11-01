// Buttons of the new look: an orange brush-stroke primary and a quiet paper secondary.
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './BrushButton.module.css'

export interface BrushButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
  icon?: ReactNode
  /** render as a router link */
  to?: string
}

export function BrushButton({ variant = 'primary', icon, to, className, children, type = 'button', ...rest }: BrushButtonProps) {
  const cls = [styles.button, styles[variant], className ?? ''].filter(Boolean).join(' ')
  const content = (
    <>
      {variant === 'primary' ? (
        <svg className={styles.stroke} viewBox="0 0 200 56" preserveAspectRatio="none" aria-hidden="true">
          <path d="M4,10 C50,4 140,7 196,3 L190,18 L198,28 L189,40 L197,52 C140,56 60,52 2,55 L9,41 L1,29 L8,19 Z" />
        </svg>
      ) : null}
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      {children ? <span className={styles.label}>{children}</span> : null}
    </>
  )
  if (to && !rest.disabled) {
    return (
      <Link to={to} className={cls}>
        {content}
      </Link>
    )
  }
  return (
    <button type={type} className={cls} {...rest}>
      {content}
    </button>
  )
}

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** icon shown before the label (e.g. a lucide-react icon) */
  icon?: ReactNode
  /** icon shown after the label (e.g. an arrow) */
  iconEnd?: ReactNode
  /** render as a router link to this path instead of a <button> */
  to?: string
  /** render as an external link (opens in a new tab) */
  href?: string
  loading?: boolean
  /** stretch to the width of the container */
  block?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconEnd,
  to,
  href,
  loading = false,
  block = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = [
    styles.button,
    styles[variant],
    styles[size],
    loading ? styles.loading : '',
    block ? styles.block : '',
    !children ? styles.iconOnly : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
  const content = (
    <>
      {variant === 'primary' ? <span className={styles.sheen} aria-hidden="true" /> : null}
      {loading ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : icon ? (
        <span className={styles.icon}>{icon}</span>
      ) : null}
      {children ? <span className={styles.label}>{children}</span> : null}
      {iconEnd ? <span className={`${styles.icon} ${styles.iconEnd}`}>{iconEnd}</span> : null}
    </>
  )
  const label = rest['aria-label']
  if (to && !disabled) {
    return (
      <Link to={to} className={cls} aria-label={label} title={rest.title}>
        {content}
      </Link>
    )
  }
  if (href && !disabled) {
    return (
      <a href={href} className={cls} target="_blank" rel="noreferrer noopener" aria-label={label} title={rest.title}>
        {content}
      </a>
    )
  }
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  )
}

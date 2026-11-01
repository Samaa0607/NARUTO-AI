import { RefreshCw, ServerOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button'
import styles from './StatusMessage.module.css'

export type StatusTone = 'neutral' | 'error' | 'warning'

export interface StatusMessageProps {
  tone?: StatusTone
  icon?: ReactNode
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
  /** smaller, left-aligned variant for use inside a section */
  compact?: boolean
  className?: string
}

/** A centred message with an icon seal: empty results, errors, unavailable features. */
export function StatusMessage({ tone = 'neutral', icon, title, children, actions, compact = false, className }: StatusMessageProps) {
  return (
    <div
      className={[styles.status, styles[tone], compact ? styles.compact : '', className ?? ''].filter(Boolean).join(' ')}
      role={tone === 'error' ? 'alert' : undefined}
    >
      {icon ? (
        <div className={styles.seal} aria-hidden="true">
          <span className={styles.ring} />
          <span className={styles.icon}>{icon}</span>
        </div>
      ) : null}
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {children ? <div className={styles.text}>{children}</div> : null}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </div>
  )
}

export interface ErrorStateProps {
  title?: ReactNode
  /** the error text (e.g. CatalogContext.error) */
  message?: ReactNode
  onRetry?: () => void
  retrying?: boolean
  compact?: boolean
  children?: ReactNode
  className?: string
}

/** "The server is offline" with a Retry button. */
export function ErrorState({
  title = 'The SHINOBI AI server is offline',
  message,
  onRetry,
  retrying = false,
  compact = false,
  children,
  className,
}: ErrorStateProps) {
  return (
    <StatusMessage
      tone="error"
      icon={<ServerOff />}
      title={title}
      compact={compact}
      className={className}
      actions={
        onRetry ? (
          <Button variant="secondary" size="sm" icon={<RefreshCw />} onClick={onRetry} loading={retrying}>
            Retry
          </Button>
        ) : null
      }
    >
      {message ? <p>{message}</p> : null}
      {children}
    </StatusMessage>
  )
}

export interface EmptyStateProps {
  icon?: ReactNode
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
  compact?: boolean
  className?: string
}

export function EmptyState({ icon, title, children, actions, compact, className }: EmptyStateProps) {
  return (
    <StatusMessage icon={icon} title={title} actions={actions} compact={compact} className={className}>
      {children}
    </StatusMessage>
  )
}

import type { SocketStatus } from '../../services/socket'
import { connectionText, formatMs } from './labels'
import styles from './ConnectionPill.module.css'

export interface ConnectionPillProps {
  status: SocketStatus
  latencyMs?: number | null
  paused?: boolean
  className?: string
}

/** Small glassy status pill: AI live · 84 ms / Connecting / Reconnecting / AI offline / Server busy. */
export function ConnectionPill({ status, latencyMs = null, paused = false, className }: ConnectionPillProps) {
  const text = connectionText(status)
  const label = paused && status.state === 'connected' ? 'Paused' : text.label
  return (
    <span
      className={[styles.pill, styles[text.tone], className ?? ''].filter(Boolean).join(' ')}
      data-testid="connection-pill"
      data-state={status.state}
      title={text.detail ?? undefined}
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label} role="status">
        {label}
      </span>
      {status.state === 'connected' && latencyMs !== null ? (
        <span className={styles.meta} data-testid="latency">
          <span className="visually-hidden">round trip </span>
          {formatMs(latencyMs)}
        </span>
      ) : null}
    </span>
  )
}

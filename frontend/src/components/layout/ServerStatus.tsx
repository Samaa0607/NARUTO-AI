import { useCatalog } from '../../contexts/CatalogContext'
import styles from './ServerStatus.module.css'

export interface ServerStatusProps {
  /** show the text label (otherwise only the dot, with an accessible name) */
  showLabel?: boolean
  /** hide the label on narrower desktop widths (top bar) */
  responsive?: boolean
  className?: string
}

/** State of the last request to the Python server (from CatalogContext). Offline = click to retry. */
export function ServerStatus({ showLabel = true, responsive = false, className }: ServerStatusProps) {
  const { info, loading, error, reload } = useCatalog()
  const state = loading ? 'loading' : error ? 'offline' : info ? 'online' : 'offline'
  const label = state === 'loading' ? 'Connecting…' : state === 'online' ? 'Server online' : 'Server offline'
  const detail =
    state === 'online' && info
      ? `${info.name} ${info.version} · seal detector ${info.yolox ? 'loaded' : 'not loaded'} · landmark model ${
          info.landmark_model ? 'loaded' : 'not loaded'
        }`
      : state === 'offline'
        ? `${error ?? 'The SHINOBI AI server cannot be reached.'} Click to retry.`
        : 'Contacting the SHINOBI AI server'
  const cls = [
    styles.status,
    styles[state],
    showLabel ? '' : styles.dotOnly,
    responsive ? styles.responsive : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
  const content = (
    <>
      <span className={styles.dot} aria-hidden="true" />
      {showLabel ? <span className={styles.label}>{label}</span> : <span className="visually-hidden">{label}</span>}
    </>
  )
  if (state === 'offline') {
    return (
      <button type="button" className={cls} onClick={reload} title={detail} aria-label={`${label}. Retry`}>
        {content}
      </button>
    )
  }
  return (
    <span className={cls} title={detail} role="status">
      {content}
    </span>
  )
}

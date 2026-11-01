// What the AI sees right now, straight from the latest FrameState: the fused sign (source and
// confidence), the stabilizer's hold progress, the confirmed signs of the sequence in progress,
// hands, and the connection numbers. Nothing is shown while the session is not live.
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, Check, Gauge, Hand, Radar, Timer } from 'lucide-react'
import type { ShinobiSession } from '../../hooks/useShinobiSession'
import type { Catalog } from '../../types/catalog'
import { Panel } from '../ui/Panel'
import { SignArt } from '../ui/SignArt'
import { ConnectionPill } from './ConnectionPill'
import { SOURCE_LABEL, connectionText, formatFps, formatMs, signInfo, signName } from './labels'
import styles from './RecognitionPanel.module.css'

export interface RecognitionPanelProps {
  session: ShinobiSession
  catalog: Catalog | null
  /** hide the confirmed-history row (practice mode shows its own track) */
  compact?: boolean
  className?: string
}

export function RecognitionPanel({ session, catalog, compact = false, className }: RecognitionPanelProps) {
  const frame = session.live ? session.frame : null
  const status = connectionText(session.status)
  const sign = frame?.sign
  const seen = sign && sign.name !== 'idle' ? sign.name : null
  const seenInfo = signInfo(catalog, seen)
  const holding = frame?.candidate && frame.candidate !== frame.latched ? frame.candidate : null
  const latched = frame?.latched ?? null
  const holdPct = Math.round(Math.min(1, Math.max(0, frame?.hold ?? 0)) * 100)

  return (
    <Panel
      className={[styles.panel, className ?? ''].filter(Boolean).join(' ')}
      title="AI vision"
      icon={<Radar />}
      actions={<ConnectionPill status={session.status} />}
      data-testid="recognition-panel"
    >
      {!frame ? (
        <div className={styles.offline} data-testid="recognition-offline">
          <p className={styles.offlineTitle}>
            {session.status.state === 'idle'
              ? 'Start the camera to see what the AI recognises.'
              : session.status.state === 'connected'
                ? 'Waiting for the first processed frame…'
                : 'No recognition while the AI is not live.'}
          </p>
          {session.status.state !== 'idle' && session.status.state !== 'connected' && status.detail ? (
            <p className={styles.offlineText}>{status.detail}</p>
          ) : null}
        </div>
      ) : (
        <>
          <div className={styles.now} data-testid="current-sign" data-sign={sign?.name ?? 'idle'}>
            <div className={styles.art}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={seen ?? 'idle'}
                  className={styles.artInner}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.04 }}
                  transition={{ duration: 0.18 }}
                >
                  {seenInfo ? (
                    <SignArt src={seenInfo.art} alt={`${seenInfo.name} hand sign`} tint="var(--accent-2)" glow />
                  ) : (
                    <div className={styles.noSign} aria-hidden="true">
                      <Hand />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
            <div className={styles.nowText}>
              <span className={styles.kicker}>AI sees</span>
              <span className={[styles.signName, seen ? '' : styles.idle].join(' ')} aria-live="off">
                {seen ? signName(catalog, seen) : 'No sign'}
              </span>
              {seenInfo ? <span className={styles.jp}>{seenInfo.jp}</span> : null}
              <span className={styles.source}>
                {seen && sign ? (
                  <>
                    {SOURCE_LABEL[sign.source] ?? sign.source}
                    <span className={styles.conf}>{Math.round(sign.score * 100)}%</span>
                  </>
                ) : frame.hands === 0 ? (
                  'No hands in view'
                ) : (
                  'Hands in view, no sign yet'
                )}
              </span>
            </div>
          </div>

          <div className={styles.hold} data-testid="hold">
            <div className={styles.holdHead}>
              <span>
                {holding ? (
                  <>
                    Holding <strong>{signName(catalog, holding)}</strong>
                  </>
                ) : latched ? (
                  <>
                    <Check className={styles.check} aria-hidden="true" /> <strong>{signName(catalog, latched)}</strong>{' '}
                    confirmed
                  </>
                ) : (
                  'Hold a sign steady to confirm it'
                )}
              </span>
              {holding ? <span className={styles.pct}>{holdPct}%</span> : null}
            </div>
            <div
              className={styles.bar}
              role="progressbar"
              aria-label="Hold progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={holding ? holdPct : latched ? 100 : 0}
            >
              <span
                className={[styles.fill, latched && !holding ? styles.fillDone : ''].join(' ')}
                style={{ transform: `scaleX(${holding ? holdPct / 100 : latched ? 1 : 0})` }}
              />
            </div>
          </div>

          {!compact ? (
            <div className={styles.history}>
              <span className={styles.kicker}>Confirmed in this sequence</span>
              <ol className={styles.chips} data-testid="history">
                {frame.history.length === 0 ? <li className={styles.chipEmpty}>none yet</li> : null}
                <AnimatePresence initial={false}>
                  {frame.history.map((s, i) => (
                    <motion.li
                      key={`${i}-${s}`}
                      className={styles.chip}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {signName(catalog, s)}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ol>
            </div>
          ) : null}
        </>
      )}

      <dl className={styles.stats}>
        <div>
          <dt>
            <Hand aria-hidden="true" /> Hands
          </dt>
          <dd data-testid="hands">{frame ? frame.hands : '—'}</dd>
        </div>
        <div>
          <dt>
            <Timer aria-hidden="true" /> Latency
          </dt>
          <dd data-testid="stat-latency">{formatMs(session.latencyMs)}</dd>
        </div>
        <div>
          <dt>
            <Gauge aria-hidden="true" /> AI fps
          </dt>
          <dd data-testid="stat-fps">{formatFps(session.serverFps)}</dd>
        </div>
        <div>
          <dt>
            <Activity aria-hidden="true" /> Cooldown
          </dt>
          <dd>{frame && frame.cooldown > 0 ? `${frame.cooldown.toFixed(1)} s` : frame ? 'ready' : '—'}</dd>
        </div>
      </dl>
    </Panel>
  )
}

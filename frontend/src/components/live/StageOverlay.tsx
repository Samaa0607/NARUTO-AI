// Everything drawn over the live video, all driven by the backend:
//   - the cinematic activation (only on a `jutsu` event; a compact banner while the effect runs;
//     gone on that effect's `effect_end`)
//   - toasts: a gentle note on a wrong sign (`wrong_sign`, progress kept) and the reset notice of a
//     timeout (`sequence_failed`)
//   - the Shadow Clone "not enough room" notice (FrameState.effect.crowded)
import { AnimatePresence, motion } from 'framer-motion'
import { TimerOff, TriangleAlert, Users, X, XCircle } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import type { Catalog } from '../../types/catalog'
import type { FrameState } from '../../types/protocol'
import { JutsuIcon } from '../art/JutsuIcon'
import { jutsuVisual } from '../art/jutsuVisuals'
import type { Activation, FailureToast, LiveEvents } from './useLiveEvents'
import styles from './StageOverlay.module.css'

export interface StageOverlayProps {
  events: LiveEvents
  catalog: Catalog | null
  frame: FrameState | null
}

export function StageOverlay({ events, catalog, frame }: StageOverlayProps) {
  const crowded = frame?.effect?.name === 'shadow_clone' && frame.effect.crowded === true
  return (
    <>
      <ActivationOverlay activation={events.activation} catalog={catalog} />
      <FailureToasts toasts={events.toasts} onDismiss={events.dismissToast} />
      <AnimatePresence>
        {crowded ? (
          <motion.div
            key="crowded"
            className={styles.crowded}
            role="status"
            data-testid="crowded-notice"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.25 }}
          >
            <Users aria-hidden="true" />
            <span>Not enough room for all 10 clones — step back or turn your device to landscape.</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}

function ActivationOverlay({ activation, catalog }: { activation: Activation | null; catalog: Catalog | null }) {
  const { motion: motionLevel } = useSettings()
  const instant = motionLevel === 'off'
  const jutsu = activation ? catalog?.jutsu.find((j) => j.id === activation.jutsu) : undefined
  const visual = jutsuVisual(activation?.jutsu ?? '')
  const title = jutsu?.title ?? activation?.jutsu.replace(/_/g, ' ').toUpperCase() ?? ''
  const kanji = jutsu?.kanji ?? ''
  const style = { '--jc': visual.color, '--jc2': visual.color2 } as CSSProperties
  const t = (d: number) => (instant ? { duration: 0 } : { duration: d, ease: [0.16, 1, 0.3, 1] as const })

  return (
    <>
      <AnimatePresence>
        {activation && activation.phase === 'reveal' ? (
          <motion.div
            key={`reveal-${activation.key}`}
            className={styles.reveal}
            style={style}
            data-testid="jutsu-overlay"
            data-jutsu={activation.jutsu}
            data-phase="reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={t(0.35)}
          >
            {/* a light band near the top: the charge at the hands below stays visible */}
            <div className={styles.band}>
              <motion.span
                className={styles.burst}
                aria-hidden="true"
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={t(0.8)}
              />
              <motion.span
                className={styles.slash}
                aria-hidden="true"
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: [0, 1, 0.8] }}
                transition={t(0.55)}
              />
              <div className={styles.revealBody}>
                {kanji ? (
                  <motion.p
                    className={styles.kanji}
                    lang="ja"
                    initial={{ opacity: 0, y: 18, filter: 'blur(8px)', letterSpacing: '0.5em' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)', letterSpacing: '0.08em' }}
                    transition={t(0.7)}
                  >
                    {kanji}
                  </motion.p>
                ) : null}
                <motion.h2
                  className={styles.title}
                  initial={{ opacity: 0, scale: 1.25 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={instant ? { duration: 0 } : { duration: 0.5, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
                >
                  {title}
                </motion.h2>
                {jutsu ? (
                  <motion.p
                    className={styles.name}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={instant ? { duration: 0 } : { duration: 0.4, delay: 0.3 }}
                  >
                    {jutsu.name}
                  </motion.p>
                ) : null}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {activation && activation.phase !== 'reveal' ? (
          <motion.div
            key={`banner-${activation.key}`}
            className={styles.banner}
            style={style}
            data-testid="jutsu-banner"
            data-jutsu={activation.jutsu}
            data-phase={activation.phase}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: activation.phase === 'ending' ? 0.55 : 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={t(0.35)}
          >
            <JutsuIcon jutsu={activation.jutsu} size={34} animated={!instant} />
            <span className={styles.bannerText}>
              <span className={styles.bannerTitle}>{title}</span>
              <span className={styles.bannerState}>{activation.phase === 'ending' ? 'fading' : 'active'}</span>
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}

function FailureToasts({ toasts, onDismiss }: { toasts: FailureToast[]; onDismiss: (id: number) => void }) {
  return (
    <div className={styles.toasts}>
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            className={[styles.toast, toast.kind === 'wrong_sign' ? styles.toastWarn : ''].filter(Boolean).join(' ')}
            data-testid="failure-toast"
            data-reason={toast.kind}
            initial={{ opacity: 0, y: -14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.24 }}
          >
            <span className={styles.toastIcon} aria-hidden="true">
              {toast.kind === 'timeout' ? <TimerOff /> : toast.kind === 'wrong_sign' ? <TriangleAlert /> : <XCircle />}
            </span>
            <span className={styles.toastText}>
              <span className={styles.toastTitle}>{toast.title}</span>
              <span className={styles.toastDetail}>{toast.detail}</span>
            </span>
            <button type="button" className={styles.toastClose} onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
              <X aria-hidden="true" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

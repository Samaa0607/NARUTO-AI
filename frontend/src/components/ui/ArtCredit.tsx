import type { SignInfo } from '../../types/catalog'
import styles from './ArtCredit.module.css'

export interface ArtCreditProps {
  /** the signs whose drawings are shown (decides which credits apply) */
  signs?: readonly (SignInfo | undefined)[]
  className?: string
}

/**
 * Licence line for the hand-seal drawings. The official seals are Schlum's line art (Wikimedia
 * Commons, CC BY-SA 4.0); the custom Rasengan palm is drawn by SHINOBI AI from a recorded pose.
 */
export function ArtCredit({ signs, className }: ArtCreditProps) {
  const list = (signs ?? []).filter((s): s is SignInfo => Boolean(s))
  const commons = list.length === 0 || list.some((s) => s.official)
  const own = list.some((s) => !s.official)
  return (
    <p className={[styles.credit, className ?? ''].filter(Boolean).join(' ')}>
      {commons ? (
        <span>
          Hand-seal line art:{' '}
          <a href="https://commons.wikimedia.org/wiki/User:Schlum" target="_blank" rel="noreferrer noopener">
            Schlum
          </a>{' '}
          / Wikimedia Commons,{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer noopener">
            CC BY-SA 4.0
          </a>
        </span>
      ) : null}
      {own ? <span>Custom palm pose drawn by SHINOBI AI from a recorded hand pose</span> : null}
    </p>
  )
}

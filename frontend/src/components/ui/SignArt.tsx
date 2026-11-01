import { Hand } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import styles from './SignArt.module.css'

export interface SignArtProps {
  /** line-art URL (black lines on white), e.g. catalog.signs[sign].art */
  src: string
  alt: string
  /** colour of the lines (any CSS colour; default: soft white) */
  tint?: string
  /** soft glow around the lines (for larger tiles) */
  glow?: boolean
  className?: string
}

/**
 * A hand-sign drawing on a dark tile. The source PNGs are black lines on white; they are inverted
 * and screen-blended so only the (tinted) lines show on the dark UI.
 */
export function SignArt({ src, alt, tint, glow = false, className }: SignArtProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const failed = failedSrc === src
  return (
    <div
      className={[styles.tile, className ?? ''].filter(Boolean).join(' ')}
      style={tint ? ({ '--tint': tint } as CSSProperties) : undefined}
    >
      {failed ? (
        <div className={styles.missing} role="img" aria-label={`${alt} (drawing unavailable)`}>
          <Hand aria-hidden="true" />
        </div>
      ) : (
        <div className={styles.art}>
          {glow ? <img className={styles.halo} src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" /> : null}
          <img
            className={styles.lines}
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            onError={() => setFailedSrc(src)}
          />
          <span className={styles.tinter} aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

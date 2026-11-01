// The one jutsu icon of the site (the Home and Live jutsu lists, the sequence header, the Jutsu and
// Practice carousels, the banner on the camera): a round window with a glowing energy ring in the
// jutsu's colour and its animated art inside: the approved Shadow Clone scene (ShadowCloneIcon) or the
// Fire Style / Chidori / Rasengan motifs (JutsuMotif, their animations unchanged).
import type { CSSProperties } from 'react'
import { JutsuMotif } from './JutsuMotif'
import { ShadowCloneIcon } from './ShadowCloneIcon'
import { jutsuVisual } from './jutsuVisuals'
import styles from './JutsuIcon.module.css'

export interface JutsuIconProps {
  /** jutsu id from the catalog */
  jutsu: string
  /** CSS size (default: fill the parent) */
  size?: number | string
  /** animate (always respects the animation preference) */
  animated?: boolean
  className?: string
}

export function JutsuIcon({ jutsu, size = '100%', animated = true, className }: JutsuIconProps) {
  const visual = jutsuVisual(jutsu)
  const style = { '--ring': visual.ring, '--ring-hot': visual.ringHot, width: size, height: size } as CSSProperties
  return (
    <span
      className={[styles.icon, animated ? styles.animated : '', className ?? ''].filter(Boolean).join(' ')}
      style={style}
      data-jutsu-icon={jutsu}
      aria-hidden="true"
    >
      <span className={styles.disc}>
        {jutsu === 'shadow_clone' ? (
          <ShadowCloneIcon animated={animated} />
        ) : (
          <JutsuMotif kind={visual.motif} color={visual.color} color2={visual.color2} size="84%" animated={animated} />
        )}
      </span>
      <svg className={styles.ring} viewBox="0 0 100 100" focusable="false">
        <circle className={styles.glow} cx="50" cy="50" r="45" />
        <circle className={styles.band} cx="50" cy="50" r="47.4" />
        <circle className={styles.core} cx="50" cy="50" r="47.4" />
        <g className={styles.spinBack}>
          <circle className={styles.ticks} cx="50" cy="50" r="44" />
        </g>
        <g className={styles.spin}>
          <circle className={styles.arcs} cx="50" cy="50" r="47.4" />
        </g>
      </svg>
    </span>
  )
}

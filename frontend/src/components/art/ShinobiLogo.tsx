// The SHINOBI AI mark: four swept blades (the four steps of a sequence) around a chakra core.
// Original artwork, drawn here; also used for public/favicon.svg.
import { useId } from 'react'
import styles from './ShinobiLogo.module.css'

const BLADE = 'M32 2.5C35.6 10.4 38.6 17.6 39.4 24.6L32 32L25.8 25.2C28.4 17.8 30.3 10 32 2.5Z'

export interface ShinobiMarkProps {
  size?: number
  className?: string
  /** slowly spin the blades (respects the animation preference through CSS) */
  spin?: boolean
}

export function ShinobiMark({ size = 36, className, spin = false }: ShinobiMarkProps) {
  const id = useId().replace(/:/g, '')
  const gradient = `logo-gradient-${id}`
  const core = `logo-core-${id}`
  return (
    <svg
      className={[styles.mark, spin ? styles.spin : '', className ?? ''].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradient} x1="8" y1="56" x2="56" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'var(--accent-3)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--accent)' }} />
          <stop offset="1" style={{ stopColor: 'var(--accent-2)' }} />
        </linearGradient>
        <radialGradient id={core} cx="32" cy="32" r="9" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.45" style={{ stopColor: 'var(--accent-2)' }} />
          <stop offset="1" style={{ stopColor: 'var(--accent)' }} />
        </radialGradient>
      </defs>
      <g className={styles.blades}>
        {[0, 90, 180, 270].map((angle) => (
          <path key={angle} d={BLADE} fill={`url(#${gradient})`} transform={`rotate(${angle} 32 32)`} />
        ))}
      </g>
      <circle cx="32" cy="32" r="8.6" fill="var(--bg-0)" />
      <circle cx="32" cy="32" r="8.6" fill="none" stroke={`url(#${gradient})`} strokeWidth="2.2" />
      <circle cx="32" cy="32" r="3.6" fill={`url(#${core})`} />
    </svg>
  )
}

export interface ShinobiLogoProps {
  /** height of the mark in px */
  size?: number
  className?: string
  /** hide the wordmark (mark only) */
  markOnly?: boolean
}

export function ShinobiLogo({ size = 34, className, markOnly = false }: ShinobiLogoProps) {
  return (
    <span className={[styles.logo, className ?? ''].filter(Boolean).join(' ')}>
      <ShinobiMark size={size} />
      {markOnly ? (
        <span className="visually-hidden">SHINOBI AI</span>
      ) : (
        <span className={styles.word} style={{ fontSize: size * 0.82 }}>
          SHINOBI<span className={styles.ai}>AI</span>
        </span>
      )}
    </span>
  )
}

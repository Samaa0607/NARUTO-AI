// Small original motifs, one per jutsu: flames (Fire Style), lightning (Chidori), a spinning chakra
// sphere (Rasengan) and smoke puffs (Shadow Clone). Colours come from the --jutsu-* tokens.
import { useId, type CSSProperties } from 'react'
import styles from './JutsuMotif.module.css'

export type MotifKind = 'fire' | 'lightning' | 'sphere' | 'smoke'

export interface JutsuMotifProps {
  kind: MotifKind
  /** main colour (CSS colour or var()) */
  color: string
  /** secondary colour (default: a light tone of the main colour) */
  color2?: string
  size?: number | string
  /** animate (always respects the animation preference) */
  animated?: boolean
  className?: string
}

function Fire({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-outer`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--m-c)' }} stopOpacity="0.95" />
          <stop offset="0.7" style={{ stopColor: 'var(--m-c)' }} stopOpacity="0.55" />
          <stop offset="1" style={{ stopColor: 'var(--m-c2)' }} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-inner`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.45" style={{ stopColor: 'var(--m-c2)' }} />
          <stop offset="1" style={{ stopColor: 'var(--m-c)' }} stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.8" r="0.6">
          <stop offset="0" style={{ stopColor: 'var(--m-c)' }} stopOpacity="0.55" />
          <stop offset="1" style={{ stopColor: 'var(--m-c)' }} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="92" rx="54" ry="30" fill={`url(#${id}-glow)`} />
      <g className={styles.flameOuter}>
        <path
          d="M60 114C30 111 19 86 31 64C37 53 36 41 45 28C47 42 54 47 57 39C61 27 57 16 64 5C71 22 85 33 86 52C89 43 94 40 97 35C106 59 101 109 60 114Z"
          fill={`url(#${id}-outer)`}
        />
      </g>
      <g className={styles.flameInner}>
        <path
          d="M60 112C43 110 36 95 43 81C47 73 47 64 53 55C55 64 59 66 61 60C64 51 62 44 66 36C72 50 80 58 80 72C82 67 85 65 86 62C92 79 86 110 60 112Z"
          fill={`url(#${id}-inner)`}
        />
      </g>
      <g className={styles.embers}>
        <circle cx="36" cy="44" r="1.8" style={{ fill: 'var(--m-c2)' }} />
        <circle cx="88" cy="30" r="1.4" style={{ fill: 'var(--m-c2)' }} />
        <circle cx="74" cy="16" r="1.2" style={{ fill: 'var(--m-c)' }} />
      </g>
    </>
  )
}

const BOLTS = [
  'M60 62L72 52L69 44L84 33L82 25L99 12',
  'M60 62L48 50L52 42L38 34L41 25L26 15',
  'M60 62L76 68L84 62L96 72L106 68',
  'M60 62L44 70L36 64L24 74L13 70',
  'M60 62L63 78L56 86L62 98L56 110',
]

function Lightning({ id }: { id: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}-core`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.3" style={{ stopColor: 'var(--m-c2)' }} stopOpacity="0.9" />
          <stop offset="1" style={{ stopColor: 'var(--m-c)' }} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="62" r="40" fill={`url(#${id}-core)`} opacity="0.55" className={styles.pulse} />
      {BOLTS.map((d, i) => (
        <g key={d} className={styles.bolt} style={{ animationDelay: `${i * -0.37}s` }}>
          <path d={d} fill="none" style={{ stroke: 'var(--m-c)' }} strokeWidth="5" strokeOpacity="0.35" strokeLinejoin="round" strokeLinecap="round" />
          <path d={d} fill="none" style={{ stroke: 'var(--m-c2)' }} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
          <path d={d} fill="none" stroke="#fff" strokeWidth="0.9" strokeLinejoin="round" strokeLinecap="round" />
        </g>
      ))}
      <circle cx="60" cy="62" r="9" fill="#fff" opacity="0.9" />
    </>
  )
}

function Sphere({ id }: { id: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}-ball`} cx="0.45" cy="0.42" r="0.55">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.35" style={{ stopColor: 'var(--m-c2)' }} />
          <stop offset="0.8" style={{ stopColor: 'var(--m-c)' }} stopOpacity="0.55" />
          <stop offset="1" style={{ stopColor: 'var(--m-c)' }} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-arc`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" style={{ stopColor: 'var(--m-c)' }} stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="52" style={{ fill: 'var(--m-c)' }} opacity="0.08" />
      <g className={styles.ringSlow}>
        <circle cx="60" cy="60" r="50" fill="none" style={{ stroke: 'var(--m-c)' }} strokeOpacity="0.35" strokeDasharray="2 7" />
      </g>
      <circle cx="60" cy="60" r="36" fill={`url(#${id}-ball)`} />
      <g className={styles.swirl}>
        <path d="M60 22A38 38 0 0 1 98 60" fill="none" stroke={`url(#${id}-arc)`} strokeWidth="3.2" strokeLinecap="round" />
        <path d="M60 98A38 38 0 0 1 22 60" fill="none" stroke={`url(#${id}-arc)`} strokeWidth="3.2" strokeLinecap="round" />
        <path d="M33 37A33 33 0 0 1 80 31" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M87 83A33 33 0 0 1 40 89" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M44 52A18 18 0 0 1 70 46" fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M76 68A18 18 0 0 1 50 74" fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.4" strokeLinecap="round" />
      </g>
    </>
  )
}

const PUFFS: [number, number, number][] = [
  [38, 76, 18],
  [58, 64, 23],
  [82, 72, 19],
  [48, 90, 16],
  [72, 90, 17],
  [96, 86, 12],
  [24, 90, 11],
]

function Smoke() {
  return (
    <>
      <g className={styles.cloud}>
        {/* outline pass, then the fill on top: only the outer contour of the cloud stays visible */}
        {PUFFS.map(([cx, cy, r]) => (
          <circle key={`o${cx}${cy}`} cx={cx} cy={cy} r={r + 1.6} style={{ fill: 'var(--m-c)' }} opacity="0.75" />
        ))}
        {PUFFS.map(([cx, cy, r]) => (
          <circle key={`f${cx}${cy}`} cx={cx} cy={cy} r={r} fill="#0b0f1e" />
        ))}
        {PUFFS.map(([cx, cy, r]) => (
          <circle key={`t${cx}${cy}`} cx={cx} cy={cy} r={r} style={{ fill: 'var(--m-c)' }} opacity="0.1" />
        ))}
        <path d="M50 66a8 8 0 1 1 9 9" fill="none" style={{ stroke: 'var(--m-c)' }} strokeOpacity="0.8" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M80 76a6 6 0 1 1 6 7" fill="none" style={{ stroke: 'var(--m-c)' }} strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M36 82a5 5 0 1 0 6 -6" fill="none" style={{ stroke: 'var(--m-c)' }} strokeOpacity="0.6" strokeWidth="1.4" strokeLinecap="round" />
      </g>
      <g className={styles.puffA}>
        <circle cx="40" cy="40" r="7" fill="none" style={{ stroke: 'var(--m-c)' }} strokeOpacity="0.6" strokeWidth="1.4" />
      </g>
      <g className={styles.puffB}>
        <circle cx="86" cy="36" r="5" fill="none" style={{ stroke: 'var(--m-c)' }} strokeOpacity="0.5" strokeWidth="1.2" />
      </g>
      <g className={styles.puffC}>
        <circle cx="64" cy="26" r="4" fill="none" style={{ stroke: 'var(--m-c)' }} strokeOpacity="0.45" strokeWidth="1.2" />
      </g>
    </>
  )
}

export function JutsuMotif({ kind, color, color2, size = 120, animated = true, className }: JutsuMotifProps) {
  const id = `motif-${useId().replace(/:/g, '')}`
  const style = {
    '--m-c': color,
    '--m-c2': color2 ?? `color-mix(in srgb, ${color} 45%, white)`,
    width: size,
    height: size,
  } as CSSProperties
  return (
    <svg
      className={[styles.motif, animated ? styles.animated : '', className ?? ''].filter(Boolean).join(' ')}
      viewBox="0 0 120 120"
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {kind === 'fire' ? <Fire id={id} /> : null}
      {kind === 'lightning' ? <Lightning id={id} /> : null}
      {kind === 'sphere' ? <Sphere id={id} /> : null}
      {kind === 'smoke' ? <Smoke /> : null}
    </svg>
  )
}

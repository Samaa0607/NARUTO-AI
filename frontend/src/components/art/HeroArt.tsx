// The home-page artwork: a chakra seal circle (brush ring, tick ring, the twelve seals, four jutsu
// glyphs) around an energy core. Naruto mode: a spinning sphere of orange chakra; Sasuke mode: a
// crackling core of blue / violet lightning. Original art; no characters, no franchise symbols.
// Each moving layer is its own <svg> so the browser can rotate it on the compositor.
import type { ThemeId } from '../../contexts/ThemeContext'
import { lightningBolt, seededRandom, type Point } from './particles'
import styles from './HeroArt.module.css'

const VIEW = '-300 -300 600 600'
const toPath = (points: readonly Point[]) =>
  points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')

const polar = (r: number, deg: number): Point => {
  const a = (deg * Math.PI) / 180
  return [r * Math.cos(a), r * Math.sin(a)]
}

const arc = (r: number, from: number, sweep: number) => {
  const [x0, y0] = polar(r, from)
  const [x1, y1] = polar(r, from + sweep)
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
}

// deterministic lightning for the Sasuke core
const BOLTS = (() => {
  const rand = seededRandom(11)
  return Array.from({ length: 7 }, (_, i) => {
    const angle = (i / 7) * Math.PI * 2 + rand() * 0.6
    const length = 150 + rand() * 80
    const bolt = lightningBolt(
      Math.cos(angle) * 34,
      Math.sin(angle) * 34,
      Math.cos(angle) * length,
      Math.sin(angle) * length,
      rand,
      4,
    )
    return [bolt.main, ...bolt.branches].map(toPath).join('')
  })
})()

const TICKS = Array.from({ length: 72 }, (_, i) => {
  const major = i % 6 === 0
  const [x0, y0] = polar(major ? 220 : 227, i * 5)
  const [x1, y1] = polar(236, i * 5)
  return { major, d: `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}` }
})

const SEALS = Array.from({ length: 12 }, (_, i) => ({ at: polar(186, i * 30 - 90), lit: i % 3 === 0, angle: i * 30 }))
const GLYPHS: { glyph: string; deg: number }[] = [
  { glyph: '火', deg: -45 },
  { glyph: '雷', deg: 45 },
  { glyph: '螺', deg: 135 },
  { glyph: '影', deg: 225 },
]

const SWIRLS = Array.from({ length: 6 }, (_, k) => ({
  d: arc(40 + k * 9.5, k * 67, 120 + (k % 3) * 18),
  width: 5.2 - k * 0.55,
  opacity: 0.95 - k * 0.09,
}))

export interface HeroArtProps {
  theme: ThemeId
  className?: string
}

export function HeroArt({ theme, className }: HeroArtProps) {
  return (
    <div className={[styles.art, className ?? ''].filter(Boolean).join(' ')} data-variant={theme} aria-hidden="true">
      <div className={styles.aura} />

      {/* ink-brush ring */}
      <svg className={`${styles.layer} ${styles.enso}`} viewBox={VIEW}>
        <defs>
          <filter id="hero-brush" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.032" numOctaves="3" seed="4" />
            <feDisplacementMap in="SourceGraphic" scale="16" />
          </filter>
        </defs>
        <g filter="url(#hero-brush)">
          <path d={arc(262, 122, 322)} className={styles.brushThick} />
          <path d={arc(272, 150, 250)} className={styles.brushThin} />
        </g>
      </svg>

      {/* tick ring, inscription and the twelve seals */}
      <svg className={`${styles.layer} ${styles.ring}`} viewBox={VIEW}>
        <defs>
          <path id="hero-inscription" d="M0 -208A208 208 0 1 1 -0.01 -208" />
        </defs>
        <circle r="236" className={styles.hair} />
        {TICKS.map((t) => (
          <path key={t.d} d={t.d} className={t.major ? styles.tickMajor : styles.tick} />
        ))}
        <text className={styles.inscription}>
          <textPath href="#hero-inscription">
            SHINOBI AI · HAND SEAL RECOGNITION · FOUR SEALS · ONE JUTSU · SHINOBI AI · HAND SEAL RECOGNITION · FOUR
            SEALS · ONE JUTSU ·
          </textPath>
        </text>
        <circle r="186" className={styles.hairDim} />
        {SEALS.map(({ at, lit, angle }) => (
          <rect
            key={angle}
            x={at[0] - 5}
            y={at[1] - 5}
            width="10"
            height="10"
            transform={`rotate(45 ${at[0]} ${at[1]})`}
            className={lit ? styles.sealLit : styles.seal}
          />
        ))}
      </svg>

      {/* the four jutsu glyphs, turning the other way */}
      <svg className={`${styles.layer} ${styles.glyphs}`} viewBox={VIEW}>
        {GLYPHS.map(({ glyph, deg }) => {
          const [x, y] = polar(150, deg)
          return (
            <text key={glyph} x={x} y={y} className={styles.glyph} textAnchor="middle" dominantBaseline="central">
              {glyph}
            </text>
          )
        })}
        <circle r="120" className={styles.hairDim} strokeDasharray="1 9" />
      </svg>

      {/* energy arcs */}
      <svg className={`${styles.layer} ${styles.arcs}`} viewBox={VIEW}>
        <defs>
          <linearGradient id="hero-arc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--accent-2)' }} />
            <stop offset="1" style={{ stopColor: 'var(--accent)' }} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={arc(130, -30, 140)} className={styles.energy} stroke="url(#hero-arc)" />
        <path d={arc(130, 150, 140)} className={styles.energy} stroke="url(#hero-arc)" />
      </svg>

      {/* Naruto: chakra sphere */}
      <div className={`${styles.core} ${styles.naruto}`}>
        <div className={styles.orb} />
        <svg className={`${styles.layer} ${styles.swirl}`} viewBox={VIEW}>
          {SWIRLS.map((s) => (
            <path
              key={s.d}
              d={s.d}
              className={styles.swirlArc}
              style={{ strokeWidth: s.width, opacity: s.opacity }}
            />
          ))}
        </svg>
        <svg className={`${styles.layer} ${styles.wind}`} viewBox={VIEW}>
          <path d={arc(104, 20, 150)} className={styles.windArc} />
          <path d={arc(112, 200, 120)} className={styles.windArc} />
          <path d={arc(96, 260, 70)} className={styles.windArc} />
        </svg>
      </div>

      {/* Sasuke: lightning core */}
      <div className={`${styles.core} ${styles.sasuke}`}>
        <div className={styles.volt} />
        <svg className={`${styles.layer} ${styles.bolts}`} viewBox={VIEW}>
          {BOLTS.map((d, i) => (
            <g key={d} className={styles.boltGroup} style={{ animationDelay: `${(i * -0.53).toFixed(2)}s` }}>
              <path d={d} className={styles.boltGlow} />
              <path d={d} className={styles.boltLine} />
              <path d={d} className={styles.boltCore} />
            </g>
          ))}
        </svg>
        <svg className={`${styles.layer} ${styles.crackle}`} viewBox={VIEW}>
          <circle r="92" className={styles.crackleRing} />
        </svg>
      </div>
    </div>
  )
}

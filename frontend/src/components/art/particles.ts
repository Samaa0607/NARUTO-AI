// Pure simulation for the ambient chakra particle field (no DOM: unit-tested in particles.test.ts).
// Naruto mode: warm embers that rise and flicker. Sasuke mode: cold electric motes that drift,
// plus rare, faint lightning strikes.

export type FieldTheme = 'naruto' | 'sasuke'
export type FieldMotion = 'full' | 'reduced' | 'off'
export type Rgb = readonly [number, number, number]
export type Rand = () => number

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  /** radius of the glow sprite in CSS pixels */
  size: number
  /** seconds alive / seconds to live */
  age: number
  ttl: number
  /** index into the theme palette */
  color: number
  /** peak opacity */
  alpha: number
  /** phase and speed of the sideways sway / flicker */
  phase: number
  sway: number
  /** large, soft, slow particle (bokeh) */
  wisp: boolean
}

export interface ThemeProfile {
  colors: readonly Rgb[]
  /** px / s, negative = upwards */
  rise: readonly [number, number]
  drift: number
  flicker: number
  lightning: boolean
}

export const PROFILES: Record<FieldTheme, ThemeProfile> = {
  naruto: {
    colors: [
      [255, 122, 24],
      [255, 194, 61],
      [255, 84, 10],
      [255, 216, 140],
    ],
    rise: [-46, -14],
    drift: 10,
    flicker: 0.45,
    lightning: false,
  },
  sasuke: {
    colors: [
      [75, 147, 255],
      [164, 107, 255],
      [34, 216, 255],
      [205, 220, 255],
    ],
    rise: [-16, -2],
    drift: 16,
    flicker: 0.8,
    lightning: true,
  },
}

/** How many particles for a viewport of this size (CSS pixels). */
export function particleCount(width: number, height: number, motion: FieldMotion): number {
  const area = Math.max(0, width) * Math.max(0, height)
  const base = Math.round(area / 15000) // ~86 on 1440x900
  const scaled = motion === 'full' ? base : Math.round(base * 0.45)
  return Math.max(motion === 'full' ? 18 : 10, Math.min(motion === 'full' ? 120 : 55, scaled))
}

const between = (rand: Rand, a: number, b: number) => a + (b - a) * rand()

/** A new particle. `scatter` = place it anywhere (first frame) instead of entering from below. */
export function spawnParticle(theme: FieldTheme, width: number, height: number, rand: Rand, scatter = false): Particle {
  const profile = PROFILES[theme]
  const wisp = rand() < 0.07
  const vy = between(rand, profile.rise[0], profile.rise[1]) * (wisp ? 0.4 : 1)
  return {
    x: between(rand, 0, width),
    y: scatter ? between(rand, 0, height) : height + between(rand, 4, 40),
    vx: between(rand, -profile.drift, profile.drift) * (wisp ? 0.5 : 1),
    vy,
    size: wisp ? between(rand, 26, 70) : between(rand, 1.2, 3.4),
    age: scatter ? between(rand, 0, 6) : 0,
    ttl: wisp ? between(rand, 14, 24) : between(rand, 7, 16),
    color: Math.floor(rand() * profile.colors.length) % profile.colors.length,
    alpha: wisp ? between(rand, 0.05, 0.12) : between(rand, 0.35, 0.9),
    phase: between(rand, 0, Math.PI * 2),
    sway: between(rand, 0.3, 1.1),
    wisp,
  }
}

/** Advance one particle by dt seconds. Returns false when it should be replaced. */
export function stepParticle(p: Particle, dt: number, width: number, height: number, speed = 1): boolean {
  p.age += dt
  p.phase += dt * p.sway
  p.x += (p.vx + Math.sin(p.phase) * 8) * dt * speed
  p.y += p.vy * dt * speed
  if (p.age >= p.ttl) return false
  const margin = p.size * 2 + 40
  return p.x > -margin && p.x < width + margin && p.y > -margin && p.y < height + margin * 2
}

/** Current opacity: fade in, hold, fade out, with a theme-dependent flicker. */
export function particleOpacity(p: Particle, flicker: number): number {
  const life = Math.min(1, Math.max(0, p.age / p.ttl))
  const fadeIn = Math.min(1, life / 0.12)
  const fadeOut = Math.min(1, (1 - life) / 0.35)
  const twinkle = p.wisp ? 1 : 1 - flicker * 0.5 * (1 + Math.sin(p.phase * 5.3))
  return Math.max(0, p.alpha * fadeIn * fadeOut * twinkle)
}

export type Point = readonly [number, number]

export interface Bolt {
  main: Point[]
  branches: Point[][]
}

/** A jagged lightning path from (x0, y0) to (x1, y1) by midpoint displacement, plus a few forks. */
export function lightningBolt(x0: number, y0: number, x1: number, y1: number, rand: Rand, detail = 5): Bolt {
  let points: Point[] = [
    [x0, y0],
    [x1, y1],
  ]
  let offset = Math.hypot(x1 - x0, y1 - y0) * 0.22
  for (let level = 0; level < detail; level++) {
    const next: Point[] = [points[0]]
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = points[i]
      const [bx, by] = points[i + 1]
      const len = Math.hypot(bx - ax, by - ay) || 1
      // displace the midpoint along the segment's normal
      const nx = -(by - ay) / len
      const ny = (bx - ax) / len
      const d = (rand() * 2 - 1) * offset
      next.push([(ax + bx) / 2 + nx * d, (ay + by) / 2 + ny * d], points[i + 1])
    }
    points = next
    offset /= 2
  }
  const branches: Point[][] = []
  for (let i = 2; i < points.length - 3; i++) {
    if (rand() > 0.1 || branches.length >= 3) continue
    const [sx, sy] = points[i]
    const angle = Math.atan2(y1 - y0, x1 - x0) + (rand() < 0.5 ? -1 : 1) * between(rand, 0.4, 0.9)
    const length = Math.hypot(x1 - x0, y1 - y0) * between(rand, 0.12, 0.3)
    branches.push(lightningBolt(sx, sy, sx + Math.cos(angle) * length, sy + Math.sin(angle) * length, rand, 3).main)
  }
  return { main: points, branches }
}

/** Small deterministic PRNG (mulberry32) for tests and repeatable art. */
export function seededRandom(seed: number): Rand {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

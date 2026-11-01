// Canvas layer of chakra particles (embers / electric motes, plus faint lightning in Sasuke mode).
// Pauses when the tab is hidden or the canvas is off-screen; draws one still frame when motion is off.
import { useEffect, useRef } from 'react'
import {
  PROFILES,
  lightningBolt,
  particleCount,
  particleOpacity,
  spawnParticle,
  stepParticle,
  type Bolt,
  type FieldMotion,
  type FieldTheme,
  type Particle,
  type Point,
} from './particles'

export interface ParticleFieldProps {
  theme: FieldTheme
  motion: FieldMotion
  className?: string
}

interface Strike {
  bolt: Bolt
  age: number
}

const STRIKE_LIFE = 0.5

/** opacity of a lightning strike over its short life: two quick flashes, then a fade */
function strikeAlpha(age: number): number {
  if (age < 0.06) return 1
  if (age < 0.13) return 0.25
  if (age < 0.2) return 0.85
  return Math.max(0, 1 - (age - 0.2) / (STRIKE_LIFE - 0.2)) * 0.85
}

function makeSprite([r, g, b]: readonly [number, number, number]): HTMLCanvasElement {
  const size = 64
  const sprite = document.createElement('canvas')
  sprite.width = size
  sprite.height = size
  const ctx = sprite.getContext('2d')
  if (!ctx) return sprite
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, `rgba(255, 255, 255, 1)`)
  gradient.addColorStop(0.12, `rgba(${r}, ${g}, ${b}, 0.95)`)
  gradient.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, 0.28)`)
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return sprite
}

function strokePath(ctx: CanvasRenderingContext2D, points: readonly Point[]) {
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1])
  ctx.stroke()
}

export function ParticleField({ theme, motion, className }: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const themeRef = useRef<FieldTheme>(theme)
  const redrawRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    themeRef.current = theme
    redrawRef.current?.()
  }, [theme])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const rand = Math.random
    const sprites = new Map<string, HTMLCanvasElement>()
    const sprite = (t: FieldTheme, index: number) => {
      const key = `${t}:${index}`
      let s = sprites.get(key)
      if (!s) {
        s = makeSprite(PROFILES[t].colors[index % PROFILES[t].colors.length])
        sprites.set(key, s)
      }
      return s
    }

    let width = 0
    let height = 0
    let particles: Particle[] = []
    let strikes: Strike[] = []
    let nextStrike = 4 + rand() * 5
    let frame = 0
    let last = 0
    let onScreen = true
    const animated = motion !== 'off'
    const speed = motion === 'full' ? 1 : 0.5

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const target = particleCount(width, height, motion === 'off' ? 'reduced' : motion)
      if (particles.length > target) particles = particles.slice(0, target)
      while (particles.length < target) particles.push(spawnParticle(themeRef.current, width, height, rand, true))
    }

    const draw = () => {
      const t = themeRef.current
      const profile = PROFILES[t]
      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'
      for (const p of particles) {
        const alpha = particleOpacity(p, animated ? profile.flicker : 0)
        if (alpha < 0.01) continue
        const radius = p.wisp ? p.size : p.size * 3.4
        ctx.globalAlpha = alpha
        ctx.drawImage(sprite(t, p.color), p.x - radius, p.y - radius, radius * 2, radius * 2)
      }
      ctx.globalAlpha = 1
      for (const s of strikes) {
        const a = strikeAlpha(s.age)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        const passes: [string, number][] = [
          [`rgba(110, 150, 255, ${0.16 * a})`, 9],
          [`rgba(170, 140, 255, ${0.28 * a})`, 3.5],
          [`rgba(235, 242, 255, ${0.55 * a})`, 1.2],
        ]
        for (const [color, lineWidth] of passes) {
          ctx.strokeStyle = color
          ctx.lineWidth = lineWidth
          strokePath(ctx, s.bolt.main)
          ctx.lineWidth = lineWidth * 0.55
          for (const branch of s.bolt.branches) strokePath(ctx, branch)
        }
      }
      ctx.globalCompositeOperation = 'source-over'
    }

    const update = (dt: number) => {
      const t = themeRef.current
      for (let i = 0; i < particles.length; i++) {
        if (!stepParticle(particles[i], dt, width, height, speed)) particles[i] = spawnParticle(t, width, height, rand)
      }
      if (motion === 'full' && PROFILES[t].lightning) {
        nextStrike -= dt
        if (nextStrike <= 0) {
          nextStrike = 7 + rand() * 7
          const x0 = width * (0.1 + rand() * 0.8)
          const x1 = x0 + (rand() - 0.5) * width * 0.35
          strikes.push({ bolt: lightningBolt(x0, -10, x1, height * (0.3 + rand() * 0.35), rand), age: 0 })
        }
      }
      strikes = strikes.filter((s) => (s.age += dt) < STRIKE_LIFE)
    }

    // reduced motion: 30 frames per second are plenty for slow drifting motes
    const minFrameMs = motion === 'full' ? 0 : 1000 / 30 - 2
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (last && now - last < minFrameMs) return
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      last = now
      update(dt)
      draw()
    }

    const running = () => animated && onScreen && document.visibilityState === 'visible'
    const sync = () => {
      if (running() && !frame) {
        last = 0
        frame = requestAnimationFrame(tick)
      } else if (!running() && frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
    }

    resize()
    draw()
    redrawRef.current = () => {
      if (!animated) draw()
    }

    const resizeObserver = new ResizeObserver(() => {
      resize()
      draw()
    })
    resizeObserver.observe(canvas)
    const intersection = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting)
      sync()
    })
    intersection.observe(canvas)
    document.addEventListener('visibilitychange', sync)
    sync()

    return () => {
      cancelAnimationFrame(frame)
      frame = 0
      resizeObserver.disconnect()
      intersection.disconnect()
      document.removeEventListener('visibilitychange', sync)
      redrawRef.current = null
    }
  }, [motion])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}

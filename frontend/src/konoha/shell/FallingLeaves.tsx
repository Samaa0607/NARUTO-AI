// A few orange leaves drifting slowly down over the village background (canvas, decorative).
// Only runs with animations at 'full'; pauses while the tab is hidden.
import { useEffect, useRef } from 'react'

interface Leaf {
  /** centre line of the sway */
  x: number
  y: number
  size: number
  /** fall speed, px/s */
  fall: number
  /** sideways drift, px/s */
  drift: number
  swayAmp: number
  swaySpeed: number
  phase: number
  angle: number
  spin: number
  /** speed of the 3D "flip" (horizontal squash) */
  flip: number
  flipPhase: number
  sprite: number
  alpha: number
}

// warm Naruto oranges, from deep red-orange to soft apricot
const COLORS: readonly [string, string][] = [
  ['#e8541a', '#a8360c'],
  ['#f27a2e', '#b5480f'],
  ['#f59a4a', '#c0601d'],
  ['#d9461c', '#922b0a'],
]

const SPRITE = 64

/** one almond-shaped leaf with a midrib and a few veins, pointing up, on a 64px canvas */
function makeSprite([fill, vein]: readonly [string, string]): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = SPRITE
  c.height = SPRITE
  const ctx = c.getContext('2d')
  if (!ctx) return c
  ctx.translate(SPRITE / 2, SPRITE / 2)
  const h = SPRITE * 0.44
  const w = SPRITE * 0.22
  ctx.beginPath()
  ctx.moveTo(0, -h)
  ctx.bezierCurveTo(w * 1.25, -h * 0.45, w * 1.05, h * 0.45, 0, h * 0.82)
  ctx.bezierCurveTo(-w * 0.95, h * 0.4, -w * 1.3, -h * 0.4, 0, -h)
  ctx.closePath()
  const g = ctx.createLinearGradient(-w, -h, w, h)
  g.addColorStop(0, fill)
  g.addColorStop(1, vein)
  ctx.fillStyle = g
  ctx.fill()
  // midrib + stem
  ctx.strokeStyle = vein
  ctx.globalAlpha = 0.75
  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, -h * 0.82)
  ctx.quadraticCurveTo(w * 0.12, 0, 0, h * 1.02)
  ctx.stroke()
  // side veins
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.5
  for (const t of [-0.45, -0.1, 0.25]) {
    const y = h * t
    ctx.beginPath()
    ctx.moveTo(0, y + 6)
    ctx.lineTo(w * 0.7, y - 2)
    ctx.moveTo(0, y + 9)
    ctx.lineTo(-w * 0.65, y + 1)
    ctx.stroke()
  }
  return c
}

const rand = (min: number, max: number) => min + Math.random() * (max - min)

function spawn(width: number, height: number, anywhere: boolean): Leaf {
  return {
    x: rand(-20, width + 20),
    y: anywhere ? rand(-40, height) : rand(-90, -30),
    size: rand(14, 26),
    fall: rand(16, 34),
    drift: rand(4, 14),
    swayAmp: rand(18, 46),
    swaySpeed: rand(0.35, 0.8),
    phase: rand(0, Math.PI * 2),
    angle: rand(0, Math.PI * 2),
    spin: rand(-0.6, 0.6),
    flip: rand(0.5, 1.4),
    flipPhase: rand(0, Math.PI * 2),
    sprite: Math.floor(Math.random() * COLORS.length),
    alpha: rand(0.7, 0.92),
  }
}

/** few leaves: about one per 150k px², between 4 and 12 */
function leafCount(width: number, height: number): number {
  return Math.max(4, Math.min(12, Math.round((width * height) / 150_000)))
}

export function FallingLeaves({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const sprites = COLORS.map(makeSprite)
    let width = 0
    let height = 0
    let leaves: Leaf[] = []
    let frame = 0
    let last = 0
    let clock = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(1, window.innerWidth)
      height = Math.max(1, window.innerHeight)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const target = leafCount(width, height)
      if (leaves.length > target) leaves = leaves.slice(0, target)
      while (leaves.length < target) leaves.push(spawn(width, height, true))
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      for (const leaf of leaves) {
        const x = leaf.x + Math.sin(clock * leaf.swaySpeed + leaf.phase) * leaf.swayAmp
        const squash = 0.35 + 0.65 * Math.abs(Math.cos(clock * leaf.flip + leaf.flipPhase))
        ctx.save()
        ctx.globalAlpha = leaf.alpha
        ctx.translate(x, leaf.y)
        ctx.rotate(leaf.angle)
        ctx.scale(squash, 1)
        ctx.drawImage(sprites[leaf.sprite], -leaf.size, -leaf.size, leaf.size * 2, leaf.size * 2)
        ctx.restore()
      }
    }

    const step = (dt: number) => {
      clock += dt
      for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i]
        leaf.y += leaf.fall * dt
        leaf.x += leaf.drift * dt
        leaf.angle += leaf.spin * dt
        if (leaf.y > height + 50 || leaf.x > width + 80) leaves[i] = spawn(width, height, false)
      }
    }

    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      last = now
      step(dt)
      draw()
      frame = requestAnimationFrame(tick)
    }

    const start = () => {
      if (frame) return
      last = 0
      frame = requestAnimationFrame(tick)
    }
    const stop = () => {
      cancelAnimationFrame(frame)
      frame = 0
    }
    const onVisibility = () => (document.hidden ? stop() : start())

    resize()
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)
    if (!document.hidden) start()
    return () => {
      stop()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}

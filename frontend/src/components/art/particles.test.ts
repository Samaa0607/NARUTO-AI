import { describe, expect, it } from 'vitest'
import {
  PROFILES,
  lightningBolt,
  particleCount,
  particleOpacity,
  seededRandom,
  spawnParticle,
  stepParticle,
} from './particles'

describe('particleCount', () => {
  it('scales with the viewport and stays within limits', () => {
    expect(particleCount(1440, 900, 'full')).toBeGreaterThan(particleCount(390, 844, 'full'))
    expect(particleCount(10000, 10000, 'full')).toBe(120)
    expect(particleCount(0, 0, 'full')).toBe(18)
  })

  it('uses fewer particles for reduced motion', () => {
    expect(particleCount(1440, 900, 'reduced')).toBeLessThan(particleCount(1440, 900, 'full'))
    expect(particleCount(10000, 10000, 'reduced')).toBe(55)
  })
})

describe('particles', () => {
  it('spawn inside the field (scattered) or just below it (entering)', () => {
    const rand = seededRandom(1)
    for (let i = 0; i < 200; i++) {
      const scattered = spawnParticle('naruto', 800, 600, rand, true)
      expect(scattered.x).toBeGreaterThanOrEqual(0)
      expect(scattered.x).toBeLessThanOrEqual(800)
      expect(scattered.y).toBeGreaterThanOrEqual(0)
      expect(scattered.y).toBeLessThanOrEqual(600)
      const entering = spawnParticle('sasuke', 800, 600, rand)
      expect(entering.y).toBeGreaterThan(600)
      expect(entering.color).toBeLessThan(PROFILES.sasuke.colors.length)
    }
  })

  it('naruto embers rise', () => {
    const rand = seededRandom(2)
    const p = spawnParticle('naruto', 800, 600, rand, true)
    const y = p.y
    stepParticle(p, 0.5, 800, 600)
    expect(p.y).toBeLessThan(y)
  })

  it('die after their time to live', () => {
    const p = spawnParticle('naruto', 800, 600, seededRandom(3), true)
    p.age = p.ttl - 0.01
    expect(stepParticle(p, 0.05, 800, 600)).toBe(false)
  })

  it('fade in and out', () => {
    const p = spawnParticle('naruto', 800, 600, seededRandom(4))
    p.age = 0
    expect(particleOpacity(p, 0)).toBe(0)
    p.age = p.ttl * 0.5
    expect(particleOpacity(p, 0)).toBeCloseTo(p.alpha)
    p.age = p.ttl
    expect(particleOpacity(p, 0)).toBe(0)
  })
})

describe('lightningBolt', () => {
  it('runs from the start to the end point', () => {
    const bolt = lightningBolt(10, 20, 300, 400, seededRandom(5))
    expect(bolt.main[0]).toEqual([10, 20])
    expect(bolt.main[bolt.main.length - 1]).toEqual([300, 400])
    expect(bolt.main.length).toBe(2 ** 5 + 1)
    expect(bolt.branches.length).toBeLessThanOrEqual(3)
  })

  it('is deterministic for a given seed', () => {
    expect(lightningBolt(0, 0, 100, 100, seededRandom(9))).toEqual(lightningBolt(0, 0, 100, 100, seededRandom(9)))
  })
})

import { describe, expect, it } from 'vitest'
import { focusStep, nextCountdownAnchor, shownDone, stepStates } from './sequenceSteps'

describe('nextCountdownAnchor', () => {
  const at = (s: number) => s * 1000
  it('starts a new step from the backend value', () => {
    expect(nextCountdownAnchor(null, 7, at(0), 2, 0.4)).toEqual({ value: 7, at: 0, step: 2 })
    expect(nextCountdownAnchor({ value: 1, at: 0, step: 1 }, 7, at(0.1), 2, 0.4)).toEqual({ value: 7, at: 100, step: 2 })
  })

  it('never goes up within a step because of frame jitter', () => {
    const a = nextCountdownAnchor({ value: 5, at: at(0), step: 2 }, 5.3, at(0.2), 2, 0.4)
    expect(a.value).toBeCloseTo(4.8)
  })

  it('jumps back up when the backend restarts the clock after a wrong attempt', () => {
    const a = nextCountdownAnchor({ value: 2, at: at(0), step: 2 }, 7, at(0.1), 2, 0.4)
    expect(a).toEqual({ value: 7, at: 100, step: 2 })
  })
})

describe('stepStates', () => {
  it('shows nothing as current while the AI is not live', () => {
    expect(stepStates(4, 0, false, false)).toEqual(['todo', 'todo', 'todo', 'todo'])
    expect(stepStates(4, 2, false, false)).toEqual(['done', 'done', 'todo', 'todo'])
  })

  it('marks the next step as current while live', () => {
    expect(stepStates(4, 0, true, false)).toEqual(['current', 'todo', 'todo', 'todo'])
    expect(stepStates(4, 3, true, false)).toEqual(['done', 'done', 'done', 'current'])
  })

  it('shows every step done after the jutsu event', () => {
    expect(stepStates(4, 0, true, true)).toEqual(['done', 'done', 'done', 'done'])
  })

  it('clamps out-of-range progress', () => {
    expect(stepStates(4, 9, true, false)).toEqual(['done', 'done', 'done', 'done'])
    expect(stepStates(4, -1, true, false)).toEqual(['current', 'todo', 'todo', 'todo'])
  })
})

describe('shownDone', () => {
  it('counts confirmed steps, or all of them once complete', () => {
    expect(shownDone(4, 2, false)).toBe(2)
    expect(shownDone(4, 0, true)).toBe(4)
    expect(shownDone(4, 7, false)).toBe(4)
  })
})

describe('focusStep', () => {
  it('zooms nothing before the backend has confirmed a sign', () => {
    expect(focusStep(4, 0, true, false)).toBeNull()
  })

  it('zooms the next sign after each confirmed step', () => {
    expect(focusStep(4, 1, true, false)).toBe(1)
    expect(focusStep(4, 2, true, false)).toBe(2)
    expect(focusStep(4, 3, true, false)).toBe(3)
  })

  it('zooms nothing when the AI is not live, after the jutsu fired, or past the last step', () => {
    expect(focusStep(4, 2, false, false)).toBeNull()
    expect(focusStep(4, 2, true, true)).toBeNull()
    expect(focusStep(4, 4, true, false)).toBeNull()
    expect(focusStep(4, 9, true, false)).toBeNull()
  })
})

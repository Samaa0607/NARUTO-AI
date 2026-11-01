import { describe, expect, it } from 'vitest'
import type { Catalog } from '../../types/catalog'
import { followFocus, timeoutNotice, wrongSignDetail, wrongSignTitle } from './labels'

const catalog = {
  signs: {
    horse: { id: 'horse', name: 'HORSE' },
    dog: { id: 'dog', name: 'DOG' },
    monkey: { id: 'monkey', name: 'MONKEY' },
  },
  jutsu: [{ id: 'fire_style', title: 'FIRE STYLE', steps: [{}, {}, {}, {}] }],
} as unknown as Catalog

describe('wrong sign texts (the progress is kept)', () => {
  it('names the sign that was expected and the one the AI saw', () => {
    expect(wrongSignTitle({ type: 'wrong_sign', jutsu: 'fire_style', step: 2, expected: 'horse', got: 'dog' }, catalog)).toBe(
      'HORSE not recognized — that looked like DOG',
    )
  })

  it('says the completed steps are kept and which step to try again', () => {
    expect(wrongSignDetail({ type: 'wrong_sign', jutsu: 'fire_style', step: 2, expected: 'horse', got: 'dog' }, catalog)).toBe(
      'Your 2 completed steps are kept. Try HORSE again (step 3 of 4).',
    )
    expect(wrongSignDetail({ type: 'wrong_sign', jutsu: 'fire_style', step: 1, expected: 'horse', got: 'dog' }, catalog)).toBe(
      'Your completed step is kept. Try HORSE again (step 2 of 4).',
    )
  })

  it('at step 0 says which sign the jutsu starts with', () => {
    expect(wrongSignDetail({ type: 'wrong_sign', jutsu: 'fire_style', step: 0, expected: 'monkey', got: 'dog' }, catalog)).toBe(
      'Fire Style starts with MONKEY. Try it again.',
    )
  })
})

describe('followFocus (the jutsu the sequence card shows)', () => {
  const order = ['fire_style', 'chidori', 'shadow_clone', 'rasengan'] as const

  it('stays on the jutsu being performed when a wrong sign starts another one (a tie)', () => {
    expect(followFocus('rasengan', { rasengan: 1, fire_style: 1 }, order)).toBe('rasengan')
    expect(followFocus('fire_style', { fire_style: 2, chidori: 2 }, order)).toBe('fire_style')
  })

  it('moves to another jutsu only when it has strictly more steps', () => {
    expect(followFocus('rasengan', { rasengan: 1, fire_style: 2 }, order)).toBe('fire_style')
  })

  it('goes to the jutsu in progress when the one shown has no steps', () => {
    expect(followFocus('fire_style', { chidori: 1 }, order)).toBe('chidori')
    expect(followFocus(null, { rasengan: 2 }, order)).toBe('rasengan')
  })

  it('keeps the current one when nothing is in progress', () => {
    expect(followFocus('chidori', {}, order)).toBe('chidori')
  })
})

describe('timeoutNotice', () => {
  it('says which sign came too late and where to start again', () => {
    const cat = {
      signs: { monkey: { name: 'MONKEY' }, boar: { name: 'BOAR' }, horse: { name: 'HORSE' } },
      jutsu: [{ id: 'fire_style', title: 'FIRE STYLE', steps: [{ sign: 'monkey' }, { sign: 'boar' }, { sign: 'horse' }, { sign: 'tiger' }] }],
    } as unknown as Catalog
    const note = timeoutNotice(
      { type: 'sequence_failed', reason: 'timeout', jutsu: 'fire_style', step: 2, expected: 'horse', got: null },
      cat,
      7,
    )
    expect(note.title).toBe('Time ran out — sequence reset.')
    expect(note.detail).toBe('HORSE was not shown within 7 s of BOAR. Start again with MONKEY.')
  })
})

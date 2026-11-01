// Visual identity of each jutsu (decoration only; names and texts come from the catalog).
import type { JutsuId } from '../../types/protocol'
import type { MotifKind } from './JutsuMotif'

export interface JutsuVisual {
  /** --jutsu-* colour */
  color: string
  /** lighter companion colour for gradients */
  color2: string
  motif: MotifKind
  /** one decorative kanji (the full name in kanji comes from the catalog) */
  glyph: string
  /** energy ring of the jutsu icon (JutsuIcon) and its bright core */
  ring: string
  ringHot: string
}

export const JUTSU_VISUALS: Record<JutsuId, JutsuVisual> = {
  fire_style: { color: 'var(--jutsu-fire)', color2: '#ffc23d', motif: 'fire', glyph: '火', ring: 'var(--jutsu-fire)', ringHot: '#ffd36b' },
  chidori: { color: 'var(--jutsu-chidori)', color2: '#cfe8ff', motif: 'lightning', glyph: '雷', ring: 'var(--jutsu-chidori)', ringHot: '#e8f7ff' },
  // the ring of the approved Shadow Clone art is Naruto's orange chakra
  shadow_clone: { color: 'var(--jutsu-clone)', color2: '#ffffff', motif: 'smoke', glyph: '影', ring: '#ff9a2e', ringHot: '#ffe27a' },
  rasengan: { color: 'var(--jutsu-rasengan)', color2: '#bfe0ff', motif: 'sphere', glyph: '螺', ring: 'var(--jutsu-rasengan)', ringHot: '#dcefff' },
}

const FALLBACK: JutsuVisual = {
  color: 'var(--accent)',
  color2: 'var(--accent-2)',
  motif: 'sphere',
  glyph: '忍',
  ring: 'var(--accent)',
  ringHot: '#ffffff',
}

export function jutsuVisual(id: string): JutsuVisual {
  return (JUTSU_VISUALS as Record<string, JutsuVisual>)[id] ?? FALLBACK
}
